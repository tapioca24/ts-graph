import { randomUUID } from "node:crypto";
import { open, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Exclusive sibling temporary file keeps rename on the same filesystem. */
export async function writeOutput(path: string, content: string): Promise<void> {
  const temporary = join(dirname(path), `.ts-graph-${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx");
  try {
    try {
      await handle.writeFile(content, "utf8");
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch((error: unknown) => {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    });
  }
}
