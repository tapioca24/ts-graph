import { resolve } from "node:path";
import ts from "typescript";
import { RuntimeError } from "../errors.js";
import type { SnapshotReader } from "../git/snapshots.js";
import type { SnapshotGraph, DependencyEdge } from "../graph/model.js";
import { createSnapshotHost } from "./compiler-host.js";
import type { SnapshotHost } from "./compiler-host.js";
import { readProjects } from "./config.js";
import { collectImports } from "./imports.js";

type Diagnostic = (message: string) => void;
type Timing = (stage: string, milliseconds: number) => void;
const supported = (file: string, options: ts.CompilerOptions) =>
  /\.(?:ts|tsx|mts|cts)$/.test(file) ||
  (options.allowJs && /\.(?:js|jsx|mjs|cjs)$/.test(file)) ||
  (options.resolveJsonModule && file.endsWith(".json"));

function analyze(
  host: SnapshotHost,
  configs: readonly string[],
  diagnostic: Diagnostic,
  timing: Timing = () => {},
): SnapshotGraph {
  const nodes = new Set<string>();
  const edges = new Map<string, DependencyEdge>();
  const diagnostics = new Set<string>();
  const configStart = performance.now();
  const projects = readProjects(host, configs);
  timing("tsconfig", performance.now() - configStart);
  for (const project of projects) {
    const options = { ...project.options, noEmit: true };
    const compilerHost = host.compilerHost(options);
    const programStart = performance.now();
    const program = ts.createProgram({ rootNames: project.fileNames, options, host: compilerHost });
    timing("Program construction", performance.now() - programStart);
    const dependenciesStart = performance.now();
    const cache = ts.createModuleResolutionCache(host.root, (file) => file, options);
    const pending = [...program.getSourceFiles()];
    const visited = new Set<string>();
    for (let i = 0; i < pending.length; i++) {
      const source = pending[i]!;
      const from = host.repoPath(source.fileName);
      if (!from || !supported(from, options) || visited.has(from)) continue;
      visited.add(from);
      nodes.add(from);
      for (const usage of collectImports(source)) {
        const resolved = ts.resolveModuleName(
          usage.text,
          source.fileName,
          options,
          compilerHost,
          cache,
          undefined,
          program.getModeForUsageLocation(source, usage),
        ).resolvedModule;
        if (!resolved) {
          diagnostics.add(
            `Skipped unresolved import ${JSON.stringify(usage.text)} in ${JSON.stringify(from)}`,
          );
          continue;
        }
        const to = host.repoPath(resolved.resolvedFileName);
        if (!to || !supported(to, options)) continue;
        const dependency =
          program.getSourceFile(resolved.resolvedFileName) ??
          compilerHost.getSourceFile(
            resolved.resolvedFileName,
            options.target ?? ts.ScriptTarget.Latest,
          );
        if (!dependency) continue;
        nodes.add(to);
        if (from !== to) edges.set(JSON.stringify([from, to]), { from, to });
        if (!visited.has(to)) pending.push(dependency);
      }
    }
    timing("Dependency resolution", performance.now() - dependenciesStart);
  }
  for (const message of [...diagnostics].sort()) diagnostic(message);
  return {
    nodes: [...nodes].sort().map((path) => ({ path })),
    edges: [...edges.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, edge]) => edge),
  };
}

export async function analyzeSnapshot(
  root: string,
  snapshot: SnapshotReader,
  configs: readonly string[] = ["tsconfig.json"],
  diagnostic: Diagnostic = () => {},
): Promise<SnapshotGraph> {
  return analyze(await createSnapshotHost(root, snapshot), configs, diagnostic);
}

/** A selected config may be absent on one side, but never on both sides. */
export async function analyzeComparison(
  root: string,
  base: SnapshotReader,
  target: SnapshotReader,
  configs: readonly string[] = ["tsconfig.json"],
  diagnostic: Diagnostic = () => {},
  timing: Timing = () => {},
) {
  const hostStart = performance.now();
  const before = await createSnapshotHost(root, base);
  const after = await createSnapshotHost(root, target);
  timing("Blob reads and snapshot hosts", performance.now() - hostStart);
  const selected = [...new Set(configs.map((file) => resolve(root, file)))].sort();
  for (const config of selected) {
    if (!before.repoPath(config))
      throw new RuntimeError(`Project is outside repository: ${config}`);
    if (!before.fileExists(config) && !after.fileExists(config))
      throw new RuntimeError(`Missing tsconfig in both snapshots: ${config}`);
  }
  return {
    base: analyze(
      before,
      selected.filter((file) => before.fileExists(file)),
      diagnostic,
      (stage, milliseconds) => timing(`Base ${stage}`, milliseconds),
    ),
    target: analyze(
      after,
      selected.filter((file) => after.fileExists(file)),
      diagnostic,
      (stage, milliseconds) => timing(`Target ${stage}`, milliseconds),
    ),
  };
}
