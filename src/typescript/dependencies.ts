import { resolve } from "node:path";
import ts from "typescript";
import { RuntimeError } from "../errors.js";
import type { SnapshotReader } from "../git/snapshots.js";
import type { SnapshotGraph, DependencyEdge } from "../graph/model.js";
import { createSnapshotHost } from "./compiler-host.js";
import type { SnapshotHost } from "./compiler-host.js";
import { readProjects } from "./config.js";
import { collectImports } from "./imports.js";

type Warn = (message: string) => void;
const supported = (file: string, options: ts.CompilerOptions) =>
  /\.(?:ts|tsx|mts|cts)$/.test(file) ||
  (options.allowJs && /\.(?:js|jsx|mjs|cjs)$/.test(file)) ||
  (options.resolveJsonModule && file.endsWith(".json"));

function analyze(host: SnapshotHost, configs: readonly string[], warn: Warn): SnapshotGraph {
  const nodes = new Set<string>();
  const edges = new Map<string, DependencyEdge>();
  const warnings = new Set<string>();
  for (const project of readProjects(host, configs)) {
    const options = { ...project.options, noEmit: true };
    const compilerHost = host.compilerHost(options);
    const program = ts.createProgram({ rootNames: project.fileNames, options, host: compilerHost });
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
          warnings.add(
            `Unresolved import ${JSON.stringify(usage.text)} in ${JSON.stringify(from)}`,
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
  }
  for (const warning of [...warnings].sort()) warn(warning);
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
  warn: Warn = () => {},
): Promise<SnapshotGraph> {
  return analyze(await createSnapshotHost(root, snapshot), configs, warn);
}

/** A selected config may be absent on one side, but never on both sides. */
export async function analyzeComparison(
  root: string,
  base: SnapshotReader,
  target: SnapshotReader,
  configs: readonly string[] = ["tsconfig.json"],
  warn: Warn = () => {},
) {
  const before = await createSnapshotHost(root, base);
  const after = await createSnapshotHost(root, target);
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
      warn,
    ),
    target: analyze(
      after,
      selected.filter((file) => after.fileExists(file)),
      warn,
    ),
  };
}
