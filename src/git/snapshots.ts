import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { RuntimeError } from "../errors.js";
import type { GitClient } from "./client.js";
import { findRepository } from "./client.js";
import { gitPath, nulFields, readChanges } from "./changes.js";
import { objectIdPattern, parseDiffSpec, resolveDiffSpec } from "./diff-spec.js";
import type { DiffInput, SnapshotSpec } from "./diff-spec.js";
import { CatFileReader } from "./cat-file.js";

export interface SnapshotReader {
  readonly kind: SnapshotSpec["kind"];
  listFiles(): readonly string[];
  readFile(path: string): Promise<Buffer | undefined>;
}
interface Entry {
  path: string;
  oid: string;
  mode: string;
}
type Warn = (message: string) => void;
const isSource = (path: string) => /\.(?:[cm]?[tj]sx?)$/.test(path);
const missing = (error: unknown) =>
  error instanceof Error &&
  "code" in error &&
  (error.code === "ENOENT" || error.code === "ENOTDIR");

function parseEntries(buffer: Buffer, index: boolean): Entry[] {
  return nulFields(buffer).map((field) => {
    const tab = field.indexOf("\t");
    if (tab < 0) throw new RuntimeError("Invalid Git entry");
    const [mode, second, third] = field.slice(0, tab).split(" ");
    const oid = index ? second : third;
    if (
      !mode ||
      !/^(100644|100755|120000|160000)$/.test(mode) ||
      !oid ||
      !objectIdPattern.test(oid)
    )
      throw new RuntimeError("Invalid Git entry metadata");
    if (index && third !== "0")
      throw new RuntimeError("Index contains conflicts; resolve them before analysis");
    return { path: gitPath(field.slice(tab + 1)), mode, oid };
  });
}

async function indexEntries(git: GitClient): Promise<Entry[]> {
  return parseEntries(await git.run(["ls-files", "--stage", "--full-name", "-z"]), true);
}

function content(path: string, bytes: Buffer, warn: Warn): Buffer | undefined {
  if (
    bytes
      .subarray(0, 80)
      .toString("utf8")
      .startsWith("version https://git-lfs.github.com/spec/v1\n")
  ) {
    if (isSource(path)) warn(`Cannot analyze Git LFS pointer: ${JSON.stringify(path)}`);
    return undefined;
  }
  return bytes;
}

class BlobSnapshot implements SnapshotReader {
  private readonly entries: Map<string, Entry>;
  private readonly files: readonly string[];
  constructor(
    readonly kind: "tree" | "index",
    entries: Entry[],
    private readonly blobs: CatFileReader,
    private readonly warn: Warn,
  ) {
    this.entries = new Map(entries.map((entry) => [entry.path, entry]));
    this.files = Object.freeze([...this.entries.keys()].sort());
  }
  listFiles(): readonly string[] {
    return this.files;
  }
  fileMode(path: string): string | undefined {
    return this.entries.get(path)?.mode;
  }
  async readFile(path: string): Promise<Buffer | undefined> {
    const entry = this.entries.get(gitPath(path));
    if (!entry) return undefined;
    if (entry.mode === "160000" || entry.mode === "120000") {
      if (isSource(path))
        this.warn(
          `Cannot analyze ${entry.mode === "160000" ? "submodule" : "symbolic link"}: ${JSON.stringify(path)}`,
        );
      return undefined;
    }
    return content(path, await this.blobs.readBlob(entry.oid), this.warn);
  }
}

class WorkingSnapshot implements SnapshotReader {
  readonly kind = "working";
  private readonly paths: Set<string>;
  private readonly files: readonly string[];
  constructor(
    private readonly root: string,
    paths: string[],
    private readonly warn: Warn,
  ) {
    this.paths = new Set(paths);
    this.files = Object.freeze([...this.paths].sort());
  }
  listFiles(): readonly string[] {
    return this.files;
  }
  async readFile(path: string): Promise<Buffer | undefined> {
    gitPath(path);
    if (!this.paths.has(path)) return undefined;
    try {
      const absolute = resolve(this.root, path);
      const canonical = await realpath(absolute);
      const rel = relative(this.root, canonical);
      if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`))
        throw new RuntimeError(`File resolves outside repository: ${JSON.stringify(path)}`);
      const stat = await lstat(absolute);
      if (!stat.isFile()) {
        if (isSource(path)) this.warn(`Cannot analyze non-regular file: ${JSON.stringify(path)}`);
        return undefined;
      }
      return content(path, await readFile(absolute), this.warn);
    } catch (cause) {
      if (missing(cause)) return undefined;
      throw new RuntimeError(`Cannot read working tree file: ${JSON.stringify(path)}`, { cause });
    }
  }
}

export async function createSnapshot(
  git: GitClient,
  spec: SnapshotSpec,
  blobs: CatFileReader,
  warn: Warn,
): Promise<SnapshotReader> {
  if (spec.kind === "tree")
    return new BlobSnapshot(
      "tree",
      parseEntries(await git.run(["ls-tree", "-r", "-z", "--full-tree", spec.revision]), false),
      blobs,
      warn,
    );
  const entries = await indexEntries(git);
  if (spec.kind === "index") return new BlobSnapshot("index", entries, blobs, warn);
  const paths = entries.map((entry) => entry.path);
  if (spec.includeUntracked)
    paths.push(
      ...nulFields(await git.run(["ls-files", "--others", "--exclude-standard", "-z"])).map(
        gitPath,
      ),
    );
  const existing: string[] = [];
  for (const path of paths) {
    try {
      await lstat(resolve(git.root, path));
      existing.push(path);
    } catch (cause) {
      if (!missing(cause))
        throw new RuntimeError(`Cannot inspect working tree path: ${JSON.stringify(path)}`, {
          cause,
        });
    }
  }
  return new WorkingSnapshot(await realpath(git.root), existing, warn);
}

/** Owns the batch process; always close in a finally block (also after failed reads). */
export async function openComparison(cwd: string, input: DiffInput = {}, warn: Warn = () => {}) {
  const unresolved = parseDiffSpec(input);
  const git = await findRepository(cwd);
  const spec = await resolveDiffSpec(git, unresolved);
  const blobs = new CatFileReader(git);
  try {
    const base = await createSnapshot(git, spec.base, blobs, warn);
    const target = await createSnapshot(git, spec.target, blobs, warn);
    const basePaths = new Set(base.listFiles());
    const changes = await readChanges(git, spec, async (path) => {
      if (!basePaths.has(path)) return "added";
      const before = await base.readFile(path);
      const after = await target.readFile(path);
      if (before && after && before.equals(after) && base instanceof BlobSnapshot) {
        const stat = await lstat(resolve(git.root, path));
        const mode = stat.mode & 0o111 ? "100755" : "100644";
        if (stat.isFile() && (base.fileMode(path) === mode || process.platform === "win32"))
          return undefined;
      }
      return "modified";
    });
    return { root: git.root, spec, base, target, changes, close: () => blobs.close() };
  } catch (cause) {
    await blobs.close();
    throw cause;
  }
}
