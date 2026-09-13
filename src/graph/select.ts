import { posix } from "node:path";
import { InputError } from "../errors.js";
import { compareEdges, comparePaths } from "./merge.js";
import type { DiffGraph, SelectedGraph } from "./model.js";

export interface SelectionOptions {
  depth?: number | "all";
  maxNodes?: number | "all";
  exclude?: readonly string[];
}

/** Explore the full depth before applying the display cap, so omission counts are exact.
 * Rename relations are presentation metadata and never contribute traversal adjacency.
 */
export function selectGraph(
  graph: DiffGraph,
  options: SelectionOptions = {},
  warn: (message: string) => void = () => {},
): SelectedGraph {
  const { depth = 1, maxNodes = 50, exclude = [] } = options;
  for (const [name, value, minimum] of [
    ["depth", depth, 0],
    ["max-nodes", maxNodes, 1],
  ] as const) {
    if (value !== "all" && (!Number.isSafeInteger(value) || value < minimum))
      throw new InputError(`--${name} must be an integer >= ${minimum} or all`);
  }
  // Domain paths and exclusion patterns are repository-relative POSIX on every OS.
  const nodes = new Map(
    graph.nodes
      .filter((node) => !exclude.some((pattern) => posix.matchesGlob(node.path, pattern)))
      .map((node) => [node.path, node]),
  );
  const adjacency = new Map<string, Set<string>>();
  for (const path of nodes.keys()) adjacency.set(path, new Set());
  for (const edge of graph.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) continue;
    adjacency.get(edge.from)!.add(edge.to);
    adjacency.get(edge.to)!.add(edge.from);
  }
  const queue = [...nodes.values()]
    .filter((node) => node.status !== "unchanged")
    .map((node) => node.path)
    .sort(comparePaths);
  const distance = new Map(queue.map((path) => [path, 0]));
  for (let i = 0; i < queue.length; i++) {
    const path = queue[i]!;
    const nextDistance = distance.get(path)! + 1;
    if (depth !== "all" && nextDistance > depth) continue;
    for (const neighbor of adjacency.get(path)!) {
      if (distance.has(neighbor)) continue;
      distance.set(neighbor, nextDistance);
      queue.push(neighbor);
    }
  }
  const related = queue
    .filter((path) => nodes.get(path)!.status === "unchanged")
    .sort((a, b) => distance.get(a)! - distance.get(b)! || comparePaths(a, b));
  const retained = maxNodes === "all" ? related : related.slice(0, maxNodes);
  const selected = new Set([
    ...queue.filter((path) => nodes.get(path)!.status !== "unchanged"),
    ...retained,
  ]);
  const omitted = related.length - retained.length;
  const label = `… ${omitted} related files omitted`;
  if (omitted > 0) warn(label);
  const visible = (edge: { from: string; to: string }) =>
    selected.has(edge.from) && selected.has(edge.to);
  return {
    nodes: [...selected].sort(comparePaths).map((path) => nodes.get(path)!),
    edges: graph.edges.filter(visible).sort(compareEdges),
    renames: graph.renames.filter(visible).sort(compareEdges),
    ...(omitted > 0 ? { omitted: { count: omitted, label } } : {}),
  };
}
