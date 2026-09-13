import { dirname, resolve } from "node:path";
import ts from "typescript";
import { RuntimeError } from "../errors.js";
import type { SnapshotHost } from "./compiler-host.js";

export function readProjects(host: SnapshotHost, configs: readonly string[]) {
  const projects = new Map<string, ts.ParsedCommandLine>();
  const visiting = new Set<string>();
  const visit = (file: string) => {
    file = resolve(host.root, file);
    if (!host.repoPath(file)) throw new RuntimeError(`Project is outside repository: ${file}`);
    if (visiting.has(file)) throw new RuntimeError(`Circular project references: ${file}`);
    if (projects.has(file)) return;
    visiting.add(file);
    const errors: ts.Diagnostic[] = [];
    const parsed = ts.getParsedCommandLineOfConfigFile(
      file,
      {},
      {
        ...host,
        onUnRecoverableConfigFileDiagnostic: (diagnostic) => errors.push(diagnostic),
      },
    );
    errors.push(...(parsed?.errors ?? []));
    if (!parsed || errors.length) {
      throw new RuntimeError(
        `Cannot parse tsconfig ${file}: ${errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")).join("\n")}`,
      );
    }
    for (const source of parsed.fileNames) {
      if (!host.fileExists(source)) throw new RuntimeError(`Missing project source: ${source}`);
    }
    for (const ref of parsed.projectReferences ?? []) {
      const path = resolve(dirname(file), ref.path);
      visit(host.directoryExists(path) ? resolve(path, "tsconfig.json") : path);
    }
    projects.set(file, parsed);
    visiting.delete(file);
  };
  for (const config of [...new Set(configs)].sort()) visit(config);
  return [...projects.values()];
}
