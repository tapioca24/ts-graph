import { expect, it } from "vitest";
import { InputError, RuntimeError, exitCodeFor } from "../src/errors.js";
import { createLogger } from "../src/logger.js";
import { normalizeRepoPath, toRepoPath } from "../src/paths.js";

it("maps typed and unexpected errors to exit codes and preserves causes", () => {
  const cause = new Error("disk failure");
  expect(exitCodeFor(new InputError("bad input"))).toBe(2);
  expect(exitCodeFor(new RuntimeError("cannot read", { cause }))).toBe(1);
  expect(new RuntimeError("cannot read", { cause }).cause).toBe(cause);
  expect(exitCodeFor(cause)).toBe(1);
  expect(exitCodeFor("unknown failure")).toBe(1);
});

it("writes diagnostics only to the injected sink and gates verbose messages", () => {
  const lines: string[] = [];
  const logger = createLogger({ write: (text) => lines.push(text) });
  logger.warn("missing import");
  logger.error("failed");
  logger.debug("hidden");
  createLogger({ write: (text) => lines.push(text) }, true).debug("visible");
  expect(lines).toEqual(["Warning: missing import\n", "Error: failed\n", "visible\n"]);
});

it.each([
  ["./src/../日本語/a.ts", "日本語/a.ts"],
  ["src\\a.ts", "src/a.ts"],
  ["a b/line\nfile.ts", "a b/line\nfile.ts"],
])("normalizes %s", (input, output) => {
  expect(normalizeRepoPath(input)).toBe(output);
});

it.each(["", ".", "..", "../a", "a/../../b", "/a", "C:\\a", "C:a", "\\\\host\\share", "a\0b"])(
  "rejects invalid repository-relative path %s",
  (input) => {
    expect(() => normalizeRepoPath(input)).toThrow(InputError);
  },
);

it("converts absolute paths with host-independent Windows drive handling", () => {
  expect(toRepoPath("/repo", "/repo/src/a.ts")).toBe("src/a.ts");
  expect(toRepoPath("C:\\Repo", "c:\\Repo\\src\\a.ts")).toBe("src/a.ts");
  expect(() => toRepoPath("/repo", "/repository/a.ts")).toThrow(InputError);
  expect(() => toRepoPath("C:\\repo", "D:\\repo\\a.ts")).toThrow(InputError);
});
