import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { commit, execute, git, pnpm, put } from "./helpers.mjs";

const project = resolve(import.meta.dirname, "..");
const temporary = await mkdtemp(join(tmpdir(), "ts-graph-pack-"));
try {
  // prepack must build the actual distributable, including its shebang.
  await pnpm(["pack", "--pack-destination", temporary], project);
  const archives = (await readdir(temporary)).filter((file) => file.endsWith(".tgz"));
  assert.equal(archives.length, 1);
  const archive = join(temporary, archives[0]);
  const { stdout: listing } = await execute("tar", ["-tzf", archive]);
  const files = listing
    .trim()
    .split(/\r?\n/)
    .filter((file) => !file.endsWith("/"));
  for (const required of [
    "package.json",
    "dist/main.mjs",
    "README.md",
    "README.ja.md",
    "LICENSE",
    "schemas/annotations.schema.json",
  ])
    assert(files.includes(`package/${required}`), `Missing ${required}`);
  for (const file of files)
    assert(
      /^package\/(?:dist\/[^/]+\.(?:mjs|mjs\.map)|schemas\/annotations\.schema\.json|package\.json|README(?:\.ja)?\.md|LICENSE)$/.test(
        file,
      ),
      `Unexpected packed file: ${file}`,
    );

  const consumer = join(temporary, "consumer");
  await put(consumer, "package.json", JSON.stringify({ private: true, type: "module" }));
  await pnpm(["add", "--prod", "--ignore-scripts", archive], consumer);
  const installed = join(consumer, "node_modules/@tapioca24/ts-graph");
  assert(
    !(await realpath(installed)).startsWith(project),
    "Must install the tarball, not link the source tree",
  );
  const pkg = JSON.parse(await readFile(join(installed, "package.json"), "utf8"));
  assert.equal(pkg.name, "@tapioca24/ts-graph");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.engines.node, ">=24");
  assert.equal(pkg.bin["ts-graph"], "dist/main.mjs");
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ["citty", "typescript"]);
  assert(
    (await readFile(join(installed, pkg.bin["ts-graph"]), "utf8")).startsWith(
      "#!/usr/bin/env node\n",
    ),
  );
  JSON.parse(await readFile(join(installed, "schemas/annotations.schema.json"), "utf8"));
  const help = await pnpm(["exec", "ts-graph", "--help"], consumer);
  assert.match(help.stdout, /--edge-label-file/);
  assert.equal(help.stderr, "");
  assert.equal(
    (await pnpm(["exec", "ts-graph", "--version"], consumer)).stdout.trim(),
    pkg.version,
  );

  await put(consumer, ".gitignore", "node_modules/\n");
  await put(
    consumer,
    "tsconfig.json",
    JSON.stringify({ compilerOptions: { noLib: true }, include: ["src"] }),
  );
  await put(consumer, "src/a.ts", 'import { b } from "./b"; export const a = b;\n');
  await put(consumer, "src/b.ts", "export const b = 1;\n");
  await put(
    consumer,
    "labels.json",
    JSON.stringify([{ from: "src/a.ts", to: "src/b.ts", label: "Packed dependency" }]),
  );
  await git(consumer, ["init", "-b", "main"]);
  await commit(consumer, "base");
  await put(consumer, "src/b.ts", "export const b = 2;\n");
  await commit(consumer, "target");
  const result = await pnpm(
    ["exec", "ts-graph", "--format", "markdown", "--edge-label-file", "labels.json"],
    consumer,
  );
  assert.match(result.stdout, /^```mermaid\n/);
  assert.match(result.stdout, /flowchart LR/);
  assert.doesNotMatch(result.stdout, /legend_status|graph_dependencies/);
  assert.match(result.stdout, /\["b.ts"\]:::modified/);
  assert.match(result.stdout, /Packed dependency/);
  assert.equal(result.stderr, "");
  assert.equal((await git(consumer, ["status", "--porcelain"])).stdout, "");
  process.stdout.write(
    `Pack smoke passed: ${files.length} files; installed CLI help, version and annotated analysis.\n`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
