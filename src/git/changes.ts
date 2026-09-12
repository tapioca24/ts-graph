import { posix } from "node:path";
import { RuntimeError } from "../errors.js";
import type { GitClient } from "./client.js";
import type { DiffSpec } from "./diff-spec.js";

export interface FileChange {
  path: string;
  status: "added" | "deleted" | "modified";
}
export interface RenameRelation {
  from: string;
  to: string;
}
export interface Changes {
  files: FileChange[];
  renames: RenameRelation[];
}

/** Git paths already use POSIX separators; literal backslashes must survive. */
export function gitPath(path: string): string {
  if (
    !path ||
    path.includes("\0") ||
    path.startsWith("/") ||
    (process.platform === "win32" && (path.includes("\\") || /^[a-z]:/i.test(path))) ||
    posix.normalize(path) !== path ||
    path === "." ||
    path === ".." ||
    path.startsWith("../")
  )
    throw new RuntimeError(`Invalid Git path: ${JSON.stringify(path)}`);
  return path;
}

export function nulFields(buffer: Buffer): string[] {
  if (buffer.length === 0) return [];
  if (buffer.at(-1) !== 0) throw new RuntimeError("Truncated NUL-delimited Git output");
  return buffer.toString("utf8").slice(0, -1).split("\0");
}

export function parseChanges(buffer: Buffer): Changes {
  const fields = nulFields(buffer);
  const files: FileChange[] = [];
  const renames: RenameRelation[] = [];
  for (let i = 0; i < fields.length;) {
    const status = fields[i++];
    const path = gitPath(fields[i++] ?? "");
    if (status && /^R\d{1,3}$/.test(status) && Number(status.slice(1)) <= 100) {
      const to = gitPath(fields[i++] ?? "");
      files.push({ path, status: "deleted" }, { path: to, status: "added" });
      renames.push({ from: path, to });
    } else if (
      status === "A" ||
      status === "D" ||
      status === "M" ||
      status === "T" ||
      (status && /^M\d{1,3}$/.test(status))
    ) {
      files.push({
        path,
        status: status === "A" ? "added" : status === "D" ? "deleted" : "modified",
      });
    } else
      throw new RuntimeError(
        `Unsupported Git change status: ${status ?? "missing"} (resolve index conflicts first)`,
      );
  }
  return sortChanges({ files, renames });
}

function sortChanges(changes: Changes): Changes {
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  changes.files.sort((a, b) => compare(a.path, b.path));
  changes.renames.sort((a, b) => compare(a.from, b.from) || compare(a.to, b.to));
  return changes;
}

export async function readChanges(
  git: GitClient,
  spec: DiffSpec,
  classifyUntracked: (path: string) => Promise<FileChange["status"] | undefined>,
): Promise<Changes> {
  const args = [
    "-c",
    "diff.renames=true",
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--ignore-submodules=none",
    "--name-status",
    "-z",
    "-M",
  ];
  if (spec.base.kind === "tree" && spec.target.kind === "tree")
    args.push(spec.base.revision, spec.target.revision);
  else if (spec.base.kind === "tree" && spec.target.kind === "index")
    args.push("--cached", spec.base.revision);
  else if (spec.base.kind === "tree" && spec.target.kind === "working")
    args.push(spec.base.revision);
  else if (spec.base.kind !== "index" || spec.target.kind !== "working")
    throw new RuntimeError("Unsupported resolved diff specification");
  args.push("--");
  const changes = parseChanges(await git.run(args));
  if (spec.target.kind === "working" && spec.target.includeUntracked) {
    // A staged deletion followed by an untracked recreation is modified vs HEAD,
    // but added vs index. Reconcile instead of producing duplicate file statuses.
    const byPath = new Map(changes.files.map((file) => [file.path, file]));
    for (const field of nulFields(
      await git.run(["ls-files", "--others", "--exclude-standard", "-z"]),
    )) {
      const path = gitPath(field);
      const status = await classifyUntracked(path);
      if (status) byPath.set(path, { path, status });
      else byPath.delete(path);
    }
    changes.files = [...byPath.values()];
  }
  return sortChanges(changes);
}
