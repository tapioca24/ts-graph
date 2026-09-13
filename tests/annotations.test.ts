import { expect, it } from "vitest";
import { parseAnnotations } from "../src/annotations/schema.js";
import { validateEdgeLabels } from "../src/annotations/edge-labels.js";
import { InputError } from "../src/errors.js";

const label = { from: "src/a.ts", to: "src/b.ts", label: "取得\n<安全>" };

it("accepts inline objects/arrays and file arrays while preserving plain text", () => {
  expect(parseAnnotations(JSON.stringify(label), "inline", true)).toEqual([label]);
  expect(parseAnnotations(JSON.stringify([label]), "file")).toEqual([label]);
  expect(parseAnnotations("[]", "file")).toEqual([]);
  expect(
    parseAnnotations(JSON.stringify({ ...label, from: "./src\\a.ts" }), "inline", true),
  ).toEqual([label]);
});

it.each([
  "{",
  "null",
  "1",
  '"label"',
  "[[]]",
  "[null]",
  "[{}]",
  JSON.stringify([{ from: "a", to: "b" }]),
  JSON.stringify([{ ...label, extra: true }]),
  JSON.stringify([{ ...label, label: " \n" }]),
  JSON.stringify([{ ...label, label: 2 }]),
  JSON.stringify([{ ...label, from: "" }]),
  JSON.stringify([{ ...label, from: "../a.ts" }]),
  JSON.stringify([{ ...label, from: "/a.ts" }]),
  JSON.stringify([{ ...label, to: "C:\\a.ts" }]),
  JSON.stringify([{ ...label, to: "a\0.ts" }]),
])("rejects invalid annotation input %s", (json) => {
  expect(() => parseAnnotations(json, "test", true)).toThrow(InputError);
});

it("requires arrays in files and rejects normalized duplicates across inputs", () => {
  expect(() => parseAnnotations(JSON.stringify(label), "file")).toThrow(/array/);
  const labels = [
    label,
    ...parseAnnotations(JSON.stringify({ ...label, from: "src/./a.ts" }), "inline", true),
  ];
  expect(() => validateEdgeLabels(labels, [label])).toThrow(/Duplicate/);
});

it("suggests closest visible dependency edges in deterministic order", () => {
  const edges = [label, { from: "src/z.ts", to: "src/y.ts" }];
  const invalid = [{ ...label, to: "src/bb.ts" }];
  expect(() => validateEdgeLabels(invalid, edges)).toThrow(
    /Closest valid edges: "src\/a.ts" -> "src\/b.ts"/,
  );
  let message = "";
  try {
    validateEdgeLabels(invalid, edges);
  } catch (error) {
    message = (error as Error).message;
  }
  expect(() => validateEdgeLabels(invalid, edges.toReversed())).toThrow(message);
  expect(() => validateEdgeLabels([label], [])).toThrow(/No dependency edges/);
});
