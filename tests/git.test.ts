import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  realpath,
  rm,
  rename,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import { spawn } from "node:child_process";
import { afterEach, expect, it } from "vitest";
import { InputError, RuntimeError } from "../src/errors.js";
import { createGitClient, findRepository } from "../src/git/client.js";
import { parseDiffSpec } from "../src/git/diff-spec.js";
import { parseChanges } from "../src/git/changes.js";
import { openComparison } from "../src/git/snapshots.js";
import { CatFileReader } from "../src/git/cat-file.js";

it("reports mode-only changes, copies as additions, submodules and empty diffs", async () => {
  const { root, git, second, put, commit } = await repo();
  const empty = await openComparison(root, { target: "HEAD", compareWith: "HEAD" });
  try {
    expect(empty.changes).toEqual({ files: [], renames: [] });
  } finally {
    await empty.close();
  }
  await git.run(["update-index", "--chmod=+x", "a.ts"]);
  await git.run(["update-index", "--add", "--cacheinfo", `160000,${second},module.ts`]);
  const warnings: string[] = [];
  const staged = await openComparison(root, { target: "staged" }, (message) =>
    warnings.push(message),
  );
  try {
    expect(staged.changes.files).toContainEqual({ path: "a.ts", status: "modified" });
    expect(await staged.target.readFile("module.ts")).toBeUndefined();
    expect(warnings[0]).toMatch(/submodule/);
  } finally {
    await staged.close();
  }
  await git.run(["update-index", "--force-remove", "module.ts"]);
  await put("copy.ts", await readFile(join(root, "a.ts")));
  await commit();
  const copied = await openComparison(root);
  try {
    expect(copied.changes.files).toContainEqual({ path: "copy.ts", status: "added" });
    expect(copied.changes.renames).toEqual([]);
  } finally {
    await copied.close();
  }
});

it("excludes deleted working files and distinguishes recreated untracked files from the index", async () => {
  const { root, git, put } = await repo();
  await git.run(["rm", "a.ts"]);
  await put("a.ts", "recreated\n");
  await rm(join(root, "added.ts"));
  for (const target of [".", "working"]) {
    const comparison = await openComparison(root, { target, includeUntracked: true });
    try {
      expect(comparison.changes.files.filter((file) => file.path === "a.ts")).toEqual([
        { path: "a.ts", status: target === "." ? "modified" : "added" },
      ]);
      expect(comparison.target.listFiles()).not.toContain("added.ts");
      expect(await comparison.target.readFile("added.ts")).toBeUndefined();
    } finally {
      await comparison.close();
    }
  }
});

it("omits an untracked recreation identical to its base", async () => {
  const { root, git, put } = await repo();
  const original = await readFile(join(root, "a.ts"));
  await git.run(["rm", "a.ts"]);
  await put("a.ts", original);
  const comparison = await openComparison(root, { target: ".", includeUntracked: true });
  try {
    expect(comparison.changes.files).toEqual([]);
  } finally {
    await comparison.close();
  }
});

it("does not execute configured clean, process, diff or fsmonitor commands", async () => {
  const { root, git, put, commit } = await repo();
  await put(".gitattributes", "*.ts filter=unsafe diff=unsafe\n");
  await commit();
  for (const key of [
    "filter.unsafe.clean",
    "filter.unsafe.process",
    "diff.unsafe.command",
    "diff.unsafe.textconv",
    "core.fsmonitor",
  ]) {
    await git.run(["config", key, "echo executed > EXECUTED"]);
  }
  await git.run(["config", "filter.unsafe.required", "true"]);
  await put("a.ts", "new contents\n");
  const comparison = await openComparison(root, { target: "." });
  try {
    expect(comparison.changes.files).toContainEqual({ path: "a.ts", status: "modified" });
  } finally {
    await comparison.close();
  }
  await expect(readFile(join(root, "EXECUTED"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("closing a batch reader rejects pending requests and reaps the child", async () => {
  const { git } = await repo();
  const child = spawn(process.execPath, ["-e", "process.stdin.resume();"], { stdio: "pipe" });
  const reader = new CatFileReader({ ...git, spawn: () => child });
  const pending = expect(reader.readBlob("a".repeat(40))).rejects.toThrow(RuntimeError);
  await new Promise<void>((resolve) => setImmediate(resolve));
  await reader.close();
  await pending;
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
});

const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function repo() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "ts-graph-git-")));
  directories.push(root);
  const git = createGitClient(root);
  await git.run(["init", "-b", "main"]);
  await git.run(["config", "user.name", "Test"]);
  await git.run(["config", "user.email", "test@example.invalid"]);
  await git.run(["config", "commit.gpgsign", "false"]);
  await git.run(["config", "core.autocrlf", "false"]);
  const put = async (path: string, text: string | Buffer) => {
    await writeFile(join(root, path), text);
  };
  const commit = async () => {
    await git.run(["add", "-A"]);
    await git.run(["commit", "-m", "fixture"]);
    return (await git.run(["rev-parse", "HEAD"])).toString().trim();
  };
  await put("a.ts", "export const value = 1;\n");
  await put("deleted.ts", "export const removed = true;\n");
  await put("old.ts", "export const uniqueRenamedFile = 'unchanged contents';\n");
  const first = await commit();
  await put("a.ts", "export const value = 2;\n");
  await rm(join(root, "deleted.ts"));
  await rename(join(root, "old.ts"), join(root, "new.ts"));
  await put("added.ts", "export {};\n");
  const second = await commit();
  return { root, git, put, commit, first, second };
}

it.each([
  [{}, "HEAD^", "HEAD"],
  [{ target: "v1" }, "v1^", "v1"],
  [{ target: "@", compareWith: "main" }, "main", "HEAD"],
])("models revision input %j", (input, base, target) => {
  expect(parseDiffSpec(input)).toEqual({
    base: { kind: "tree", revision: base },
    target: { kind: "tree", revision: target },
    mergeBase: false,
  });
});

it.each([
  { target: "working", compareWith: "main" },
  { target: "staged", compareWith: "main" },
  ...["working", "staged", "."].map((target) => ({ target, mergeBase: true })),
  ...["main", "staged"].map((target) => ({ target, includeUntracked: true })),
  { target: "" },
  { target: "a\0b" },
])("rejects invalid diff input %j", (input) => {
  expect(() => parseDiffSpec(input)).toThrow(InputError);
});

it.skipIf(process.platform === "win32")(
  "parses statuses without splitting or unquoting file names",
  () => {
    expect(
      parseChanges(
        Buffer.from(
          'A\0日本語 space.ts\0M\0tab\tline\n.ts\0T\0mode.ts\0R100\0old\\name.ts\0new"name.ts\0D\0gone.ts\0',
        ),
      ),
    ).toEqual({
      files: [
        { path: "gone.ts", status: "deleted" },
        { path: "mode.ts", status: "modified" },
        { path: 'new"name.ts', status: "added" },
        { path: "old\\name.ts", status: "deleted" },
        { path: "tab\tline\n.ts", status: "modified" },
        { path: "日本語 space.ts", status: "added" },
      ],
      renames: [{ from: "old\\name.ts", to: 'new"name.ts' }],
    });
    expect(parseChanges(Buffer.alloc(0))).toEqual({ files: [], renames: [] });
  },
);
it.each([
  "A\0file",
  "R100\0old\0",
  "U\0file\0",
  "A\0../file\0",
  "C100\0old\0new\0",
  "R999\0a\0b\0",
])("rejects malformed or unsupported status %s", (text) => {
  expect(() => parseChanges(Buffer.from(text))).toThrow(RuntimeError);
});

it("resolves all revision forms, parents, tags, trees and subdirectory cwd", async () => {
  const { root, git, first, second } = await repo();
  await mkdir(join(root, "nested"));
  await git.run(["tag", "-a", "v1", "-m", "tag", first]);
  // Git uses forward slashes on Windows; compare native filesystem paths.
  expect(normalize((await findRepository(join(root, "nested"))).root)).toBe(normalize(root));
  for (const input of [
    {},
    { target: "HEAD" },
    { target: "@", compareWith: "v1" },
    { target: second, compareWith: first },
    { target: "HEAD^{tree}", compareWith: "v1^{tree}" },
  ]) {
    const comparison = await openComparison(join(root, "nested"), input);
    try {
      expect(comparison.changes).toEqual({
        files: [
          { path: "a.ts", status: "modified" },
          { path: "added.ts", status: "added" },
          { path: "deleted.ts", status: "deleted" },
          { path: "new.ts", status: "added" },
          { path: "old.ts", status: "deleted" },
        ],
        renames: [{ from: "old.ts", to: "new.ts" }],
      });
      expect((await comparison.base.readFile("a.ts"))?.toString()).toContain("= 1");
      expect((await comparison.target.readFile("a.ts"))?.toString()).toContain("= 2");
      expect(await comparison.target.readFile("deleted.ts")).toBeUndefined();
      expect(comparison.target.listFiles()).toEqual(["a.ts", "added.ts", "new.ts"]);
    } finally {
      await comparison.close();
    }
  }
});

it("compares staged/working/combined modes and preserves index bytes, HEAD, branch and dirty files", async () => {
  const { root, git, put } = await repo();
  await put("a.ts", "staged\n");
  await git.run(["add", "a.ts"]);
  await put("a.ts", "working\n");
  await put("untracked.ts", "untracked\n");
  await put(".gitignore", "ignored.ts\n");
  await put("ignored.ts", "ignored\n");
  const state = async () => ({
    index: await readFile(join(root, ".git/index")),
    head: await git.run(["rev-parse", "HEAD"]),
    branch: await git.run(["symbolic-ref", "HEAD"]),
    status: await git.run(["status", "--porcelain=v1", "-z"]),
    working: await readFile(join(root, "a.ts")),
    untracked: await readFile(join(root, "untracked.ts")),
  });
  const before = await state();
  for (const target of ["staged", "working", "."]) {
    const comparison = await openComparison(root, { target });
    try {
      expect((await comparison.base.readFile("a.ts"))?.toString()).toBe(
        target === "working" ? "staged\n" : "export const value = 2;\n",
      );
      expect((await comparison.target.readFile("a.ts"))?.toString()).toBe(
        target === "staged" ? "staged\n" : "working\n",
      );
      expect(comparison.changes.files).toEqual([{ path: "a.ts", status: "modified" }]);
      expect(await comparison.target.readFile("untracked.ts")).toBeUndefined();
    } finally {
      await comparison.close();
    }
  }
  for (const target of ["working", "."]) {
    const comparison = await openComparison(root, { target, includeUntracked: true });
    try {
      expect(comparison.changes.files).toContainEqual({ path: "untracked.ts", status: "added" });
      expect((await comparison.target.readFile("untracked.ts"))?.toString()).toBe("untracked\n");
      expect(comparison.target.listFiles()).not.toContain("ignored.ts");
    } finally {
      await comparison.close();
    }
  }
  expect(await state()).toEqual(before);
});

it("uses an explicit base for working tree and finds the merge base on diverged branches", async () => {
  const { root, git, first, second, put, commit } = await repo();
  await git.run(["switch", "-c", "other", first]);
  await put("other.ts", "other\n");
  await commit();
  const merged = await openComparison(root, {
    target: "main",
    compareWith: "other",
    mergeBase: true,
  });
  try {
    expect(merged.base.listFiles()).toContain("deleted.ts");
    expect(merged.changes.files).not.toContainEqual({ path: "other.ts", status: "deleted" });
  } finally {
    await merged.close();
  }
  const working = await openComparison(root, { target: ".", compareWith: second });
  try {
    expect(working.changes.files).toContainEqual({ path: "other.ts", status: "added" });
  } finally {
    await working.close();
  }
});

it("reports missing revisions, missing parents, no merge base, and non repositories", async () => {
  const { root, git, first } = await repo();
  for (const target of ["does-not-exist", first, "--help"])
    await expect(openComparison(root, { target })).rejects.toThrow(/Fetch/);
  await git.run(["checkout", "--orphan", "unrelated"]);
  await git.run(["commit", "-m", "unrelated"]);
  await expect(
    openComparison(root, { target: "main", compareWith: "unrelated", mergeBase: true }),
  ).rejects.toThrow(/No local merge base/);
  await expect(findRepository(tmpdir())).rejects.toThrow(RuntimeError);
});

it("rejects index conflicts without modifying the index and permits historical comparisons", async () => {
  const { root, git, first, put, commit } = await repo();
  await git.run(["switch", "-c", "conflict", first]);
  await put("a.ts", "conflicting\n");
  await commit();
  await expect(git.run(["merge", "main"])).rejects.toThrow();
  const before = await readFile(join(root, ".git/index"));
  for (const target of ["staged", "working", "."])
    await expect(openComparison(root, { target })).rejects.toThrow(/conflicts/);
  expect(await readFile(join(root, ".git/index"))).toEqual(before);
  const history = await openComparison(root, { target: "main" });
  await history.close();
});

it("reads binary, empty and large blobs through one process and cleans up", async () => {
  const { root, git, put, commit } = await repo();
  const bytes = Buffer.from([0, 10, 255, 13, 0]);
  await put("binary", bytes);
  await put("empty", "");
  await put("large", Buffer.alloc(2 * 1024 * 1024, 97));
  await commit();
  const ids = await Promise.all(
    ["binary", "empty", "large"].map(async (path) =>
      (await git.run(["rev-parse", `HEAD:${path}`])).toString().trim(),
    ),
  );
  const children: ReturnType<typeof git.spawn>[] = [];
  const reader = new CatFileReader({
    ...git,
    spawn(args) {
      const child = git.spawn(args);
      children.push(child);
      return child;
    },
  });
  try {
    const results = await Promise.all(ids.map((id) => reader.readBlob(id)));
    expect(results[0]).toEqual(bytes);
    expect(results[1]?.length).toBe(0);
    expect(results[2]?.length).toBe(2 * 1024 * 1024);
    expect(children).toHaveLength(1);
    await expect(reader.readBlob("HEAD:a.ts\ninjection")).rejects.toThrow(/object ID/);
  } finally {
    await reader.close();
  }
  await reader.close();
  expect(children[0]?.exitCode !== null || children[0]?.signalCode !== null).toBe(true);
  await expect(reader.readBlob(ids[0]!)).rejects.toThrow(/closed/);
  expect(root).toBeTruthy();
});

it.each(["missing", "startup", "truncated", "invalid", "nonblob"])(
  "handles cat-file %s errors and cleanup",
  async (failure) => {
    const { git } = await repo();
    const oid = "a".repeat(40);
    const script =
      failure === "truncated"
        ? `process.stdin.once('data', () => { process.stdout.write('${oid} blob 8\\nshort'); process.exit(); });`
        : `process.stdin.once('data', () => { process.stdout.write('invalid\\n'); });`;
    const reader = new CatFileReader(
      failure === "startup"
        ? { ...git, spawn: () => spawn("/nonexistent/ts-graph-git", [], { stdio: "pipe" }) }
        : failure === "truncated" || failure === "invalid"
          ? { ...git, spawn: () => spawn(process.execPath, ["-e", script], { stdio: "pipe" }) }
          : git,
    );
    try {
      const id =
        failure === "nonblob" ? (await git.run(["rev-parse", "HEAD"])).toString().trim() : oid;
      await expect(reader.readBlob(id)).rejects.toThrow(RuntimeError);
      await expect(reader.readBlob(id)).rejects.toThrow(RuntimeError);
    } finally {
      await reader.close();
    }
  },
);

it("retains unusual filenames and warns for LFS pointers", async () => {
  const { root, put, commit } = await repo();
  const name = process.platform === "win32" ? "日本語 space.ts" : '日本語 space\tline\n"\\.ts';
  await put(name, "hello\n");
  await put("lfs.ts", "version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 20\n");
  await commit();
  const warnings: string[] = [];
  const comparison = await openComparison(root, { target: "." }, (warning) =>
    warnings.push(warning),
  );
  try {
    for (const snapshot of [comparison.base, comparison.target]) {
      expect(snapshot.listFiles()).toContain(name);
      expect((await snapshot.readFile(name))?.toString()).toBe("hello\n");
      expect(await snapshot.readFile("lfs.ts")).toBeUndefined();
      await expect(snapshot.readFile("../outside")).rejects.toThrow();
    }
    expect(warnings).toHaveLength(2);
  } finally {
    await comparison.close();
  }
});

it.skipIf(process.platform === "win32")(
  "does not follow symlinks outside the repository",
  async () => {
    const { root, git } = await repo();
    await symlink(join(root, "../outside.ts"), join(root, "link.ts"));
    await git.run(["add", "link.ts"]);
    const comparison = await openComparison(root, { target: "staged" });
    try {
      expect(await comparison.target.readFile("link.ts")).toBeUndefined();
    } finally {
      await comparison.close();
    }
    await rm(join(root, "a.ts"));
    await symlink(join(root, ".."), join(root, "escape"));
    await symlink(join(root, ".git/config"), join(root, "a.ts"));
    const working = await openComparison(root, { target: "." });
    try {
      expect(await working.target.readFile("a.ts")).toBeUndefined();
    } finally {
      await working.close();
    }
  },
);
