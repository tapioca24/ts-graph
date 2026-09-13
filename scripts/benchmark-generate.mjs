import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { commit, git, put } from "./helpers.mjs";

export async function generateBenchmark(files = 10000, changed = 20, topology = "modules") {
  if (
    !Number.isSafeInteger(files) ||
    !Number.isSafeInteger(changed) ||
    files < 2 ||
    changed < 1 ||
    changed > files
  )
    throw new Error("Expected files >= 2 and 1 <= changed <= files (integers).");
  if (!["modules", "chain"].includes(topology))
    throw new Error("Topology must be modules or chain.");
  const root = await mkdtemp(join(tmpdir(), "ts-graph-benchmark-"));
  await git(root, ["init", "-b", "main"]);
  await put(root, "benchmark.json", JSON.stringify({ files, changed, topology }));
  await put(
    root,
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        target: "ES2024",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
      },
      include: ["src/**/*.ts"],
    }),
  );
  const name = (i) => `file-${String(i).padStart(5, "0")}`;
  const source = (i, modified = false) => {
    const start = topology === "chain" ? 0 : Math.floor(i / 100) * 100;
    const end = topology === "chain" ? files : Math.min(start + 100, files);
    const previous = i === start ? end - 1 : i - 1;
    return `import { value as previous } from "./${name(previous)}.js";\nexport const value: number = previous + ${modified ? 2 : 1};\n`;
  };
  // Bounded cyclic modules by default; chain reproduces deep Compiler API recursion.
  for (let i = 0; i < files; i++) await put(root, `src/${name(i)}.ts`, source(i));
  await commit(root, "benchmark base");
  for (let i = 0; i < changed; i++) {
    const index = Math.floor((i * files) / changed);
    await put(root, `src/${name(index)}.ts`, source(index, true));
  }
  await commit(root, "benchmark target");
  return root;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = await generateBenchmark(
    Number(process.argv[2] ?? 10000),
    Number(process.argv[3] ?? 20),
    process.argv[4] ?? "modules",
  );
  process.stdout.write(`${root}\n`);
}
