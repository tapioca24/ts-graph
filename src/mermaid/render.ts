import { createHash } from "node:crypto";
import { posix } from "node:path";
import { compareEdges, comparePaths } from "../graph/merge.js";
import type { DependencyEdge, DiffNode, SelectedGraph } from "../graph/model.js";
import { escapeLabel } from "./escape.js";
import { edgeStyles, initDirective, nodeClasses } from "./theme.js";

export interface EdgeLabel extends DependencyEdge {
  label: string;
}

export interface RenderOptions {
  direction?: "LR" | "RL" | "TB" | "BT";
  groupDirectories?: boolean;
  legend?: boolean;
  format?: "mermaid" | "markdown";
  /** Already validated, normalized annotations for visible dependency edges. */
  edgeLabels?: readonly EdgeLabel[];
}

/** Separate namespaces keep files, directories and synthetic nodes disjoint. */
export function stableId(kind: "file" | "directory", path: string): string {
  return `${kind}_${createHash("sha256").update(path).digest("hex")}`;
}

interface Directory {
  path: string;
  children: Map<string, Directory>;
  nodes: DiffNode[];
}

function directoryParts(path: string): string[] {
  return path.split("/").slice(0, -1);
}

function renderNodes(nodes: DiffNode[], grouped: boolean): string[] {
  const line = (node: DiffNode) =>
    `${stableId("file", node.path)}["${escapeLabel(grouped ? posix.basename(node.path) : node.path)}"]:::${node.status}`;
  if (!grouped) return nodes.map((node) => `  ${line(node)}`);

  const prefix = directoryParts(nodes[0]?.path ?? "");
  for (const node of nodes) {
    const parts = directoryParts(node.path);
    let length = 0;
    while (length < prefix.length && prefix[length] === parts[length]) length++;
    prefix.length = length;
  }
  const root: Directory = { path: prefix.join("/"), children: new Map(), nodes: [] };
  for (const node of nodes) {
    let parent = root;
    for (const part of directoryParts(node.path).slice(prefix.length)) {
      let child = parent.children.get(part);
      if (!child) {
        child = {
          path: parent.path ? `${parent.path}/${part}` : part,
          children: new Map(),
          nodes: [],
        };
        parent.children.set(part, child);
      }
      parent = child;
    }
    parent.nodes.push(node);
  }
  const lines: string[] = [];
  function visit(directory: Directory, indent: string): void {
    for (const node of directory.nodes) lines.push(`${indent}${line(node)}`);
    for (const [name, child] of [...directory.children].sort(([a], [b]) => comparePaths(a, b))) {
      lines.push(`${indent}subgraph ${stableId("directory", child.path)}["${escapeLabel(name)}"]`);
      visit(child, `${indent}  `);
      lines.push(`${indent}end`);
    }
  }
  visit(root, "  ");
  return lines;
}

/** Pure renderer of the selected graph. Paths are repository-relative POSIX;
 * input order, locale, and graph cycles do not affect output ordering.
 */
export function renderGraph(graph: SelectedGraph, options: RenderOptions = {}): string {
  const { direction = "LR", groupDirectories = true, legend = true, format = "mermaid" } = options;
  const lines: string[] = [];
  const nodes = [...graph.nodes].sort((a, b) => comparePaths(a.path, b.path));
  lines.push(...renderNodes(nodes, groupDirectories));
  if (nodes.length === 0) lines.push('  summary_empty["No TypeScript changes"]:::unchanged');
  if (graph.omitted) {
    lines.push(`  summary_omitted["${escapeLabel(graph.omitted.label)}"]:::unchanged`);
  }

  const labels = new Map(
    (options.edgeLabels ?? []).map(({ from, to, label }) => [JSON.stringify([from, to]), label]),
  );
  const styles: string[] = [];
  for (const edge of [...graph.edges].sort(compareEdges)) {
    const label = labels.get(JSON.stringify([edge.from, edge.to]));
    const arrow = edge.status === "deleted" ? "-.->" : "-->";
    lines.push(
      `  ${stableId("file", edge.from)} ${arrow}${label === undefined ? "" : `|"${escapeLabel(label)}"|`} ${stableId("file", edge.to)}`,
    );
    styles.push(edgeStyles[edge.status]);
  }
  for (const relation of [...graph.renames].sort(compareEdges)) {
    lines.push(
      `  ${stableId("file", relation.from)} -.->|"renamed"| ${stableId("file", relation.to)}`,
    );
    styles.push(edgeStyles.renamed);
  }
  if (legend) {
    // Link the subgraphs themselves so their internal directions are preserved.
    // Layout-only links follow real edges to keep linkStyle indices unchanged.
    lines.splice(0, lines.length, ...lines.map((line) => `  ${line}`));
    lines.unshift('  subgraph graph_dependencies[" "]', `    direction ${direction}`);
    lines.push(
      "  end",
      "  style graph_dependencies fill:none,stroke:none",
      '  subgraph legend_status["Legend"]',
      "    direction LR",
      '    legend_added["Added"]:::added',
      '    legend_modified["Modified"]:::modified',
      '    legend_deleted["Deleted"]:::deleted',
      "    legend_added ~~~ legend_modified ~~~ legend_deleted",
      "  end",
      "  graph_dependencies ~~~ legend_status",
    );
  }
  lines.unshift(initDirective, `flowchart ${legend ? "TB" : direction}`);
  lines.push(...nodeClasses.map((definition) => `  ${definition}`));
  lines.push(...styles.map((style, index) => `  linkStyle ${index} ${style}`));
  const mermaid = `${lines.join("\n")}\n`;
  return format === "markdown" ? `\`\`\`mermaid\n${mermaid}\`\`\`\n` : mermaid;
}
