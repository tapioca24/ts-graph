import { posix, win32 } from "node:path";
import { InputError } from "./errors.js";

/** Lexical normalization only; filesystem readers must enforce symlink boundaries. */
export function normalizeRepoPath(input: string): string {
  const path = input.replaceAll("\\", "/");
  if (!path || path.includes("\0") || path.startsWith("/") || /^[a-z]:/i.test(path)) {
    throw new InputError(`Expected a repository-relative path: ${input}`);
  }
  const normalized = posix.normalize(path);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new InputError(`Path is outside the repository or does not name a file: ${input}`);
  }
  return normalized;
}

/** Both inputs must be absolute paths in the same platform's syntax. */
export function toRepoPath(root: string, file: string): string {
  const api = /^[a-z]:[\\/]|^\\\\/i.test(root) ? win32 : posix;
  if (
    root.includes("\0") ||
    file.includes("\0") ||
    !api.isAbsolute(root) ||
    !api.isAbsolute(file)
  ) {
    throw new InputError("Repository root and file must be absolute paths");
  }
  return normalizeRepoPath(api.relative(root, file));
}
