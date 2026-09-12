import { resolve } from "node:path";
import { errorMessage, exitCodeFor } from "../errors.js";
import { generateGraph } from "../application/generate-graph.js";
import { writeOutput } from "./output.js";
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
    const diagnostics = createLogger(io.stderr, options.verbose);
    const output = await generateGraph(options, diagnostics);
    const start = performance.now();
    if (options.output) await writeOutput(resolve(options.cwd, options.output), output);
    else io.stdout.write(output);
    diagnostics.debug(`Output: ${(performance.now() - start).toFixed(1)} ms`);
    return 0;
  } catch (error) {
    logger.error(errorMessage(error));
    return exitCodeFor(error);
  }
}
