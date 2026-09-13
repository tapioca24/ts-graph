import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { generateBenchmark } from "./benchmark-generate.mjs";
import { execute, git } from "./helpers.mjs";

const runs = Number(process.argv[3] ?? 3);
if (!Number.isSafeInteger(runs) || runs < 1) throw new Error("Runs must be a positive integer.");
const owned = !process.argv[2];
const root = owned ? await generateBenchmark() : resolve(process.argv[2]);
try {
  const files = (await git(root, ["ls-tree", "-r", "--name-only", "HEAD", "--", "src"])).stdout
    .trim()
    .split("\n").length;
  const changed = (await git(root, ["diff", "--name-only", "HEAD^", "HEAD"])).stdout
    .trim()
    .split("\n").length;
  process.stdout.write(
    `${JSON.stringify({ node: process.version, platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryGiB: totalmem() / 1024 ** 3, files, changed, fixture: JSON.parse(await readFile(join(root, "benchmark.json"), "utf8")), depth: 1, runs, root })}\n`,
  );
  let previous;
  const measurements = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    const result = await execute(
      process.execPath,
      [
        join(import.meta.dirname, "benchmark-child.mjs"),
        "--cwd",
        root,
        "--depth",
        "1",
        "--verbose",
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    const seconds = (performance.now() - start) / 1000;
    assert.match(result.stdout, /flowchart LR/);
    if (previous !== undefined)
      assert.equal(result.stdout, previous, "Benchmark output must be deterministic");
    previous = result.stdout;
    assert(!result.stderr.includes("Warning:"), result.stderr);
    const peakKiB = Number(/Peak RSS: (\d+) KiB/.exec(result.stderr)?.[1]);
    assert(Number.isFinite(peakKiB) && peakKiB > 0, "Missing peak RSS measurement");
    measurements.push({ run: i + 1, seconds, peakMiB: peakKiB / 1024 });
    process.stdout.write(`Run ${i + 1}\n${result.stderr}${JSON.stringify(measurements.at(-1))}\n`);
  }
  const median = measurements.map((item) => item.seconds).sort((a, b) => a - b)[
    Math.floor(runs / 2)
  ];
  process.stdout.write(
    `${JSON.stringify({ medianSeconds: median, maxPeakMiB: Math.max(...measurements.map((item) => item.peakMiB)), targetSeconds: 10, targetPeakMiB: 1024, hardGate: false })}\n`,
  );
} finally {
  if (owned) await rm(root, { recursive: true, force: true });
}
