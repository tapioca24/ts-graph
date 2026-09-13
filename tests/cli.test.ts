import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeAll, expect, it } from "vitest";
import { createGitClient } from "../src/git/client.js";
import { writeOutput } from "../src/cli/output.js";
import { stableId } from "../src/mermaid/render.js";

const execute = promisify(execFile);
const project = resolve(import.meta.dirname, "..");
const binary = join(project, "dist/main.mjs");
const roots: string[] = [];
beforeAll(async () => {
  await execute(process.execPath, [join(project, "node_modules/tsdown/dist/run.mjs")], {
    cwd: project,
  });
}, 30000);
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ts-graph-cli-"));
  roots.push(root);
  const git = createGitClient(root);
  await git.run(["init", "-b", "main"]);
  const put = async (file: string, text: string) => {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), text);
  };
  const commit = async () => {
    await git.run(["add", "."]);
    await git.run([
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-qm",
      "fixture",
    ]);
  };
  await put(
    "tsconfig.json",
    JSON.stringify({ compilerOptions: { noLib: true }, include: ["src/**/*"] }),
  );
  await put("src/a.ts", 'import { b } from "./b"; export const a = b;\n');
  await put("src/b.ts", "export const b = 1;\n");
  await put("src/c.ts", "export const c = 1;\n");
  await commit();
  await git.run(["tag", "base"]);
  await put("src/b.ts", "export const b = 2;\n");
  await commit();
  const cli = async (args: string[] = [], cwd = root) => {
    try {
      const result = await execute(process.execPath, [binary, ...args], { cwd });
      return { ...result, code: 0 };
    } catch (error) {
      const result = error as Error & { code: number; stdout: string; stderr: string };
      return { code: result.code, stdout: result.stdout, stderr: result.stderr };
    }
  };
  const state = async () => ({
    head: (await git.run(["rev-parse", "HEAD"])).toString(),
    branch: (await git.run(["symbolic-ref", "HEAD"])).toString(),
    status: (await git.run(["status", "--porcelain=v1", "-uall"])).toString(),
    index: await readFile(join(root, ".git/index")),
    working: await readFile(join(root, "src/b.ts")),
  });
  return { root, git, put, commit, cli, state };
}

it("runs every diff mode without changing dirty working tree, index, branch or HEAD", async () => {
  const { git, put, cli, state } = await fixture();
  await put("src/b.ts", "export const b = 3;\n");
  await git.run(["add", "src/b.ts"]);
  await put("src/b.ts", "export const b = 4;\n");
  await put("src/untracked.ts", "export const untracked = 1;\n");
  const before = await state();
  for (const args of [
    [],
    ["HEAD"],
    ["HEAD", "base"],
    ["@", "base"],
    ["HEAD", "base", "--merge-base"],
    ["."],
    [".", "base"],
    ["staged"],
    ["working"],
    [".", "--include-untracked"],
    ["working", "--include-untracked"],
  ]) {
    const result = await cli(args);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("flowchart LR");
    expect(result.stdout).toContain('["b.ts"]:::modified');
    expect(result.stdout.includes('["untracked.ts"]:::added')).toBe(
      args.includes("--include-untracked"),
    );
    expect(result.stderr).toBe("");
    expect(await state()).toEqual(before);
  }
}, 30000);

it("supports cwd, subdirectories, render options and deterministic Markdown file output", async () => {
  const { root, cli } = await fixture();
  const args = [
    "--direction",
    "TB",
    "--no-legend",
    "--no-group-directories",
    "--format",
    "markdown",
  ];
  const result = await cli([...args, "--cwd", root], join(root, "src"));
  expect(result.code, result.stderr).toBe(0);
  expect(result.stdout).toMatch(/^```mermaid\n/);
  expect(result.stdout).toContain("flowchart TB");
  expect(result.stdout).toContain('["src/b.ts"]');
  expect(result.stdout).not.toContain("subgraph");
  expect((await cli(args, join(root, "src"))).stdout).toBe(result.stdout);
  await writeFile(join(root, "graph.md"), "old");
  const file = await cli([...args, "-o", "graph.md", "--verbose"]);
  expect(file.code, file.stderr).toBe(0);
  expect(file.stdout).toBe("");
  expect(file.stderr).toMatch(/Generation total: [\d.]+ ms/);
  for (const stage of [
    "Blob reads and snapshot hosts",
    "Base tsconfig",
    "Base Program construction",
    "Target Dependency resolution",
  ])
    expect(file.stderr).toContain(`${stage}: `);
  expect(await readFile(join(root, "graph.md"), "utf8")).toBe(result.stdout);
  expect((await readdir(root)).some((name) => name.endsWith(".tmp"))).toBe(false);
});

// Eight fresh CLI processes plus Git setup need more than 5 seconds on Windows CI.
it("handles inline/file annotations, escaping, duplicate labels and hidden-edge suggestions", async () => {
  const { root, put, cli } = await fixture();
  const label = { from: "src\\a.ts", to: "./src/b.ts", label: '取得\n<script>"|```' };
  await put("labels.json", JSON.stringify([label]));
  const inline = await cli(["--edge-label", JSON.stringify(label)]);
  expect(inline.code, inline.stderr).toBe(0);
  expect(inline.stdout).toContain("取得<br/>#60;script#62;#34;#124;#96;#96;#96;");
  expect(inline.stdout).toContain('"securityLevel":"strict"');
  expect((await cli(["--edge-label-file", "labels.json"])).stdout).toBe(inline.stdout);
  expect((await cli(["--edge-label", JSON.stringify([label])])).stdout).toBe(inline.stdout);
  for (const args of [
    ["--edge-label", JSON.stringify(label), "--edge-label-file", "labels.json"],
    ["--depth", "0", "--edge-label", JSON.stringify(label)],
    ["--exclude", "src/a.ts", "--edge-label", JSON.stringify(label)],
    ["--edge-label", JSON.stringify({ ...label, to: "src/bb.ts" })],
  ]) {
    const result = await cli(args);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/Duplicate|not displayed/);
  }
  await writeFile(join(root, "labels.json"), JSON.stringify(label));
  expect((await cli(["--edge-label-file", "labels.json"])).code).toBe(2);
}, 30000);

it("keeps warnings on stderr, reports omissions and warns about out-of-project changes", async () => {
  const { put, cli } = await fixture();
  await put("src/b.ts", 'import "./c"; import "./missing"; export const b = 3;\n');
  await put("outside.ts", "export const outside = 1;\n");
  const result = await cli([".", "--include-untracked", "--max-nodes", "1", "--verbose"]);
  expect(result.code, result.stderr).toBe(0);
  expect(result.stderr).toContain("Unresolved import");
  expect(result.stderr).toContain("outside analyzed tsconfig");
  expect(result.stderr).toContain("1 related files omitted");
  expect(result.stdout).toContain("1 related files omitted");
  expect(result.stdout).not.toMatch(/Warning:|Unresolved import| ms/);
});

it("returns 0 for no changes, 2 for invalid inputs and 1 for runtime failures without overwriting output", async () => {
  const { root, put, cli } = await fixture();
  const empty = await cli(["HEAD", "HEAD"]);
  expect(empty.code).toBe(0);
  expect(empty.stdout).toContain("No TypeScript changes");
  await put("saved.mmd", "keep");
  for (const [args, code] of [
    [["--depth", "-1"], 2],
    [["--edge-label", "{"], 2],
    [["missing-revision"], 1],
    [["--edge-label-file", "missing.json"], 1],
    [["--tsconfig", "missing.json"], 1],
  ] as const) {
    const result = await cli([...args, "-o", "saved.mmd"]);
    expect(result.code, result.stderr).toBe(code);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Error:");
    expect(await readFile(join(root, "saved.mmd"), "utf8")).toBe("keep");
  }
  expect((await cli(["-o", "missing/output.mmd"])).code).toBe(1);
  await put("tsconfig.json", "{");
  expect((await cli(["."])).code).toBe(1);
});

it("cleans temporary output on rename failure and preserves the existing destination", async () => {
  const { root } = await fixture();
  const path = join(root, "destination");
  await mkdir(path);
  await writeFile(join(path, "keep"), "content");
  await expect(writeOutput(path, "new")).rejects.toThrow();
  expect(await readFile(join(path, "keep"), "utf8")).toBe("content");
  expect((await readdir(root)).some((name) => name.endsWith(".tmp"))).toBe(false);
});

it("renders rename relations, file changes and both added and deleted dependencies", async () => {
  const { git, put, commit, cli } = await fixture();
  await git.run(["mv", "src/b.ts", "src/renamed.ts"]);
  await git.run(["rm", "src/c.ts"]);
  await put("src/new.ts", "export const fresh = 1;\n");
  await put("src/a.ts", 'import { b } from "./renamed"; import "./new"; export const a = b;\n');
  await commit();
  const result = await cli();
  expect(result.code, result.stderr).toBe(0);
  for (const [file, status] of [
    ["a.ts", "modified"],
    ["b.ts", "deleted"],
    ["c.ts", "deleted"],
    ["renamed.ts", "added"],
    ["new.ts", "added"],
  ])
    expect(result.stdout).toContain(`["${file}"]:::${status}`);
  expect(result.stdout).toContain(
    `${stableId("file", "src/a.ts")} -.-> ${stableId("file", "src/b.ts")}`,
  );
  expect(result.stdout).toContain(
    `${stableId("file", "src/a.ts")} --> ${stableId("file", "src/renamed.ts")}`,
  );
  expect(result.stdout).toContain(
    `${stableId("file", "src/b.ts")} -.->|"renamed"| ${stableId("file", "src/renamed.ts")}`,
  );
});

it("analyzes configs present on only one side and resolves repeated configs from repository root", async () => {
  const { root, git, cli, put, commit } = await fixture();
  await git.run(["rm", "tsconfig.json"]);
  await commit();
  const deleted = await cli();
  expect(deleted.code, deleted.stderr).toBe(0);
  expect(deleted.stdout).toContain('["a.ts"]:::deleted');
  const added = await cli(["HEAD^", "HEAD"]);
  expect(added.code, added.stderr).toBe(0);
  expect(added.stdout).toContain('["a.ts"]:::added');
  await put("one.json", JSON.stringify({ files: ["src/a.ts"], compilerOptions: { noLib: true } }));
  await put("two.json", JSON.stringify({ files: ["src/c.ts"], compilerOptions: { noLib: true } }));
  await commit();
  const multiple = await cli(
    ["--tsconfig", "one.json", "--tsconfig", "two.json"],
    join(root, "src"),
  );
  expect(multiple.code, multiple.stderr).toBe(0);
  expect(multiple.stdout).toContain('["a.ts"]:::added');
  expect(multiple.stdout).toContain('["c.ts"]:::added');
});
