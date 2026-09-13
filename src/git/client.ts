import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { RuntimeError } from "../errors.js";

export interface GitClient {
  readonly root: string;
  run(args: readonly string[]): Promise<Buffer>;
  spawn(args: readonly string[]): ChildProcessWithoutNullStreams;
}

export function createGitClient(root: string, config: readonly string[] = []): GitClient {
  const start = (args: readonly string[]) =>
    spawn("git", ["--no-pager", "-c", "core.fsmonitor=false", ...config, "-C", root, ...args], {
      shell: false,
      stdio: "pipe",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_LAZY_FETCH: "1", LC_ALL: "C" },
    });
  return {
    root,
    spawn: start,
    run(args) {
      return new Promise((resolve, reject) => {
        const child = start(args);
        const output: Buffer[] = [];
        const errors: Buffer[] = [];
        child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
        child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
        child.on("error", (cause) => reject(new RuntimeError("Cannot start Git", { cause })));
        child.stdin.on("error", (cause) => reject(new RuntimeError("Git input failed", { cause })));
        child.on("close", (code) => {
          if (code === 0) resolve(Buffer.concat(output));
          else
            reject(
              new RuntimeError(
                `Git ${args[0]} failed (${code}): ${Buffer.concat(errors).toString("utf8").trim()}`,
              ),
            );
        });
        child.stdin.end();
      });
    },
  };
}

export async function findRepository(cwd: string): Promise<GitClient> {
  const client = createGitClient(cwd);
  // Remove only Git's final newline: directory names may contain whitespace.
  const root = (await client.run(["rev-parse", "--show-toplevel"]))
    .toString("utf8")
    .replace(/\r?\n$/, "");
  // Even name-status diff can invoke clean/process filters. Disable configured
  // drivers for this process only; never edit the user's configuration.
  const config = (await client.run(["config", "--null", "--list"])).toString("utf8");
  const overrides: string[] = [];
  for (const record of config.split("\0")) {
    const key = record.split("\n", 1)[0];
    if (key && /^filter\..*\.(clean|process|required)$/.test(key)) {
      overrides.push("-c", `${key}=${key.endsWith(".required") ? "false" : ""}`);
    }
  }
  return createGitClient(root, overrides);
}
