// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import mermaid from "mermaid";
import type { FlowDB } from "mermaid/dist/diagrams/flowchart/flowDb.js";
import type { SelectedGraph } from "../src/graph/model.js";
import { selectGraph } from "../src/graph/select.js";
import { escapeLabel } from "../src/mermaid/escape.js";
import { renderGraph, stableId } from "../src/mermaid/render.js";
import { macchiato } from "../src/mermaid/theme.js";

const example = (): SelectedGraph => ({
  nodes: [
    { path: "packages/app/src/main.ts", status: "modified" },
    { path: "packages/app/src/old/api.ts", status: "deleted" },
    { path: "packages/app/src/new/api.ts", status: "added" },
    { path: "packages/app/src/shared/types.ts", status: "unchanged" },
  ],
  edges: [
    { from: "packages/app/src/main.ts", to: "packages/app/src/old/api.ts", status: "deleted" },
    { from: "packages/app/src/main.ts", to: "packages/app/src/new/api.ts", status: "added" },
    {
      from: "packages/app/src/shared/types.ts",
      to: "packages/app/src/main.ts",
      status: "unchanged",
    },
    {
      from: "packages/app/src/main.ts",
      to: "packages/app/src/shared/types.ts",
      status: "unchanged",
    },
  ],
  renames: [
    { from: "packages/app/src/old/api.ts", to: "packages/app/src/new/api.ts", status: "renamed" },
  ],
  omitted: { count: 3, label: "… 3 related files omitted" },
});

const files = (...paths: string[]): SelectedGraph => ({
  nodes: paths.map((path) => ({ path, status: "modified" })),
  edges: [],
  renames: [],
});

beforeEach(() => {
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
});

// Inspect the real parser's database too: successful parsing alone would miss
// injected nodes/edges and linkStyle indices pointing at the wrong dependency.
async function parseGraph(source: string): Promise<FlowDB> {
  await expect(mermaid.parse(source)).resolves.toMatchObject({ diagramType: "flowchart-v2" });
  return (await mermaid.mermaidAPI.getDiagramFromText(source)).db as FlowDB;
}

describe("Mermaid renderer", () => {
  it("hides the legend by default", () => {
    expect(renderGraph(example())).not.toContain('subgraph legend_status["Legend"]');
    expect(renderGraph(example())).toContain("flowchart LR");
  });

  it("renders a deterministic snapshot with all statuses, a cycle, rename and omission", async () => {
    const output = renderGraph(example(), { legend: true });
    expect(output).toMatchSnapshot();
    const db = await parseGraph(output);
    expect(db.getVertices().size).toBe(10);
    expect(db.getEdges()).toHaveLength(8);
    for (const node of example().nodes) {
      expect(db.getVertices().get(stableId("file", node.path))?.classes).toEqual([node.status]);
    }
    expect(
      db
        .getEdges()
        .slice(0, 5)
        .map((edge) => ({ from: edge.start, to: edge.end, style: edge.style, text: edge.text })),
    ).toEqual([
      {
        from: stableId("file", "packages/app/src/main.ts"),
        to: stableId("file", "packages/app/src/new/api.ts"),
        style: ["stroke:#a6da95", "color:#cad3f5", "stroke-width:2px", "fill:none"],
        text: "",
      },
      {
        from: stableId("file", "packages/app/src/main.ts"),
        to: stableId("file", "packages/app/src/old/api.ts"),
        style: [
          "stroke:#ed8796",
          "color:#cad3f5",
          "stroke-width:2px",
          "stroke-dasharray:5 5",
          "fill:none",
        ],
        text: "",
      },
      {
        from: stableId("file", "packages/app/src/main.ts"),
        to: stableId("file", "packages/app/src/shared/types.ts"),
        style: ["stroke:#6e738d", "color:#cad3f5", "stroke-width:1px", "fill:none"],
        text: "",
      },
      {
        from: stableId("file", "packages/app/src/shared/types.ts"),
        to: stableId("file", "packages/app/src/main.ts"),
        style: ["stroke:#6e738d", "color:#cad3f5", "stroke-width:1px", "fill:none"],
        text: "",
      },
      {
        from: stableId("file", "packages/app/src/old/api.ts"),
        to: stableId("file", "packages/app/src/new/api.ts"),
        style: [
          "stroke:#c6a0f6",
          "color:#cad3f5",
          "stroke-width:2px",
          "stroke-dasharray:2 3",
          "fill:none",
        ],
        text: "renamed",
      },
    ]);
  });

  it("does not mutate inputs and is independent of their order", () => {
    const graph = example();
    const original = structuredClone(graph);
    const labels = graph.edges.map((edge) => ({ ...edge, label: `${edge.from} → ${edge.to}` }));
    const output = renderGraph(graph, { edgeLabels: labels });
    expect(graph).toEqual(original);
    expect(
      renderGraph(
        {
          ...graph,
          nodes: [...graph.nodes].reverse(),
          edges: [...graph.edges].reverse(),
          renames: [...graph.renames].reverse(),
        },
        { edgeLabels: [...labels].reverse() },
      ),
    ).toBe(output);
  });

  it("uses stable, namespaced, collision-resistant IDs independent of selection and layout", () => {
    const paths = [
      "a/b.ts",
      "a_b.ts",
      "a-b.ts",
      "A/b.ts",
      "日本語.ts",
      "legend_added",
      "summary_empty",
    ];
    expect(new Set(paths.map((path) => stableId("file", path))).size).toBe(paths.length);
    expect(stableId("file", "a/b.ts")).toMatch(/^file_[a-f0-9]{64}$/);
    expect(stableId("file", "a/b.ts")).not.toBe(stableId("directory", "a/b.ts"));
    const id = stableId("file", paths[0]!);
    expect(renderGraph(files(...paths))).toContain(id);
    expect(renderGraph(files(paths[0]!), { groupDirectories: false })).toContain(id);
  });

  it("collapses the common directory prefix and retains the remaining hierarchy", async () => {
    const output = renderGraph(
      files(
        "packages/app/src/main.ts",
        "packages/app/src/util/deep/a.ts",
        "packages/app/src/util/b.ts",
      ),
      { legend: false },
    );
    expect(output).not.toMatch(/\["(?:packages|app|src)"\]/);
    expect(output).toContain(
      `  subgraph ${stableId("directory", "packages/app/src/util")}["util"]`,
    );
    expect(output).toContain(
      `    subgraph ${stableId("directory", "packages/app/src/util/deep")}["deep"]`,
    );
    await parseGraph(output);
  });

  it("keeps directories when a root file exists and compares prefix by path segment", async () => {
    for (const graph of [files("index.ts", "src/a.ts"), files("src/a.ts", "src-other/b.ts")]) {
      const output = renderGraph(graph, { legend: false });
      expect(output).toContain("subgraph " + stableId("directory", "src") + '["src"]');
      await parseGraph(output);
    }
  });

  it("distinguishes equal directory names under different parents", async () => {
    const output = renderGraph(files("a/shared/a.ts", "b/shared/b.ts"), { legend: false });
    expect(output).toContain(stableId("directory", "a/shared"));
    expect(output).toContain(stableId("directory", "b/shared"));
    await parseGraph(output);
  });

  it("renders one directory or one file without a redundant group", () => {
    for (const graph of [files("src/a.ts"), files("src/a.ts", "src/b.ts")]) {
      expect(renderGraph(graph, { legend: false })).not.toContain("subgraph");
    }
  });

  it("uses full repository paths and no directory subgraphs in flat mode", async () => {
    const output = renderGraph(example(), { groupDirectories: false, legend: false });
    expect(output).not.toContain("subgraph");
    expect(output).toContain('["packages/app/src/main.ts"]');
    await parseGraph(output);
  });

  it.each(["LR", "RL", "TB", "BT"] as const)("supports %s direction", async (direction) => {
    const output = renderGraph(example(), { direction, legend: true });
    expect(output).toContain("\nflowchart TB\n");
    expect(output).toContain(`direction ${direction}`);
    const db = await parseGraph(output);
    expect(db.getDirection()).toBe("TB");
    expect(db.getSubGraphs().find((group) => group.id === "graph_dependencies")?.dir).toBe(
      direction,
    );
    const withoutLegend = await parseGraph(renderGraph(example(), { direction, legend: false }));
    expect(withoutLegend.getDirection()).toBe(direction);
  });

  it("places the legend after the dependency group using only invisible layout links", async () => {
    for (const graph of [example(), files(), files("a.ts"), files("a.ts", "b.ts")]) {
      const db = await parseGraph(renderGraph(graph, { legend: true }));
      const actualEdges = graph.edges.length + graph.renames.length;
      expect(
        db
          .getEdges()
          .slice(actualEdges)
          .map(({ start, end, stroke }) => ({ start, end, stroke })),
      ).toEqual([
        { start: "legend_added", end: "legend_modified", stroke: "invisible" },
        { start: "legend_modified", end: "legend_deleted", stroke: "invisible" },
        { start: "graph_dependencies", end: "legend_status", stroke: "invisible" },
      ]);
    }
  });

  it("removes the legend and all layout scaffolding when disabled", async () => {
    const db = await parseGraph(renderGraph(example(), { legend: false }));
    expect([...db.getVertices().keys()].some((id) => id.startsWith("legend_"))).toBe(false);
    expect(db.getEdges()).toHaveLength(5);
  });

  it("renders the actual selection omission as a standalone summary", async () => {
    const selected = selectGraph(
      {
        nodes: [
          { path: "a", status: "modified" },
          { path: "b", status: "unchanged" },
          { path: "c", status: "unchanged" },
        ],
        edges: [
          { from: "a", to: "b", status: "unchanged" },
          { from: "a", to: "c", status: "unchanged" },
        ],
        renames: [],
      },
      { maxNodes: 1 },
    );
    const output = renderGraph(selected, { legend: false });
    expect(output).toContain("1 related files omitted");
    const db = await parseGraph(output);
    expect(db.getVertices().size).toBe(3);
    expect(db.getEdges()).toHaveLength(1);
    expect(renderGraph(files("a.ts"))).not.toContain("summary_omitted");
  });

  it("renders a valid no-change graph", async () => {
    const output = renderGraph(files(), { legend: false });
    expect(output).toContain('["No TypeScript changes"]');
    const db = await parseGraph(output);
    expect(db.getVertices().size).toBe(1);
    expect(db.getEdges()).toHaveLength(0);
  });

  it("wraps the exact raw output in a Markdown fence", async () => {
    const output = renderGraph(example(), { format: "markdown" });
    expect(output).toBe("```mermaid\n" + renderGraph(example()) + "```\n");
    await parseGraph(output.slice("```mermaid\n".length, -4));
  });

  it("pins the complete Macchiato palette and strict SVG text configuration", () => {
    expect(macchiato).toEqual({
      base: "#24273a",
      surface0: "#363a4f",
      text: "#cad3f5",
      overlay0: "#6e738d",
      green: "#a6da95",
      red: "#ed8796",
      yellow: "#eed49f",
      mauve: "#c6a0f6",
    });
    const output = renderGraph(example());
    expect(output).toContain('"securityLevel":"strict"');
    expect(output).toContain('"htmlLabels":false');
    expect(output).toContain('"background":"#24273a"');
    expect(output).toContain(
      "classDef deleted fill:#ed8796,color:#24273a,stroke:#ed8796,stroke-dasharray:5 5",
    );
  });
});

describe("label safety", () => {
  it("escapes HTML, entities, Mermaid delimiters and Markdown without recursive decoding", () => {
    expect(escapeLabel('日本語 😀 & <b>"[x]"</b> #quot; `a` |')).toBe(
      "日本語 #128512; #38; #60;b#62;#34;#91;x#93;#34;#60;/b#62; #35;quot#59; #96;a#96; #124;",
    );
    expect(escapeLabel("a\r\nb\rc\nd")).toBe("a<br/>b<br/>c<br/>d");
    expect(escapeLabel("safe/path-name_file.ts")).toBe("safe/path-name_file.ts");
  });

  it.each([true, false])(
    "prevents syntax injection in paths, directories and annotation (grouped=%s)",
    async (groupDirectories) => {
      const malicious =
        '"]\nend\nattack["injected"]\n%%{init: {"securityLevel":"loose"}}%%\n<script>alert(1)</script> #quot; &quot; | ` ** \\ 日本語 😀';
      const graph = files(`src/${malicious}/a.ts`, `src/${malicious}.ts`, "src/normal.ts");
      graph.edges = [{ from: graph.nodes[0]!.path, to: graph.nodes[1]!.path, status: "deleted" }];
      const output = renderGraph(graph, {
        groupDirectories,
        legend: false,
        edgeLabels: [{ ...graph.edges[0]!, label: malicious + "\r\nnext\rline" }],
      });
      expect(output).not.toContain("<script>");
      expect(output).not.toContain("\nattack[");
      expect(output.match(/%%\{init:/g)).toHaveLength(1);
      const db = await parseGraph(output);
      expect([...db.getVertices().keys()].sort()).toEqual(
        graph.nodes.map((node) => stableId("file", node.path)).sort(),
      );
      expect(db.getEdges()).toHaveLength(1);
      for (const node of db.getVertices().values()) {
        expect(node.link).toBeUndefined();
        expect(node.haveCallback).toBeUndefined();
        expect(node.labelType).not.toBe("markdown");
      }
    },
  );

  it("labels each dependency status while retaining the fixed rename label", async () => {
    const graph = example();
    const labels = graph.edges.map((edge, i) => ({ ...edge, label: `注釈 ${i}\nnext` }));
    const output = renderGraph(graph, { edgeLabels: labels });
    for (const label of labels) expect(output).toContain(escapeLabel(label.label));
    const db = await parseGraph(output);
    expect(
      db
        .getEdges()
        .slice(0, 4)
        .every((edge) => edge.text.includes("注釈")),
    ).toBe(true);
    expect(db.getEdges()[4]?.text).toBe("renamed");
  });
});
