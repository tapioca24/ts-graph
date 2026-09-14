import { parseArgs, stripVTControlCharacters } from "node:util";
import type { ParseArgsOptionsConfig } from "node:util";
import { defineCommand, renderUsage } from "citty";
import type { ArgDef } from "citty";
import pkg from "../../package.json" with { type: "json" };
import { InputError, errorMessage } from "../errors.js";

type OptionDefinition = ArgDef & { repeatable?: boolean };
const definitions: Record<string, OptionDefinition> = {
  target: {
    type: "positional",
    required: false,
    description: "New side: revision, @ (HEAD), ., staged, or working; default HEAD",
  },
  "compare-with": {
    type: "positional",
    required: false,
    description: "Base revision; default target parent (HEAD^ without arguments)",
  },
  "merge-base": {
    type: "boolean",
    default: false,
    description: "Use merge base (revision comparisons only)",
  },
  "include-untracked": {
    type: "boolean",
    default: false,
    description: "Include untracked files (. or working only)",
  },
  cwd: {
    type: "string",
    description: "Starting directory; default process.cwd()",
    valueHint: "path",
  },
  tsconfig: {
    type: "string",
    repeatable: true,
    description: "Project config (repeatable); default repository root tsconfig.json",
    valueHint: "path",
  },
  depth: {
    type: "string",
    default: "1",
    description: "Bidirectional traversal distance; 0 shows only changes",
    valueHint: "n|all",
  },
  "max-nodes": {
    type: "string",
    default: "50",
    description: "Maximum unchanged related nodes; positive integer",
    valueHint: "n|all",
  },
  exclude: {
    type: "string",
    repeatable: true,
    description: "Repository-relative exclusion glob (repeatable)",
    valueHint: "glob",
  },
  direction: {
    type: "enum",
    options: ["LR", "RL", "TB", "BT"],
    default: "LR",
    description: "Flowchart direction",
  },
  "group-directories": {
    type: "boolean",
    default: true,
    description: "Group nodes by directory",
    negativeDescription: "Disable directory grouping",
  },
  legend: {
    type: "boolean",
    default: false,
    description: "Show status legend (hidden by default)",
    negativeDescription: "Hide status legend",
  },
  "edge-label": {
    type: "string",
    repeatable: true,
    description: "Annotation JSON object or array (repeatable)",
    valueHint: "json",
  },
  "edge-label-file": {
    type: "string",
    description: "Annotation JSON array file",
    valueHint: "path",
  },
  format: {
    type: "enum",
    options: ["mermaid", "markdown"],
    default: "mermaid",
    description: "Output format",
  },
  output: {
    type: "string",
    alias: "o",
    description: "Output file; default stdout",
    valueHint: "path",
  },
  verbose: {
    type: "boolean",
    default: false,
    description: "Write diagnostics and timing to stderr",
  },
  help: { type: "boolean", alias: "h", description: "Show help" },
  version: { type: "boolean", alias: "v", description: "Show version" },
};

export const version = pkg.version;
export const command = defineCommand({
  meta: {
    name: "ts-graph",
    version,
    description: "Visualize TypeScript dependencies around Git changes",
  },
  args: definitions,
});

export async function getHelp(): Promise<string> {
  return (
    stripVTControlCharacters(await renderUsage(command)) +
    "\nExamples:\n  ts-graph\n  ts-graph @ main\n  ts-graph . main --include-untracked\n  ts-graph staged\n  ts-graph working\n"
  );
}

function limit(value: string, name: string, minimum: number): number | "all" {
  if (value === "all") return value;
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < minimum) {
    throw new InputError(`--${name} must be an integer >= ${minimum} or all`);
  }
  return number;
}

// Citty owns the CLI definition/help. node:util preserves repeated options and
// rejects unknown flags and missing values, which Citty's parser does not enforce.
export function parseOptions(rawArgs: string[], cwd = process.cwd()) {
  const options: ParseArgsOptionsConfig = {};
  for (const [name, def] of Object.entries(definitions)) {
    if (def.type === "positional") continue;
    options[name] = {
      type: def.type === "boolean" ? "boolean" : "string",
      multiple: def.repeatable ?? false,
      ...("alias" in def && typeof def.alias === "string" ? { short: def.alias } : {}),
      ...(def.default !== undefined ? { default: def.default } : {}),
    };
  }
  let parsed;
  try {
    parsed = parseArgs({
      args: rawArgs,
      options,
      strict: true,
      allowPositionals: true,
      allowNegative: true,
      tokens: true,
    });
  } catch (error) {
    throw new InputError(errorMessage(error), { cause: error });
  }
  const seen = new Set<string>();
  for (const token of parsed.tokens) {
    if (token.kind !== "option") continue;
    const name = token.name.startsWith("no-") ? token.name.slice(3) : token.name;
    if (seen.has(name) && !definitions[name]?.repeatable)
      throw new InputError(`--${name} may only be specified once`);
    seen.add(name);
  }
  const values = parsed.values;
  for (const [name, value] of Object.entries(values)) {
    const def = definitions[name];
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === "string" && (!item.trim() || item.includes("\0")))
        throw new InputError(`--${name} requires a non-empty value without NUL`);
      if (def?.type === "enum" && typeof item === "string" && !def.options?.includes(item))
        throw new InputError(`--${name} must be one of ${def.options?.join(", ")}`);
    }
  }
  const [target, compareWith] = parsed.positionals;
  if (
    parsed.positionals.length > 2 ||
    parsed.positionals.some((value) => !value.trim() || value.includes("\0"))
  )
    throw new InputError(
      "Expected at most two non-empty positional arguments: [target] [compare-with]",
    );
  if ((target === "staged" || target === "working") && compareWith !== undefined)
    throw new InputError(`${target} does not accept compare-with`);
  if (values["merge-base"] && [".", "staged", "working"].includes(target ?? ""))
    throw new InputError("--merge-base requires revision comparisons");
  if (values["include-untracked"] && target !== "." && target !== "working")
    throw new InputError("--include-untracked requires . or working");
  const string = (name: string): string | undefined =>
    typeof values[name] === "string" ? values[name] : undefined;
  const list = (name: string): string[] => {
    const value = values[name];
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  };
  return {
    target,
    compareWith,
    cwd: string("cwd") ?? cwd,
    tsconfig: [...new Set(list("tsconfig"))],
    depth: limit(string("depth") ?? "1", "depth", 0),
    maxNodes: limit(string("max-nodes") ?? "50", "max-nodes", 1),
    exclude: list("exclude"),
    direction: string("direction") as "LR" | "RL" | "TB" | "BT",
    groupDirectories: values["group-directories"] === true,
    legend: values.legend === true,
    edgeLabel: list("edge-label"),
    edgeLabelFile: string("edge-label-file"),
    format: string("format") as "mermaid" | "markdown",
    output: string("output"),
    verbose: values.verbose === true,
    mergeBase: values["merge-base"] === true,
    includeUntracked: values["include-untracked"] === true,
    help: values.help === true,
    version: values.version === true,
  };
}

export type CliOptions = ReturnType<typeof parseOptions>;
