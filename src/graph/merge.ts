import type { Changes } from "../git/changes.js";
import type { DependencyEdge, DiffGraph, SnapshotGraph } from "./model.js";

export const comparePaths = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
export const compareEdges = (a: DependencyEdge, b: DependencyEdge): number =>
  comparePaths(a.from, b.from) || comparePaths(a.to, b.to);
const edgeKey = (edge: DependencyEdge): string => JSON.stringify([edge.from, edge.to]);

/** Snapshot membership determines additions/deletions; Git identifies modified shared nodes.
 * Changes outside both analyzed graphs never introduce unsupported or out-of-project files.
 */
export function mergeGraphs(
  base: SnapshotGraph,
  target: SnapshotGraph,
  changes: Changes,
): DiffGraph {
  const before = new Set(base.nodes.map((node) => node.path));
  const after = new Set(target.nodes.map((node) => node.path));
  const changed = new Set(changes.files.map((file) => file.path));
  const paths = new Set([...before, ...after]);
  const beforeEdges = new Map(
    base.edges.filter((edge) => edge.from !== edge.to).map((edge) => [edgeKey(edge), edge]),
  );
  const afterEdges = new Map(
    target.edges.filter((edge) => edge.from !== edge.to).map((edge) => [edgeKey(edge), edge]),
  );
  const edges = new Map([...beforeEdges, ...afterEdges]);
  const renames = new Map(
    changes.renames
      .filter((edge) => before.has(edge.from) && after.has(edge.to) && edge.from !== edge.to)
      .map((edge) => [edgeKey(edge), edge]),
  );
  return {
    nodes: [...paths].sort(comparePaths).map((path) => ({
      path,
      status: !before.has(path)
        ? "added"
        : !after.has(path)
          ? "deleted"
          : changed.has(path)
            ? "modified"
            : "unchanged",
    })),
    edges: [...edges.entries()]
      .map(([key, edge]) => ({
        ...edge,
        status: !beforeEdges.has(key)
          ? ("added" as const)
          : !afterEdges.has(key)
            ? ("deleted" as const)
            : ("unchanged" as const),
      }))
      .sort(compareEdges),
    renames: [...renames.values()]
      .sort(compareEdges)
      .map((edge) => ({ ...edge, status: "renamed" })),
  };
}
