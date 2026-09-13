import { describe, expect, it } from "vitest";
import { mergeGraphs } from "../src/graph/merge.js";
import { selectGraph } from "../src/graph/select.js";
import type { DiffGraph, SnapshotGraph } from "../src/graph/model.js";
import { InputError } from "../src/errors.js";
import { createLogger } from "../src/logger.js";

const snapshot = (paths: string[], pairs: [string, string][] = []): SnapshotGraph => ({
  nodes: paths.map((path) => ({ path })),
  edges: pairs.map(([from, to]) => ({ from, to })),
});
const noChanges = { files: [], renames: [] };
const paths = (graph: DiffGraph) => graph.nodes.map((node) => node.path);
const network = (): DiffGraph => ({
  nodes: ["seed", "a", "b", "c", "d", "isolated"].map((path) => ({
    path,
    status: path === "seed" ? "modified" : "unchanged",
  })),
  edges: [
    ["seed", "b"],
    ["a", "seed"],
    ["a", "b"],
    ["b", "c"],
    ["c", "d"],
    ["d", "b"],
  ].map(([from, to]) => ({ from: from!, to: to!, status: "unchanged" })),
  renames: [],
});

describe("mergeGraphs", () => {
  it("computes every node and edge status and keeps both dependencies of modified nodes", () => {
    const graph = mergeGraphs(
      snapshot(
        ["same", "mod", "gone"],
        [
          ["mod", "gone"],
          ["same", "mod"],
        ],
      ),
      snapshot(
        ["new", "mod", "same"],
        [
          ["mod", "new"],
          ["same", "mod"],
        ],
      ),
      {
        files: [
          { path: "mod", status: "modified" },
          { path: "README.md", status: "added" },
        ],
        renames: [],
      },
    );
    expect(graph).toEqual({
      nodes: [
        { path: "gone", status: "deleted" },
        { path: "mod", status: "modified" },
        { path: "new", status: "added" },
        { path: "same", status: "unchanged" },
      ],
      edges: [
        { from: "mod", to: "gone", status: "deleted" },
        { from: "mod", to: "new", status: "added" },
        { from: "same", to: "mod", status: "unchanged" },
      ],
      renames: [],
    });
  });

  it("uses membership changes for config changes, and Git changes for mode-only/shared files", () => {
    expect(
      mergeGraphs(snapshot(["removed", "mode"]), snapshot(["included", "mode"]), {
        files: [
          { path: "mode", status: "modified" },
          { path: "tsconfig.json", status: "modified" },
        ],
        renames: [],
      }).nodes,
    ).toEqual([
      { path: "included", status: "added" },
      { path: "mode", status: "modified" },
      { path: "removed", status: "deleted" },
    ]);
  });

  it("keeps old/new rename nodes with their historical dependencies and ignores unsupported endpoints", () => {
    const graph = mergeGraphs(
      snapshot(["old.ts", "lib.ts"], [["old.ts", "lib.ts"]]),
      snapshot(["new.ts", "lib.ts"], [["new.ts", "lib.ts"]]),
      {
        files: [
          { path: "old.ts", status: "deleted" },
          { path: "new.ts", status: "added" },
        ],
        renames: [
          { from: "old.ts", to: "new.ts" },
          { from: "old.ts", to: "new.ts" },
          { from: "README.md", to: "guide.md" },
          { from: "old.ts", to: "outside.js" },
        ],
      },
    );
    expect(graph.nodes).toEqual([
      { path: "lib.ts", status: "unchanged" },
      { path: "new.ts", status: "added" },
      { path: "old.ts", status: "deleted" },
    ]);
    expect(graph.renames).toEqual([{ from: "old.ts", to: "new.ts", status: "renamed" }]);
    expect(selectGraph(graph, { depth: 0 }).renames).toEqual(graph.renames);
    expect(selectGraph(graph, { exclude: ["old.ts"] }).renames).toEqual([]);
    expect(graph.edges.map((edge) => edge.status)).toEqual(["added", "deleted"]);
  });

  it("deduplicates nodes/edges, excludes self dependencies and handles unusual paths without key collisions", () => {
    const input = snapshot(
      ["a\nb", "c", "a", "b\nc", "a"],
      [
        ["a\nb", "c"],
        ["a", "b\nc"],
        ["a", "b\nc"],
        ["a", "a"],
      ],
    );
    const copy = structuredClone(input);
    const graph = mergeGraphs(input, input, noChanges);
    expect(graph.nodes).toHaveLength(4);
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges.every((edge) => edge.status === "unchanged")).toBe(true);
    expect(input).toEqual(copy);
    expect(
      mergeGraphs(
        { nodes: [...input.nodes].reverse(), edges: [...input.edges].reverse() },
        input,
        noChanges,
      ),
    ).toEqual(graph);
  });
  it("handles empty and one-sided snapshots", () => {
    const empty = snapshot([]);
    expect(mergeGraphs(empty, empty, noChanges)).toEqual({ nodes: [], edges: [], renames: [] });
    expect(mergeGraphs(empty, snapshot(["a"]), noChanges).nodes).toEqual([
      { path: "a", status: "added" },
    ]);
    expect(mergeGraphs(snapshot(["a"]), empty, noChanges).nodes).toEqual([
      { path: "a", status: "deleted" },
    ]);
  });
});

describe("selectGraph", () => {
  it.each([
    [0, ["seed"]],
    [1, ["a", "b", "seed"]],
    [2, ["a", "b", "c", "d", "seed"]],
    ["all", ["a", "b", "c", "d", "seed"]],
  ] as const)("traverses both directions with cycles at depth %s", (depth, expected) => {
    expect(paths(selectGraph(network(), { depth }))).toEqual(expected);
  });
  it("includes every edge between selected nodes, including non-BFS edges and historical edges", () => {
    const input = network();
    input.edges[0]!.status = "deleted";
    input.edges[1]!.status = "added";
    expect(selectGraph(input).edges).toEqual([input.edges[2], input.edges[1], input.edges[0]]);
  });
  it("excludes seeds and blocks traversal through excluded related nodes", () => {
    expect(paths(selectGraph(network(), { depth: "all", exclude: ["b"] }))).toEqual(["a", "seed"]);
    expect(paths(selectGraph(network(), { depth: "all", exclude: ["seed"] }))).toEqual([]);
  });
  it("matches repository-relative POSIX globs, including directories, braces and dotfiles", () => {
    const input: DiffGraph = {
      nodes: [
        "src/a.ts",
        "src/deep/b.ts",
        "test/a.ts",
        "src/.hidden.ts",
        "src/c.tsx",
        "src/日本語.ts",
      ].map((path) => ({ path, status: "added" })),
      edges: [],
      renames: [],
    };
    expect(paths(selectGraph(input, { exclude: ["src/**/*.ts", "test/**"] }))).toEqual([
      "src/.hidden.ts",
      "src/c.tsx",
    ]);
    expect(paths(selectGraph(input, { exclude: ["**/*.{ts,tsx}", "**/.*"] }))).toEqual([]);
  });
  it("retains all changed seeds and caps unchanged nodes by minimum distance then lexical path", () => {
    const input = network();
    input.nodes.push(
      { path: "z-added", status: "added" },
      { path: "z-deleted", status: "deleted" },
    );
    input.edges.push({ from: "z-added", to: "d", status: "added" });
    const warnings: string[] = [];
    const logger = createLogger({ write: (message) => warnings.push(message) });
    const selected = selectGraph(input, { depth: "all", maxNodes: 2 }, (message) =>
      logger.warn(message),
    );
    expect(paths(selected)).toEqual(["a", "b", "seed", "z-added", "z-deleted"]);
    expect(selected.omitted).toEqual({ count: 2, label: "… 2 related files omitted" });
    expect(warnings).toEqual(["Warning: … 2 related files omitted\n"]);
    expect(paths(selectGraph(input, { depth: "all", maxNodes: 3 }))).toContain("d");
    expect(paths(selectGraph(input, { depth: "all", maxNodes: 3 }))).not.toContain("c");
  });
  it("counts only depth-reachable, non-excluded related nodes and omits no summary when unlimited", () => {
    expect(selectGraph(network(), { depth: 1, maxNodes: 1 }).omitted?.count).toBe(1);
    expect(
      selectGraph(network(), { depth: "all", maxNodes: 1, exclude: ["b"] }).omitted,
    ).toBeUndefined();
    expect(selectGraph(network(), { depth: "all", maxNodes: "all" }).omitted).toBeUndefined();
    expect(selectGraph(network(), { depth: 0, maxNodes: 1 }).omitted).toBeUndefined();
  });
  it("does not traverse rename relations", () => {
    const input = network();
    input.renames.push({ from: "seed", to: "isolated", status: "renamed" });
    expect(paths(selectGraph(input, { depth: "all" }))).not.toContain("isolated");
  });
  it("returns an empty graph when there are no changes", () => {
    expect(selectGraph(mergeGraphs(snapshot(["a"]), snapshot(["a"]), noChanges))).toEqual({
      nodes: [],
      edges: [],
      renames: [],
    });
  });
  it("is deterministic under input permutations and leaves inputs intact", () => {
    const input = network();
    const before = structuredClone(input);
    const expected = selectGraph(input, { depth: "all", maxNodes: 2 });
    expect(input).toEqual(before);
    expect(
      selectGraph(
        { nodes: [...input.nodes].reverse(), edges: [...input.edges].reverse(), renames: [] },
        { depth: "all", maxNodes: 2 },
      ),
    ).toEqual(expected);
  });
  it("uses default depth 1 and a default cap of 50 related files", () => {
    const input: DiffGraph = { nodes: [{ path: "seed", status: "added" }], edges: [], renames: [] };
    for (let i = 0; i < 55; i++) {
      const path = `file-${String(i).padStart(2, "0")}`;
      input.nodes.push({ path, status: "unchanged" });
      input.edges.push({ from: path, to: "seed", status: "unchanged" });
    }
    const selected = selectGraph(input);
    expect(selected.nodes).toHaveLength(51);
    expect(selected.omitted?.count).toBe(5);
    expect(paths(selected)).toContain("file-49");
    expect(paths(selected)).not.toContain("file-50");
  });
  it.each([
    { depth: -1 },
    { depth: 0.5 },
    { depth: Infinity },
    { maxNodes: 0 },
    { maxNodes: NaN },
    { maxNodes: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects invalid limits %j", (options) => {
    expect(() => selectGraph(network(), options)).toThrow(InputError);
  });
});
