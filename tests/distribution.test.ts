import { readFile } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";
import { expect, it } from "vitest";
import schema from "../schemas/annotations.schema.json" with { type: "json" };
import { parseAnnotations } from "../src/annotations/schema.js";
import { command, getHelp } from "../src/cli/command.js";

const validate = new Ajv2020({ strict: true }).compile(schema);
const annotation = { from: "src/a.ts", to: "src/b.ts", label: "取得\n<安全>" };

it.each([
  [[], true],
  [[annotation], true],
  [[{ ...annotation, from: "./src\\a.ts" }], true],
  [annotation, false],
  [null, false],
  [[null], false],
  [[{}], false],
  [[{ from: "a", to: "b" }], false],
  [[{ ...annotation, extra: true }], false],
  [[{ ...annotation, label: " \n\t" }], false],
  [[{ ...annotation, label: 1 }], false],
  [[{ ...annotation, from: "" }], false],
  [[{ ...annotation, to: "\u00a0" }], false],
] as const)("validates file structure consistently with runtime: %j", (value, valid) => {
  expect(validate(value), JSON.stringify(validate.errors)).toBe(valid);
  const parse = () => parseAnnotations(JSON.stringify(value), "schema fixture");
  if (valid) expect(parse).not.toThrow();
  else expect(parse).toThrow();
});

it("documents every declared CLI option in both READMEs and help", async () => {
  const help = await getHelp();
  const readmes = await Promise.all(
    ["README.md", "README.ja.md"].map((file) =>
      readFile(new URL(`../${file}`, import.meta.url), "utf8"),
    ),
  );
  const args = command.args;
  if (!args || typeof args !== "object") throw new Error("Expected static CLI arguments");
  for (const [name, definition] of Object.entries(args)) {
    if (definition.type === "positional") continue;
    const option = `--${definition.type === "boolean" && definition.default === true ? "no-" : ""}${name}`;
    expect(help).toContain(option);
    for (const readme of readmes) expect(readme).toContain(option);
  }
});
