import { InputError, RuntimeError } from "../errors.js";
import type { GitClient } from "./client.js";

export type SnapshotSpec =
  | { kind: "tree"; revision: string }
  | { kind: "index" }
  | { kind: "working"; includeUntracked: boolean };
export interface DiffSpec {
  base: SnapshotSpec;
  target: SnapshotSpec;
  mergeBase: boolean;
}
export interface DiffInput {
  target?: string | undefined;
  compareWith?: string | undefined;
  mergeBase?: boolean;
  includeUntracked?: boolean;
}

const revision = (value: string): SnapshotSpec => ({
  kind: "tree",
  revision: value === "@" ? "HEAD" : value,
});

export function parseDiffSpec(input: DiffInput = {}): DiffSpec {
  const { target = "HEAD", compareWith, mergeBase = false, includeUntracked = false } = input;
  for (const value of [target, compareWith]) {
    if (value !== undefined && (!value.trim() || value.includes("\0")))
      throw new InputError("Revision must be non-empty and contain no NUL");
  }
  if ((target === "staged" || target === "working") && compareWith !== undefined)
    throw new InputError(`${target} does not accept compare-with`);
  if (mergeBase && [".", "staged", "working"].includes(target))
    throw new InputError("--merge-base requires revision comparisons");
  if (includeUntracked && target !== "." && target !== "working")
    throw new InputError("--include-untracked requires . or working");
  if (target === "working")
    return { base: { kind: "index" }, target: { kind: "working", includeUntracked }, mergeBase };
  if (target === "staged") return { base: revision("HEAD"), target: { kind: "index" }, mergeBase };
  if (target === ".")
    return {
      base: revision(compareWith ?? "HEAD"),
      target: { kind: "working", includeUntracked },
      mergeBase,
    };
  const ref = target === "@" ? "HEAD" : target;
  return { base: revision(compareWith ?? `${ref}^`), target: revision(ref), mergeBase };
}

export const objectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

async function resolveRevision(
  git: GitClient,
  revision: string,
  type: "tree" | "commit",
): Promise<string> {
  try {
    const oid = (
      await git.run(["rev-parse", "--verify", "--end-of-options", `${revision}^{${type}}`])
    )
      .toString("utf8")
      .trim();
    if (!objectIdPattern.test(oid)) throw new RuntimeError("Invalid object ID from Git");
    return oid;
  } catch (cause) {
    throw new RuntimeError(
      `Cannot resolve local revision ${JSON.stringify(revision)} as ${type}. Fetch the required history first (for example: git fetch origin <branch> or git fetch --unshallow).`,
      { cause },
    );
  }
}

export async function resolveDiffSpec(git: GitClient, spec: DiffSpec): Promise<DiffSpec> {
  if (spec.mergeBase) {
    if (spec.base.kind !== "tree" || spec.target.kind !== "tree")
      throw new InputError("--merge-base requires revision comparisons");
    const base = await resolveRevision(git, spec.base.revision, "commit");
    const target = await resolveRevision(git, spec.target.revision, "commit");
    let ancestor: string;
    try {
      ancestor = (await git.run(["merge-base", target, base])).toString("utf8").trim();
      if (!objectIdPattern.test(ancestor)) throw new RuntimeError("Invalid merge base from Git");
    } catch (cause) {
      throw new RuntimeError(
        "No local merge base. Fetch the required history first (for example: git fetch origin <branch> or git fetch --unshallow).",
        { cause },
      );
    }
    return {
      base: revision(await resolveRevision(git, ancestor, "tree")),
      target: revision(await resolveRevision(git, target, "tree")),
      mergeBase: false,
    };
  }
  const resolve = async (side: SnapshotSpec): Promise<SnapshotSpec> =>
    side.kind === "tree" ? revision(await resolveRevision(git, side.revision, "tree")) : side;
  return { base: await resolve(spec.base), target: await resolve(spec.target), mergeBase: false };
}
