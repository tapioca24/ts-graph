import { InputError } from "../errors.js";
import { compareEdges } from "../graph/merge.js";
import type { DependencyEdge } from "../graph/model.js";
import type { EdgeLabel } from "../mermaid/render.js";

const key = ({ from, to }: DependencyEdge) => JSON.stringify([from, to]);
const describe = ({ from, to }: DependencyEdge) =>
  `${JSON.stringify(from)} -> ${JSON.stringify(to)}`;

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++)
      next.push(Math.min(next[j]! + 1, row[j + 1]! + 1, row[j]! + (a[i] === b[j] ? 0 : 1)));
    row = next;
  }
  return row[b.length]!;
}

export function validateEdgeLabels(
  labels: readonly EdgeLabel[],
  edges: readonly DependencyEdge[],
): EdgeLabel[] {
  const seen = new Set<string>();
  const valid = new Set(edges.map(key));
  for (const label of labels) {
    if (seen.has(key(label))) throw new InputError(`Duplicate annotation: ${describe(label)}`);
    seen.add(key(label));
    if (!valid.has(key(label))) {
      const candidates = edges
        .map((edge) => ({
          edge,
          distance: distance(label.from, edge.from) + distance(label.to, edge.to),
        }))
        .sort((a, b) => a.distance - b.distance || compareEdges(a.edge, b.edge))
        .slice(0, 3)
        .map(({ edge }) => describe(edge));
      throw new InputError(
        `Annotation edge is not displayed: ${describe(label)}. ${candidates.length ? `Closest valid edges: ${candidates.join(", ")}` : "No dependency edges are displayed."}`,
      );
    }
  }
  return [...labels].sort(compareEdges);
}
