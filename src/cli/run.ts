import { RuntimeError, errorMessage, exitCodeFor } from "../errors.js";
import { createLogger } from "../logger.js";
import type { TextSink } from "../logger.js";
import { getHelp, parseOptions, version } from "./command.js";

export async function runCli(
  args: string[],
  io: { stdout: TextSink; stderr: TextSink } = process,
): Promise<0 | 1 | 2> {
  const logger = createLogger(io.stderr);
  try {
    const options = parseOptions(args);
    if (options.help) {
      io.stdout.write(await getHelp());
      return 0;
    }
    if (options.version) {
      io.stdout.write(`${version}\n`);
      return 0;
    }
    throw new RuntimeError("Graph generation is not implemented yet (Phase 1 scaffold).");
  } catch (error) {
    logger.error(errorMessage(error));
    return exitCodeFor(error);
  }
}
