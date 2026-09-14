import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseAnnotations } from "../annotations/schema.js";
import { validateEdgeLabels } from "../annotations/edge-labels.js";
import type { CliOptions } from "../cli/command.js";
import { openComparison } from "../git/snapshots.js";
import { mergeGraphs } from "../graph/merge.js";
import { selectGraph } from "../graph/select.js";
import { createLogger } from "../logger.js";
import { renderGraph } from "../mermaid/render.js";
import { analyzeComparison } from "../typescript/dependencies.js";

export async function generateGraph(
  options: CliOptions,
  logger: ReturnType<typeof createLogger>,
): Promise<string> {
  const start = performance.now();
  let previous = start;
  const timing = (stage: string) => {
    const now = performance.now();
    logger.debug(`${stage}: ${(now - previous).toFixed(1)} ms`);
    previous = now;
  };
  const labels = options.edgeLabel.flatMap((json, index) =>
    parseAnnotations(json, `--edge-label ${index + 1}`, true),
  );
  if (options.edgeLabelFile)
    labels.push(
      ...parseAnnotations(
        await readFile(resolve(options.cwd, options.edgeLabelFile), "utf8"),
        options.edgeLabelFile,
      ),
    );
  const warn = (message: string) => logger.warn(message);
  const comparison = await openComparison(options.cwd, options, warn);
  try {
    timing("Git snapshots and changes");
    const graphs = await analyzeComparison(
      comparison.root,
      comparison.base,
      comparison.target,
      options.tsconfig.length ? options.tsconfig : undefined,
      (message) => logger.debug(message),
      (stage, milliseconds) => logger.debug(`${stage}: ${milliseconds.toFixed(1)} ms`),
    );
    timing("TypeScript analysis");
    const merged = mergeGraphs(graphs.base, graphs.target, comparison.changes);
    const included = new Set(merged.nodes.map((node) => node.path));
    for (const file of comparison.changes.files)
      if (/\.(?:ts|tsx|mts|cts)$/.test(file.path) && !included.has(file.path))
        logger.warn(
          `Changed TypeScript file is outside analyzed tsconfig projects or could not be analyzed: ${JSON.stringify(file.path)}`,
        );
    const graph = selectGraph(merged, options, warn);
    timing("Graph merge and selection");
    const edgeLabels = validateEdgeLabels(labels, graph.edges);
    const output = renderGraph(graph, { ...options, edgeLabels });
    timing("Annotations and render");
    logger.debug(`Selected ${graph.nodes.length} files and ${graph.edges.length} dependency edges`);
    return output;
  } finally {
    await comparison.close();
    logger.debug(`Generation total: ${(performance.now() - start).toFixed(1)} ms`);
  }
}
