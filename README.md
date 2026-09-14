# ts-graph

[日本語](README.ja.md)

Visualize TypeScript dependencies around Git changes as a single Mermaid flowchart.
Compare two revisions, staged changes, or your working tree without changing your
branch, index, or source files. Both old and new dependencies appear in the same graph.

## Requirements and installation

Node.js **24 or later** and Git on `PATH`. Supports macOS, Linux, and Windows.
The CLI is ESM and uses its own TypeScript `^6.0.3` dependency for analysis.

Install in the project you want to analyze:

```sh
pnpm add -D @tapioca24/ts-graph
pnpm exec ts-graph --help
pnpm exec ts-graph . --format markdown -o graph.md
```

Examples below use `ts-graph` directly;
prefix it with `pnpm exec` when installed locally.

## Choose a comparison

```text
ts-graph [target] [compare-with] [options]
```

The **new side comes first**, then the base side.

| Command                 | Base       | Target                          |
| ----------------------- | ---------- | ------------------------------- |
| `ts-graph`              | `HEAD^`    | `HEAD`                          |
| `ts-graph feature`      | `feature^` | `feature`                       |
| `ts-graph feature main` | `main`     | `feature`                       |
| `ts-graph @ main`       | `main`     | `HEAD`                          |
| `ts-graph .`            | `HEAD`     | Working tree, staged + unstaged |
| `ts-graph . main`       | `main`     | Working tree                    |
| `ts-graph staged`       | `HEAD`     | Index                           |
| `ts-graph working`      | Index      | Working tree                    |

Revisions may be local commits, branches, or tags. `@` means `HEAD`.
`staged` and `working` reject a second positional argument.
The default comparison requires a parent commit; for an initial commit, compare
`HEAD HEAD` for an empty graph or use `.` for subsequent local edits.

```sh
ts-graph feature main --merge-base
ts-graph . --include-untracked
ts-graph working --include-untracked
```

`--merge-base` replaces the base with the merge base and only accepts revision
comparisons. `--include-untracked` only works with `.` or `working`.
Missing revisions or merge bases cause errors; fetch the needed history yourself
(for example `git fetch origin main`, or `git fetch --unshallow` in a shallow clone).
The CLI never fetches automatically.

## Options

| Option                         | Default              | Meaning                                                                   |
| ------------------------------ | -------------------- | ------------------------------------------------------------------------- |
| `--merge-base`                 | `false`              | Use the merge base of two revisions                                       |
| `--include-untracked`          | `false`              | Include untracked files with `.` or `working`                             |
| `--cwd <path>`                 | Current directory    | Start inside the target repository                                        |
| `--tsconfig <path>`            | Root `tsconfig.json` | Repository-relative config; repeatable                                    |
| `--depth <n\|all>`             | `1`                  | Distance from changes, following imports in both directions; `0` is valid |
| `--max-nodes <n\|all>`         | `50`                 | Limit unchanged related files; positive integer or `all`                  |
| `--exclude <glob>`             | None                 | Repository-relative exclusion glob; repeatable                            |
| `--direction <LR\|RL\|TB\|BT>` | `LR`                 | Flowchart direction                                                       |
| `--no-group-directories`       | Grouping enabled     | Use flat repository-relative labels                                       |
| `--legend`                     | `false`              | Show the change-status legend                                             |
| `--edge-label <json>`          | None                 | Annotation object or array; repeatable                                    |
| `--edge-label-file <path>`     | None                 | Read an annotation array from a JSON file                                 |
| `--format <mermaid\|markdown>` | `mermaid`            | Raw Mermaid or a fenced Markdown block                                    |
| `-o, --output <path>`          | stdout               | Write a file using a temporary file and rename                            |
| `--verbose`                    | `false`              | Diagnostics and timings on stderr                                         |
| `-h, --help`                   | —                    | Show help                                                                 |
| `-v, --version`                | —                    | Show package version                                                      |

```sh
ts-graph @ main --cwd /path/to/repo
ts-graph . --tsconfig packages/app/tsconfig.json --tsconfig packages/lib/tsconfig.json
ts-graph . --depth 0
ts-graph . --depth all --max-nodes all
ts-graph . --exclude '**/*.test.ts' --exclude 'generated/**'
ts-graph . --direction TB --no-group-directories --legend
ts-graph . --format markdown --output graph.md --verbose
ts-graph --help
ts-graph --version
```

`--tsconfig` and `--exclude` are relative to repository root, including when invoked
from a subdirectory. Annotation file and output paths are relative to `--cwd` (or the
current directory). The output directory must already exist.
Quote globs to prevent shell expansion. Examples use POSIX shell quoting; JSON
quoting differs in Windows shells, where `--edge-label-file` is convenient.

All changed files survive the node limit, except those explicitly excluded.
Unchanged files are selected by distance, then path, deterministically.
Exclusion stops traversal through that file. Truncation adds an omitted-files node
and a warning on stderr. No implicit exclusion of tests or stories is applied.

## Read the graph

Arrows run from the **importing file to the imported file**. Type-only imports
count too. Multiple imports between the same files become one arrow; self-edges
are removed. Cycles are supported. Directory subgraphs collapse common leading
directories; the default layout is left to right. The legend uses invisible layout links between
groups; `--direction` controls the dependency graph inside the upper group. Use `--legend` to show
the legend and its layout groups and links.

The graph uses [Catppuccin Macchiato](https://github.com/catppuccin/catppuccin#-palette):

| Element                 | Style                                                  | Meaning                                          |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| Unchanged file          | Surface 0 `#363a4f`                                    | Present in both analyzed snapshots               |
| Added file / dependency | Green `#a6da95`                                        | Present only in target                           |
| Modified file           | Yellow `#eed49f`                                       | Modified according to Git                        |
| Deleted file            | Red `#ed8796`, dashed border                           | Present only in base                             |
| Unchanged dependency    | Solid, Overlay 0 `#6e738d`                             | Present in both snapshots                        |
| Deleted dependency      | Red dashed arrow                                       | Present only in base                             |
| Rename relation         | Mauve `#c6a0f6`, dotted/dashed arrow labeled `renamed` | Links the deleted old path to the added new path |

Canvas is Base `#24273a`, regular text is Text `#cad3f5`, and accent text is Base.
A rename relation is separate from a dependency. Rename detection uses Git's default
similarity heuristic; copies appear as additions. Modified files retain both old
and new dependencies, so a red arrow describes a removed import, not a current one.

## Annotate dependency edges

Create `labels.json`:

```json
[{ "from": "src/a.ts", "to": "src/b.ts", "label": "Fetch user data" }]
```

```sh
ts-graph . --edge-label-file labels.json
ts-graph . --edge-label '{"from":"src/a.ts","to":"src/b.ts","label":"Fetch user data"}'
ts-graph . --edge-label '[{"from":"src/a.ts","to":"src/b.ts","label":"Fetch user data"}]'
```

Only `from`, `to`, and `label` are allowed, all nonblank strings. Files require an
array; inline JSON also accepts one object. Paths are normalized to repository-relative
POSIX paths. Absolute paths and escaping the repository are rejected. Labels are
plain text: HTML and Mermaid characters are escaped, newlines become safe `<br/>`,
and Mermaid uses `securityLevel: strict`.

Inline and file entries are combined. Duplicate edges, including normalized path
duplicates, cause input errors. The dependency must be in the **displayed graph**
after depth, exclusion, and node limits; invalid entries include nearby valid-edge
suggestions. Rename relations cannot be annotated.

The packaged [JSON Schema](schemas/annotations.schema.json) describes annotation
files. Point your editor's JSON schema association at
`node_modules/@tapioca24/ts-graph/schemas/annotations.schema.json`.
Path safety, duplicates, and displayed-edge existence are additionally checked by
the CLI; JSON Schema cannot establish which graph edges exist.

## Output and errors

Successful graph generation writes only Mermaid/Markdown to stdout. Warnings and
verbose timings go to stderr. With `--output`, stdout is empty and the file is
replaced by rename where supported. Help and version print their requested text.

| Exit code | Meaning                                                  |
| --------- | -------------------------------------------------------- |
| `0`       | Success, including a valid `No TypeScript changes` graph |
| `1`       | Git, filesystem, or tsconfig runtime error               |
| `2`       | Invalid CLI input or annotation                          |

Unresolved imports produce warnings and omit those edges. Ordinary TypeScript
type errors do not stop analysis. Invalid tsconfig syntax or an unbuildable project
fails. Changed TypeScript files outside the selected projects produce warnings.

## Analysis and limitations

- Supports `.ts`, `.tsx`, `.mts`, `.cts`, and `.d.ts`; with `allowJs`, also `.js`,
  `.jsx`, `.mjs`, and `.cjs`; with `resolveJsonModule`, imported `.json` files.
- Includes static/type/side-effect imports, re-exports, and string-literal
  `import()` and `require()`. Computed module names are not analyzed.
- Uses TypeScript resolution for `paths`, `baseUrl`, package exports, and internal
  workspace packages. Recursively follows project references and unions repeated
  projects by repository-relative path.
- Reads each snapshot's tsconfig. A selected config may exist on only one side;
  absence on both sides is an error. Current installed `node_modules` supplies
  external resolution and config `extends`, which may differ from historical
  dependencies. External packages and TypeScript standard libraries are not nodes.
- Reads snapshots without checkout, staging, or executing target code/configuration.
  Conflicted indexes fail explicitly. Git LFS content download and submodule
  traversal are unsupported; unparseable TypeScript content is warned about.
- No `.vue`, `.svelte`, MDX, Astro, watch mode, graph rules, public library API,
  PR URL fetching, stdin unified diff, or automatic network access.
- Emits Mermaid text only. Bring your own Mermaid viewer; SVG/PNG rendering and a
  browser UI are not bundled. Viewer policy may override theme directives.
- Extremely deep import chains may exceed the TypeScript Compiler API call stack.
  A single 10,000-file cycle failed in local testing; `--depth` limits display, not analysis.

## Development and performance

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm test:integration
pnpm test:pack
pnpm benchmark
```

`test:pack` builds and packs, checks the file allowlist, installs the tarball into
a temporary project with production dependencies, then invokes the installed bin
for help, version, and annotated analysis. It needs registry access/cache and `tar`.
CI runs quality and pack checks on Linux, and Git/TypeScript/CLI integration tests
on Linux, macOS, and Windows with Node.js 24. Actions are pinned to commit SHAs.

The benchmark generates 10,000 source files with 20 changes, compares two commits
at depth 1, and reports three fresh-process runs with timings and peak RSS.
The advisory target is about 10 seconds and less than 1 GiB; it is not a CI gate.
See [benchmark methodology](https://github.com/tapioca24/ts-graph/blob/main/docs/benchmark.md)
for generator reuse, measurement boundaries, and recorded results.

## Credits and license

Inspired by [delta-typescript-graph-action](https://github.com/ysk8hori/delta-typescript-graph-action),
[typescript-graph](https://github.com/ysk8hori/typescript-graph), and
[difit](https://github.com/yoshiko-pg/difit). The CLI's target/base ordering follows
difit. This is an independent implementation; their source code was not copied.
Colors come from Catppuccin Macchiato. Licensed under [MIT](LICENSE).
