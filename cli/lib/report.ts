/**
 * Shared helpers for the `knowledge` CLI commands.
 *
 * Centralises the (small) amount of filesystem and argument plumbing that every
 * command needs so that the command core functions stay focused on wrapping the
 * already-existing algorithm library (mcp-server/src/lib + knowledge modules).
 *
 * Nothing here re-implements an algorithm — these are pure I/O / formatting
 * conveniences.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { resolveKnowledgePaths } from "../../mcp-server/src/knowledge/paths.js";

/**
 * Decide where generated reports should be written.
 *
 * Resolution order:
 *   1. An explicit `out` path (relative paths are resolved against cwd).
 *   2. A sibling `reports/` directory next to the knowledge directory's parent
 *      (e.g. `examples/deploy-system/knowledge` -> `examples/deploy-system/reports`,
 *      and the project root's `knowledge` -> `reports`). This mirrors the layout
 *      documented in plunginintro.md §3 and matches the `.gitignore` patterns.
 *
 * The returned value is the *directory* that reports go into. Callers join their
 * own filename onto it via {@link writeReport}.
 */
export function resolveReportsDir(opts: {
  dir?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const cwd = opts.cwd ?? process.cwd();
  const { knowledgeDir } = resolveKnowledgePaths(opts);
  // knowledge dir's parent is the "project" root for report purposes.
  return path.resolve(cwd, path.join(knowledgeDir, "..", "reports"));
}

/**
 * Write `content` to a report file, creating the parent directory if needed.
 *
 * @param outFile  Either an absolute/relative explicit file path (used as-is,
 *                 resolved against cwd) or, when `reportsDir` is supplied, a bare
 *                 filename joined onto that directory.
 * @returns the absolute path that was written.
 */
export function writeReport(args: {
  content: string;
  /** Explicit `--out` path, if the user passed one. */
  outFile?: string;
  /** Default reports directory (from {@link resolveReportsDir}). */
  reportsDir: string;
  /** Default filename used when `outFile` is not provided. */
  defaultFileName: string;
  cwd?: string;
}): string {
  const cwd = args.cwd ?? process.cwd();
  const target = args.outFile
    ? path.resolve(cwd, args.outFile)
    : path.join(args.reportsDir, args.defaultFileName);

  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, args.content, "utf8");
  return target;
}

/** Wrap raw Mermaid source in a Markdown fenced ```mermaid block. */
export function mermaidMarkdown(title: string, mermaidSource: string): string {
  return `# ${title}\n\n\`\`\`mermaid\n${mermaidSource}\n\`\`\`\n`;
}

/** Split a comma-separated `--changed-files a,b,c` value into a clean list. */
export function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
