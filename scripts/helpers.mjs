import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

export const execute = promisify(execFile);

export async function pnpm(args, cwd) {
  const cli = process.env.npm_execpath;
  if (!cli || !/pnpm/i.test(cli)) throw new Error("Run this script through pnpm.");
  const javascript = /\.[cm]?js$/.test(cli);
  return execute(javascript ? process.execPath : cli, javascript ? [cli, ...args] : args, {
    cwd,
    maxBuffer: 16 * 1024 * 1024,
  });
}

export async function put(root, file, content) {
  const path = join(root, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

export async function git(root, args) {
  return execute(
    "git",
    [
      "-c",
      "user.name=ts-graph fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.autocrlf=false",
      "-c",
      `core.hooksPath=${join(root, ".disabled-hooks")}`,
      ...args,
    ],
    { cwd: root, maxBuffer: 16 * 1024 * 1024 },
  );
}

export async function commit(root, message) {
  await git(root, ["add", "."]);
  await git(root, ["commit", "-qm", message]);
}
