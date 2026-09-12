export interface TextSink {
  write(text: string): unknown;
}

export function createLogger(stderr: TextSink = process.stderr, verbose = false) {
  return {
    warn(message: string): void {
      stderr.write(`Warning: ${message}\n`);
    },
    error(message: string): void {
      stderr.write(`Error: ${message}\n`);
    },
    debug(message: string): void {
      if (verbose) stderr.write(`${message}\n`);
    },
  };
}
