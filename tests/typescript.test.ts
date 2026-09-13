import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import ts from "typescript";
import type { SnapshotReader } from "../src/git/snapshots.js";
import { openComparison } from "../src/git/snapshots.js";
import { createGitClient } from "../src/git/client.js";
import { analyzeComparison, analyzeSnapshot } from "../src/typescript/dependencies.js";
import { collectImports } from "../src/typescript/imports.js";
import { RuntimeError } from "../src/errors.js";
import { createSnapshotHost } from "../src/typescript/compiler-host.js";
import { mergeGraphs } from "../src/graph/merge.js";
import { selectGraph } from "../src/graph/select.js";

it("keeps compiler tracing off stdout and refuses compiler writes", async () => {
  const { root } = await fixture();
  const input = snapshot({
    "tsconfig.json": config({ traceResolution: true }),
    "a.ts": "import './b';",
    "b.ts": "export {};",
  });
  const output = vi.spyOn(ts.sys, "write").mockImplementation(() => {});
  try {
    expect((await analyzeSnapshot(root, input)).edges).toEqual([{ from: "a.ts", to: "b.ts" }]);
    expect(output).not.toHaveBeenCalled();
    const host = await createSnapshotHost(root, input);
    expect(() => host.compilerHost({}).writeFile("output.js", "", false)).toThrow(/read-only/);
  } finally {
    output.mockRestore();
  }
});

it("matches TypeScript config discovery for parent includes, literal brackets, hidden files and directory exclusions", async () => {
  const { root, put } = await fixture();
  const files: Record<string, string> = {
    "config/tsconfig.json": "{}",
    "src/a.ts": "",
    "src/deep/b.ts": "",
    "src/.hidden.ts": "",
    "src/.hidden/c.ts": "",
    "src/generated.v1/d.ts": "",
    "src/[route]/a.ts": "",
    "src/bower_components/b.ts": "",
  };
  for (const [path, text] of Object.entries(files)) await put(path, text);
  const host = await createSnapshotHost(root, snapshot(files));
  for (const includes of [
    ["../src"],
    ["../src/[route]/*.ts"],
    ["../src/**/*.ts"],
    ["../src/.hidden/*.ts"],
  ]) {
    for (const excludes of [
      ["../src/generated.v1"],
      ["../src/generated.v1/**"],
      ["../src/**/d.ts"],
    ]) {
      const args = [join(root, "config"), [".ts"], excludes, includes] as const;
      expect([...host.readDirectory(...args)].sort()).toEqual(ts.sys.readDirectory(...args).sort());
    }
  }
});

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "ts-graph-typescript-")));
  dirs.push(root);
  const put = async (path: string, text: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  };
  return { root, put };
}
function snapshot(files: Record<string, string>): SnapshotReader {
  return {
    kind: "tree",
    listFiles: () => Object.keys(files),
    readFile: (path) =>
      Promise.resolve(files[path] === undefined ? undefined : Buffer.from(files[path])),
  };
}
const config = (options = {}, extra = {}) =>
  JSON.stringify({
    compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", ...options },
    ...extra,
  });
const paths = (graph: Awaited<ReturnType<typeof analyzeSnapshot>>) =>
  graph.nodes.map((node) => node.path);

it("extracts literal static, type, side-effect, export, dynamic, require and import-equals references", () => {
  const source = ts.createSourceFile(
    "a.ts",
    `
    import x from 'static'; import type { T } from 'type'; import 'side';
    export { x } from 'export'; export * from 'star';
    import('dynamic'); require('require'); import q = require('equals');
    type I = import('import-type').I;
    import(variable); require(variable); object.require('ignored'); import(\`template\`);
  `,
    ts.ScriptTarget.Latest,
    true,
  );
  expect(collectImports(source).map((node) => node.text)).toEqual([
    "static",
    "type",
    "side",
    "export",
    "star",
    "dynamic",
    "require",
    "equals",
    "import-type",
  ]);
});

it("unions duplicate edges, omits self edges and follows require/dynamic dependencies transitively", async () => {
  const { root } = await fixture();
  const graph = await analyzeSnapshot(
    root,
    snapshot({
      "tsconfig.json": config({}, { files: ["a.ts"] }),
      "a.ts": `import type { B } from './b'; export * from './b'; import './a'; require('./lazy');`,
      "b.ts": `export type B = string; import './a';`,
      "lazy.ts": `import('./deep.js');`,
      "deep.ts": "export {};",
      "unused.ts": "export {};",
    }),
  );
  expect(paths(graph)).toEqual(["a.ts", "b.ts", "deep.ts", "lazy.ts"]);
  expect(graph.edges).toEqual([
    { from: "a.ts", to: "b.ts" },
    { from: "a.ts", to: "lazy.ts" },
    { from: "b.ts", to: "a.ts" },
    { from: "lazy.ts", to: "deep.ts" },
  ]);
});

it("resolves paths, baseUrl, directory index and snapshot extends with include/exclude", async () => {
  const { root } = await fixture();
  const graph = await analyzeSnapshot(
    root,
    snapshot({
      "tsconfig.json": JSON.stringify({
        extends: "./config/base.json",
        include: ["src"],
        exclude: ["src/ignored"],
      }),
      "config/base.json": config({ baseUrl: "..", paths: { "@/*": ["src/*"] } }),
      "src/a.ts": `import '@/folder'; import 'src/b';`,
      "src/folder/index.ts": "export {};",
      "src/b.ts": "export {};",
      "src/ignored/no.ts": "export {};",
      "other/no.ts": "export {};",
    }),
  );
  expect(paths(graph)).toEqual(["src/a.ts", "src/b.ts", "src/folder/index.ts"]);
  expect(graph.edges).toEqual([
    { from: "src/a.ts", to: "src/b.ts" },
    { from: "src/a.ts", to: "src/folder/index.ts" },
  ]);
});

it("recurses through references and unions resolutions from overlapping projects", async () => {
  const { root } = await fixture();
  const files = {
    "tsconfig.json": JSON.stringify({
      files: [],
      references: [{ path: "./one" }, { path: "./two/tsconfig.json" }],
    }),
    "one/tsconfig.json": config({ paths: { alias: ["../one.ts"] } }, { files: ["../shared.ts"] }),
    "two/tsconfig.json": config(
      { paths: { alias: ["../two.ts"] } },
      { files: ["../shared.ts"], references: [{ path: "../one" }] },
    ),
    "shared.ts": `import 'alias';`,
    "one.ts": "export {};",
    "two.ts": "export {};",
  };
  const graph = await analyzeSnapshot(root, snapshot(files), [
    "tsconfig.json",
    "one/tsconfig.json",
    "tsconfig.json",
  ]);
  expect(paths(graph)).toEqual(["one.ts", "shared.ts", "two.ts"]);
  expect(graph.edges).toEqual([
    { from: "shared.ts", to: "one.ts" },
    { from: "shared.ts", to: "two.ts" },
  ]);
});

it("merges and selects the union of explicit overlapping configs across snapshots", async () => {
  const { root } = await fixture();
  const files = {
    "one/tsconfig.json": config({ paths: { alias: ["../one.ts"] } }, { files: ["../shared.ts"] }),
    "two/tsconfig.json": config({ paths: { alias: ["../two.ts"] } }, { files: ["../shared.ts"] }),
    "shared.ts": "import 'alias';",
    "one.ts": "export {};",
    "two.ts": "export {};",
    "three.ts": "export {};",
  };
  const after = {
    ...files,
    "two/tsconfig.json": config({ paths: { alias: ["../three.ts"] } }, { files: ["../shared.ts"] }),
  };
  const configs = ["two/tsconfig.json", "one/tsconfig.json", "two/tsconfig.json"];
  const comparison = await analyzeComparison(root, snapshot(files), snapshot(after), configs);
  const changes = {
    files: [{ path: "two/tsconfig.json", status: "modified" as const }],
    renames: [],
  };
  const merged = mergeGraphs(comparison.base, comparison.target, changes);
  expect(merged.nodes).toEqual([
    { path: "one.ts", status: "unchanged" },
    { path: "shared.ts", status: "unchanged" },
    { path: "three.ts", status: "added" },
    { path: "two.ts", status: "deleted" },
  ]);
  expect(merged.edges).toEqual([
    { from: "shared.ts", to: "one.ts", status: "unchanged" },
    { from: "shared.ts", to: "three.ts", status: "added" },
    { from: "shared.ts", to: "two.ts", status: "deleted" },
  ]);
  expect(paths(selectGraph(merged))).toEqual(["shared.ts", "three.ts", "two.ts"]);
  expect(selectGraph(merged, { depth: "all" })).toEqual(merged);
  const reversed = await analyzeComparison(
    root,
    snapshot(files),
    snapshot(after),
    [...configs].reverse(),
  );
  expect(mergeGraphs(reversed.base, reversed.target, changes)).toEqual(merged);
});

it.each([false, true])(
  "handles all source extensions, allowJs=%s and imported JSON",
  async (allowJs) => {
    const { root } = await fixture();
    const files: Record<string, string> = {
      "tsconfig.json": config({ allowJs, resolveJsonModule: allowJs, jsx: "preserve" }),
      "a.ts": `import './file-js.js'; import './data.json';`,
      "data.json": "{}",
      "unused.json": "{}",
    };
    for (const ext of ["tsx", "mts", "cts", "d.ts", "js", "jsx", "mjs", "cjs"])
      files[`file-${ext}.${ext}`] = "export {};";
    const graph = await analyzeSnapshot(root, snapshot(files));
    for (const ext of ["tsx", "mts", "cts", "d.ts"])
      expect(paths(graph)).toContain(`file-${ext}.${ext}`);
    for (const ext of ["js", "jsx", "mjs", "cjs"])
      expect(paths(graph).includes(`file-${ext}.${ext}`)).toBe(allowJs);
    expect(paths(graph).includes("data.json")).toBe(allowJs);
    expect(paths(graph)).not.toContain("unused.json");
  },
);

it("continues through type errors and reports unresolved imports once in deterministic order", async () => {
  const { root, put } = await fixture();
  await put("ghost.ts", "export {};");
  const warnings: string[] = [];
  const graph = await analyzeSnapshot(
    root,
    snapshot({
      "tsconfig.json": config(),
      "a.ts": `const x: number = 'bad'; import './ghost'; import './ghost'; import './b';`,
      "b.ts": "export {};",
    }),
    undefined,
    (warning) => warnings.push(warning),
  );
  expect(graph.edges).toEqual([{ from: "a.ts", to: "b.ts" }]);
  expect(warnings).toEqual(['Unresolved import "./ghost" in "a.ts"']);
});

it.each([
  { "tsconfig.json": "{ broken" },
  { "tsconfig.json": "{", "a.ts": "export {};" },
  {
    "tsconfig.json": JSON.stringify({ extends: "./base.json" }),
    "base.json": "{",
    "a.ts": "export {};",
  },
  { "tsconfig.json": config({ unknownOption: true }), "a.ts": "" },
  { "tsconfig.json": JSON.stringify({ extends: "./missing.json" }), "a.ts": "" },
  { "tsconfig.json": JSON.stringify({ files: ["missing.ts"] }) },
  { "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "./missing" }] }) },
  { "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "." }] }) },
  { "tsconfig.json": "{}" },
])("rejects malformed or unbuildable projects %j", async (files) => {
  const { root } = await fixture();
  await expect(analyzeSnapshot(root, snapshot(files))).rejects.toThrow(RuntimeError);
});

it("allows config addition/deletion but rejects configs absent on both sides", async () => {
  const { root } = await fixture();
  const present = snapshot({ "tsconfig.json": config(), "a.ts": "export {};" });
  for (const [base, target] of [
    [present, snapshot({})],
    [snapshot({}), present],
  ] as const) {
    const graph = await analyzeComparison(root, base, target);
    expect(graph.base.nodes.length + graph.target.nodes.length).toBe(1);
  }
  await expect(analyzeComparison(root, present, present, ["absent.json"])).rejects.toThrow(
    /both snapshots/,
  );
});

it("reads installed config packages and excludes external package sources", async () => {
  const { root, put } = await fixture();
  await put("node_modules/config/package.json", JSON.stringify({ tsconfig: "base.json" }));
  await put("node_modules/config/base.json", config());
  await put("node_modules/external/package.json", JSON.stringify({ types: "index.d.ts" }));
  await put("node_modules/external/index.d.ts", "export const x: number;");
  const warnings: string[] = [];
  const graph = await analyzeSnapshot(
    root,
    snapshot({
      "tsconfig.json": JSON.stringify({ extends: "config" }),
      "a.ts": `import { x } from 'external';`,
    }),
    undefined,
    (message) => warnings.push(message),
  );
  expect(paths(graph)).toEqual(["a.ts"]);
  expect(graph.edges).toEqual([]);
  expect(warnings).toEqual([]);
});

it("uses snapshot package exports with NodeNext import and require conditions", async () => {
  const { root } = await fixture();
  const warnings: string[] = [];
  const graph = await analyzeSnapshot(
    root,
    snapshot({
      "tsconfig.json": config(),
      "package.json": JSON.stringify({
        name: "workspace",
        type: "module",
        exports: { ".": { import: "./esm.mts", require: "./cjs.cts" } },
      }),
      "a.mts": `import 'workspace';`,
      "b.cts": `import x = require('workspace');`,
      "esm.mts": "export {};",
      "cjs.cts": "export {};",
    }),
    undefined,
    (message) => warnings.push(message),
  );
  expect(graph.edges).toEqual([
    { from: "a.mts", to: "esm.mts" },
    { from: "b.cts", to: "cjs.cts" },
  ]);
  expect(warnings).toEqual([]);
});

it.skipIf(process.platform === "win32")(
  "resolves a symlinked workspace package into snapshot sources",
  async () => {
    const { root, put } = await fixture();
    const manifest = JSON.stringify({ name: "lib", exports: "./index.ts" });
    await put(
      "packages/lib/package.json",
      JSON.stringify({ name: "lib", exports: "./current.ts" }),
    );
    await put("packages/lib/index.ts", `import './current-only';`);
    await put("packages/lib/current.ts", "export {};");
    await mkdir(join(root, "node_modules"));
    await symlink(join(root, "packages/lib"), join(root, "node_modules/lib"));
    const warnings: string[] = [];
    const graph = await analyzeSnapshot(
      root,
      snapshot({
        "tsconfig.json": config({}, { files: ["a.ts"] }),
        "a.ts": `import 'lib';`,
        "packages/lib/package.json": manifest,
        "packages/lib/index.ts": `import './old';`,
        "packages/lib/old.ts": "export {};",
      }),
      undefined,
      (message) => warnings.push(message),
    );
    expect(graph.edges).toEqual([
      { from: "a.ts", to: "packages/lib/index.ts" },
      { from: "packages/lib/index.ts", to: "packages/lib/old.ts" },
    ]);
    expect(warnings).toEqual([]);
  },
);

it("analyzes tree/index/working configs independently and preserves repository state", async () => {
  const { root, put } = await fixture();
  const git = createGitClient(root);
  await git.run(["init", "-b", "main"]);
  await git.run(["config", "user.name", "Test"]);
  await git.run(["config", "user.email", "test@example.invalid"]);
  await git.run(["config", "commit.gpgsign", "false"]);
  await put("tsconfig.json", config({ paths: { alias: ["./old.ts"] } }));
  await put("a.ts", `import 'alias';`);
  for (const name of ["old", "staged", "working"]) await put(`${name}.ts`, "export {};");
  await git.run(["add", "."]);
  await git.run(["commit", "-m", "fixture"]);
  await put("tsconfig.json", config({ paths: { alias: ["./staged.ts"] } }));
  await git.run(["add", "tsconfig.json"]);
  await put("tsconfig.json", config({ paths: { alias: ["./working.ts"] } }));
  const state = async () => ({
    index: await readFile(join(root, ".git/index")),
    head: await git.run(["rev-parse", "HEAD"]),
    branch: await git.run(["symbolic-ref", "HEAD"]),
    config: await readFile(join(root, "tsconfig.json")),
    status: await git.run(["status", "--porcelain", "-z"]),
  });
  const before = await state();
  for (const target of ["staged", "working", "."]) {
    const comparison = await openComparison(root, { target });
    try {
      const graph = await analyzeComparison(root, comparison.base, comparison.target);
      expect(graph.base.edges).toEqual([
        { from: "a.ts", to: target === "working" ? "staged.ts" : "old.ts" },
      ]);
      expect(graph.target.edges).toEqual([
        { from: "a.ts", to: target === "staged" ? "staged.ts" : "working.ts" },
      ]);
      const merged = mergeGraphs(graph.base, graph.target, comparison.changes);
      expect(merged.edges.filter((edge) => edge.status === "deleted")).toHaveLength(1);
      expect(merged.edges.filter((edge) => edge.status === "added")).toHaveLength(1);
      // A config-only edit changes edges but these explicitly included files stay unchanged.
      expect(selectGraph(merged).nodes).toEqual([]);
    } finally {
      await comparison.close();
    }
  }
  expect(await state()).toEqual(before);
});
