export class InputError extends Error {
  override name = "InputError";
}

export class RuntimeError extends Error {
  override name = "RuntimeError";
}

export function exitCodeFor(error: unknown): 1 | 2 {
  return error instanceof InputError ? 2 : 1;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
