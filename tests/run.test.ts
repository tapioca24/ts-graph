import { expect, it } from "vitest";
import { runCli } from "../src/cli/run.js";

it.each([
  { args: ["--help"], code: 0, stdout: "USAGE", stderr: "" },
  { args: ["--version"], code: 0, stdout: "0.1.0\n", stderr: "" },
  { args: ["--unknown"], code: 2, stdout: "", stderr: "Error:" },
  { args: ["--cwd", "/nonexistent-ts-graph-repository"], code: 1, stdout: "", stderr: "Error:" },
])("keeps output streams separate for $args", async ({ args, code, stdout, stderr }) => {
  let out = "";
  let err = "";
  expect(
    await runCli(args, {
      stdout: {
        write: (text) => {
          out += text;
        },
      },
      stderr: {
        write: (text) => {
          err += text;
        },
      },
    }),
  ).toBe(code);
  if (stdout) expect(out).toContain(stdout);
  else expect(out).toBe("");
  if (stderr) expect(err).toContain(stderr);
  else expect(err).toBe("");
});
