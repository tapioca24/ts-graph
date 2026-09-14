import { describe, expect, it } from "vitest";
import { getHelp, parseOptions } from "../src/cli/command.js";
import { InputError } from "../src/errors.js";

describe("CLI contract", () => {
  it("defines defaults without resolving Git revisions", () => {
    expect(parseOptions([], "/repo")).toEqual({
      target: undefined,
      compareWith: undefined,
      cwd: "/repo",
      tsconfig: [],
      depth: 1,
      maxNodes: 50,
      exclude: [],
      direction: "LR",
      groupDirectories: true,
      legend: false,
      edgeLabel: [],
      edgeLabelFile: undefined,
      format: "mermaid",
      output: undefined,
      verbose: false,
      mergeBase: false,
      includeUntracked: false,
      help: false,
      version: false,
    });
  });

  it("preserves repeated values, aliases, and negative flags", () => {
    expect(
      parseOptions(
        [
          ".",
          "main",
          "--tsconfig",
          "a.json",
          "--tsconfig=b.json",
          "--exclude",
          "test/**",
          "--exclude=dist/**",
          "--edge-label",
          "{}",
          "--edge-label=[]",
          "--no-legend",
          "--no-group-directories",
          "-o",
          "out.md",
          "--depth",
          "all",
          "--max-nodes=all",
          "--include-untracked",
          "--format=markdown",
          "--direction=TB",
          "--verbose",
          "--edge-label-file=labels.json",
          "--cwd=project",
        ],
        "/repo",
      ),
    ).toMatchObject({
      target: ".",
      compareWith: "main",
      tsconfig: ["a.json", "b.json"],
      exclude: ["test/**", "dist/**"],
      edgeLabel: ["{}", "[]"],
      legend: false,
      groupDirectories: false,
      output: "out.md",
      depth: "all",
      maxNodes: "all",
      includeUntracked: true,
      format: "markdown",
      direction: "TB",
      verbose: true,
      edgeLabelFile: "labels.json",
      cwd: "project",
    });

    expect(parseOptions(["--legend"]).legend).toBe(true);
  });

  it.each([
    [],
    ["HEAD"],
    ["@", "main"],
    ["staged"],
    ["working"],
    [".", "main"],
    ["HEAD", "main", "--merge-base"],
    ["working", "--include-untracked"],
    ["--depth=0"],
  ])("accepts valid arguments %j", (...args) => {
    expect(() => parseOptions(args)).not.toThrow();
  });

  it.each([
    ["a", "b", "c"],
    ["staged", "main"],
    ["working", "main"],
    [".", "--merge-base"],
    ["working", "--merge-base"],
    ["staged", "--merge-base"],
    ["--include-untracked"],
    ["staged", "--include-untracked"],
    ["--depth=-1"],
    ["--depth=1.5"],
    ["--depth=NaN"],
    ["--depth=1e2"],
    ["--depth=9007199254740992"],
    ["--max-nodes=0"],
    ["--max-nodes=-1"],
    ["--direction=down"],
    ["--format=json"],
    ["--unknown"],
    ["--no-unknown"],
    ["--depth"],
    ["--output"],
    ["--cwd="],
    ["--tsconfig="],
    ["--verbose=false"],
    ["--depth", "--verbose"],
    ["--output=a", "-o", "b"],
    [""],
  ])("rejects invalid arguments %j", (...args) => {
    expect(() => parseOptions(args)).toThrow(InputError);
  });

  it("supports -- without interpreting subsequent revision names as options", () => {
    expect(parseOptions(["--", "--help"])).toMatchObject({ target: "--help", help: false });
  });

  it("documents every public option and special target", async () => {
    const help = await getHelp();
    for (const name of [
      "merge-base",
      "include-untracked",
      "cwd",
      "tsconfig",
      "depth",
      "max-nodes",
      "exclude",
      "direction",
      "no-group-directories",
      "no-legend",
      "edge-label",
      "edge-label-file",
      "format",
      "output",
      "verbose",
      "help",
      "version",
    ])
      expect(help).toContain(`--${name}`);
    for (const text of ["TARGET", "COMPARE-WITH", "staged", "working", "HEAD^", "repeatable"])
      expect(help).toContain(text);
  });
});
