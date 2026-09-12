import { dirname, resolve, relative, isAbsolute, sep, posix } from "node:path";
import ts from "typescript";
import type { SnapshotReader } from "../git/snapshots.js";

const slash = (path: string) => path.split(sep).join("/");
const external = (path: string) => slash(path).split("/").includes("node_modules");

// tsconfig supports only *, ? and **; brackets/braces are literal path characters.
function configPattern(base: string, glob: string, exclude: boolean): RegExp {
  let full = slash(resolve(base, glob));
  if (!exclude && !/[?*]/.test(posix.basename(full)) && !posix.extname(full)) full += "/**/*";
  const segments = full.split("/");
  const parts = segments.map((part, index) => {
    if (part === "**" && exclude && index === segments.length - 1) return ".*";
    if (part === "**")
      return exclude
        ? "(?:[^/]+/)*"
        : "(?:(?![.]|node_modules/|bower_components/|jspm_packages/)[^/]+/)*";
    const body = part.replace(/[\\^$.*+?()[\]{}|]/g, (char) =>
      char === "*" ? "[^/]*" : char === "?" ? "[^/]" : `\\${char}`,
    );
    return (!exclude && /^[*?]/.test(part) ? "(?![.])" : "") + body;
  });
  let expression = "";
  for (let i = 0; i < parts.length; i++) {
    expression += parts[i];
    if (i < parts.length - 1 && segments[i] !== "**") expression += "/";
  }
  return new RegExp(`^${expression}${exclude ? "(?:/.*)?" : ""}$`);
}

/** Materialize asynchronous snapshot reads once for the synchronous Compiler API. */
export async function createSnapshotHost(root: string, snapshot: SnapshotReader) {
  root = resolve(root);
  const texts = new Map<string, string>();
  const directories = new Set<string>([root]);
  for (const path of snapshot.listFiles()) {
    const absolute = resolve(root, path);
    if (external(absolute)) continue;
    const bytes = await snapshot.readFile(path);
    if (bytes === undefined) continue;
    texts.set(absolute, bytes.toString("utf8"));
    for (let dir = dirname(absolute); !directories.has(dir); dir = dirname(dir)) {
      directories.add(dir);
      if (dir === dirname(dir)) break;
    }
  }
  const repoPath = (file: string): string | undefined => {
    const absolute = resolve(root, file);
    const path = relative(root, absolute);
    return path &&
      !isAbsolute(path) &&
      path !== ".." &&
      !path.startsWith(`..${sep}`) &&
      !external(absolute)
      ? slash(path)
      : undefined;
  };
  // Resolve the installed package link, then read workspace metadata/sources from
  // the snapshot, including files that no longer exist in the working tree.
  const physicalPaths = new Map<string, string>();
  const physicalPath = (file: string): string => {
    const absolute = resolve(root, file);
    if (!external(absolute)) return absolute;
    const cached = physicalPaths.get(absolute);
    if (cached) return cached;
    let ancestor = absolute;
    while (external(ancestor)) {
      const canonical = ts.sys.realpath?.(ancestor) ?? ancestor;
      if (canonical !== ancestor) {
        const result = resolve(canonical, relative(ancestor, absolute));
        physicalPaths.set(absolute, result);
        return result;
      }
      ancestor = dirname(ancestor);
    }
    physicalPaths.set(absolute, absolute);
    return absolute;
  };
  const readFile = (file: string) => {
    const absolute = physicalPath(file);
    return external(absolute) ? ts.sys.readFile(absolute) : texts.get(absolute);
  };
  const fileExists = (file: string) => {
    const absolute = physicalPath(file);
    return external(absolute) ? ts.sys.fileExists(absolute) : texts.has(absolute);
  };
  const directoryExists = (dir: string) => {
    const absolute = physicalPath(dir);
    return external(absolute) ? ts.sys.directoryExists(absolute) : directories.has(absolute);
  };
  const getDirectories = (dir: string) => {
    const absolute = physicalPath(dir);
    return external(absolute)
      ? ts.sys.getDirectories(absolute)
      : [...directories]
          .filter((entry) => entry !== absolute && dirname(entry) === absolute)
          .map((entry) => slash(relative(absolute, entry)))
          .sort();
  };
  const readDirectory: ts.ParseConfigHost["readDirectory"] = (
    dir,
    extensions,
    excludes,
    includes,
    depth,
  ) => {
    const absolute = physicalPath(dir);
    if (external(absolute))
      return ts.sys.readDirectory(absolute, extensions, excludes, includes, depth);
    const included = (includes ?? ["**/*"]).map((glob) => configPattern(absolute, glob, false));
    const excluded = (excludes ?? []).map((glob) => configPattern(absolute, glob, true));
    return [...texts.keys()]
      .filter((file) => {
        const rel = relative(absolute, file);
        if (depth !== undefined && rel.split(sep).length > depth) return false;
        if (extensions && !extensions.some((ext) => file.endsWith(ext))) return false;
        const name = slash(file);
        return (
          included.some((pattern) => pattern.test(name)) &&
          !excluded.some((pattern) => pattern.test(name))
        );
      })
      .sort();
  };
  const fs = {
    readFile,
    fileExists,
    directoryExists,
    getDirectories,
    readDirectory,
    realpath: physicalPath,
    getCurrentDirectory: () => root,
    useCaseSensitiveFileNames: true,
  };
  const compilerHost = (options: ts.CompilerOptions): ts.CompilerHost => ({
    ...ts.createCompilerHost(options),
    ...fs,
    readDirectory: (...args) => [...readDirectory(...args)],
    useCaseSensitiveFileNames: () => true,
    getCanonicalFileName: (file) => file,
    // A project's traceResolution option must not write to the CLI's stdout.
    trace() {},
    getSourceFile(file, languageVersion) {
      const text = readFile(file);
      const format = ts.getImpliedNodeFormatForFile(file, undefined, fs, options);
      const sourceOptions =
        typeof languageVersion === "number"
          ? { languageVersion, ...(format === undefined ? {} : { impliedNodeFormat: format }) }
          : languageVersion;
      return text === undefined ? undefined : ts.createSourceFile(file, text, sourceOptions, true);
    },
    writeFile() {
      throw new Error("Snapshot CompilerHost is read-only");
    },
  });
  return { ...fs, root, repoPath, compilerHost };
}

export type SnapshotHost = Awaited<ReturnType<typeof createSnapshotHost>>;
