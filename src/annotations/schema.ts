import { InputError, errorMessage } from "../errors.js";
import { normalizeRepoPath } from "../paths.js";
import type { EdgeLabel } from "../mermaid/render.js";

export function parseAnnotations(json: string, source: string, inline = false): EdgeLabel[] {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (cause) {
    throw new InputError(`Invalid annotation JSON in ${source}: ${errorMessage(cause)}`, { cause });
  }
  const entries: unknown[] = Array.isArray(value) ? value : inline ? [value] : [];
  if (!Array.isArray(value) && !inline)
    throw new InputError(`Annotations in ${source} must be an array`);
  return entries.map((entry, index) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      Array.isArray(entry) ||
      Object.keys(entry).length !== 3 ||
      !Object.keys(entry).every((key) => ["from", "to", "label"].includes(key)) ||
      !("from" in entry) ||
      typeof entry.from !== "string" ||
      !entry.from.trim() ||
      !("to" in entry) ||
      typeof entry.to !== "string" ||
      !entry.to.trim() ||
      !("label" in entry) ||
      typeof entry.label !== "string" ||
      !entry.label.trim()
    )
      throw new InputError(
        `Invalid annotation ${index + 1} in ${source}: expected only non-empty from, to and label strings`,
      );
    return {
      from: normalizeRepoPath(entry.from),
      to: normalizeRepoPath(entry.to),
      label: entry.label,
    };
  });
}
