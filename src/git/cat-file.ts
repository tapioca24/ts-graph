import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { RuntimeError } from "../errors.js";
import type { GitClient } from "./client.js";
import { objectIdPattern } from "./diff-spec.js";

/** Serialized requests share one binary-safe batch process. The owner must close it. */
export class CatFileReader {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly chunks: AsyncIterator<Buffer>;
  private readonly exited: Promise<void>;
  private buffer: Buffer = Buffer.alloc(0);
  private queue: Promise<void> = Promise.resolve();
  private failure: RuntimeError | undefined;
  private closed = false;
  private stderr = "";

  constructor(git: GitClient) {
    this.child = git.spawn(["cat-file", "--batch"]);
    this.chunks = this.child.stdout[Symbol.asyncIterator]();
    // Handle startup and pipe errors even when no request is currently active.
    const fail = (cause: Error) => {
      this.failure = new RuntimeError("Git cat-file process failed", { cause });
      this.child.stdout.destroy();
    };
    this.child.on("error", fail);
    this.child.stdin.on("error", fail);
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString("utf8")).slice(-8192);
    });
    this.exited = new Promise((resolve) => {
      this.child.on("close", (code) => {
        if (!this.closed)
          this.failure ??= new RuntimeError(`Git cat-file exited (${code}): ${this.stderr.trim()}`);
        resolve();
      });
    });
  }

  readBlob(oid: string): Promise<Buffer> {
    if (!objectIdPattern.test(oid))
      return Promise.reject(new RuntimeError("cat-file requires a full object ID"));
    const result = this.queue.then(async () => {
      if (this.closed) throw new RuntimeError("Git cat-file reader is closed");
      if (this.failure) throw this.failure;
      try {
        this.child.stdin.write(`${oid}\n`);
        const header = (await this.readLine()).toString("ascii");
        if (header === `${oid} missing`) throw new RuntimeError(`Git blob is missing: ${oid}`);
        const match = /^(\S+) (\S+) (\d+)$/.exec(header);
        if (!match || match[1] !== oid)
          throw new RuntimeError(`Invalid cat-file header: ${header}`);
        const size = Number(match[3]);
        if (!Number.isSafeInteger(size)) throw new RuntimeError("Invalid cat-file object size");
        const body = await this.readBytes(size);
        if ((await this.readBytes(1))[0] !== 10)
          throw new RuntimeError("Invalid cat-file object terminator");
        if (match[2] !== "blob") throw new RuntimeError(`Expected blob, received ${match[2]}`);
        return body;
      } catch (cause) {
        this.failure ??= new RuntimeError("Cannot read Git blob", { cause });
        this.child.kill();
        throw this.failure;
      }
    });
    this.queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  private async more(): Promise<void> {
    const next = await this.chunks.next();
    if (next.done)
      throw (
        this.failure ?? new RuntimeError(`Unexpected end of cat-file output: ${this.stderr.trim()}`)
      );
    this.buffer = this.buffer.length === 0 ? next.value : Buffer.concat([this.buffer, next.value]);
  }

  private async readLine(): Promise<Buffer> {
    while (!this.buffer.includes(10)) {
      if (this.buffer.length > 1024) throw new RuntimeError("Oversized cat-file header");
      await this.more();
    }
    return this.readBytes(this.buffer.indexOf(10) + 1).then((line) => line.subarray(0, -1));
  }

  private async readBytes(size: number): Promise<Buffer> {
    const parts: Buffer[] = [];
    let remaining = size;
    while (remaining > 0) {
      if (this.buffer.length === 0) await this.more();
      const count = Math.min(remaining, this.buffer.length);
      parts.push(this.buffer.subarray(0, count));
      this.buffer = this.buffer.subarray(count);
      remaining -= count;
    }
    return Buffer.concat(parts, size);
  }

  async close(): Promise<void> {
    if (!this.closed) {
      this.closed = true;
      this.child.stdin.end();
      this.child.kill();
    }
    await this.exited;
    await this.queue;
  }
}
