/**
 * `knowledge audit-diff` — plunginintro.md §7.5.
 *
 *   knowledge audit-diff
 *   knowledge audit-diff --base main
 *   knowledge audit-diff --changed-files a.jsx,b.jsx   (manual fallback)
 *
 * Gathers changed files from git (unstaged + staged + untracked, deduped) and
 * runs auditChanges to produce advisory suggestions about whether the knowledge
 * graph needs updating. Writes reports/audit-report.md.
 *
 * If the directory is not a git repository, prints a friendly message and falls
 * back to any `--changed-files` provided manually.
 *
 * Pure wrapper around auditChanges; only the git plumbing lives here.
 */

import { execFileSync } from "node:child_process";

import { loadKnowledge } from "../../mcp-server/src/knowledge/loader.js";
import {
  auditChanges,
  type AuditResult,
  type AuditSuggestion,
} from "../../mcp-server/src/lib/audit.js";
import { resolveReportsDir, writeReport } from "../lib/report.js";

export interface AuditDiffOptions {
  /** Diff against this ref (`git diff --name-only <base>...HEAD`). */
  base?: string;
  /** Manual file list (fallback when not a git repo, or to override git). */
  changedFiles?: string[];
  /** Explicit output file path; otherwise reports/audit-report.md. */
  out?: string;
  dir?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface AuditDiffResult {
  /** True when the working directory is inside a git repo. */
  isGitRepo: boolean;
  /** How the changed-file list was obtained. */
  source: "git" | "base" | "manual" | "none";
  result: AuditResult;
  /** Rendered Markdown report. */
  markdown: string;
  /** Absolute path the report was written to (undefined when nothing to do). */
  path?: string;
  /** Human-readable summary text. */
  text: string;
}

/** Run a git command, returning stdout, or undefined if git/the repo is absent. */
function git(args: string[], cwd: string): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return undefined;
  }
}

/** Is `cwd` inside a git work tree? */
export function isGitRepo(cwd: string): boolean {
  const out = git(["rev-parse", "--is-inside-work-tree"], cwd);
  return out?.trim() === "true";
}

/**
 * Collect changed files from git: unstaged + staged + untracked, deduped. When
 * `base` is given, diff against that ref instead (`<base>...HEAD`). Returns an
 * empty array if git fails for any individual command.
 */
export function gatherGitChanges(opts: {
  cwd: string;
  base?: string;
}): string[] {
  const set = new Set<string>();
  const add = (out: string | undefined) => {
    if (!out) return;
    for (const line of out.split("\n")) {
      const f = line.trim();
      if (f) set.add(f);
    }
  };

  if (opts.base) {
    add(git(["diff", "--name-only", `${opts.base}...HEAD`], opts.cwd));
  } else {
    add(git(["diff", "--name-only", "HEAD"], opts.cwd));
    add(git(["diff", "--name-only", "--staged"], opts.cwd));
    add(git(["ls-files", "--others", "--exclude-standard"], opts.cwd));
  }

  return [...set];
}

/** Core of the audit-diff command. */
export function runAuditDiff(opts: AuditDiffOptions = {}): AuditDiffResult {
  const cwd = opts.cwd ?? process.cwd();
  const { knowledge } = loadKnowledge(opts);

  const repo = isGitRepo(cwd);
  let changedFiles: string[];
  let source: AuditDiffResult["source"];

  if (opts.changedFiles?.length) {
    // Manual list always wins (and is the fallback when not a git repo).
    changedFiles = opts.changedFiles;
    source = "manual";
  } else if (repo) {
    changedFiles = gatherGitChanges({ cwd, base: opts.base });
    source = opts.base ? "base" : "git";
  } else {
    changedFiles = [];
    source = "none";
  }

  const result = auditChanges(knowledge, changedFiles);
  const markdown = renderMarkdown(result, source, repo);

  let path: string | undefined;
  // Always write a report when we actually had something to audit, or when a
  // git repo was present (an empty audit is still a useful "nothing changed").
  if (source !== "none") {
    const reportsDir = resolveReportsDir(opts);
    path = writeReport({
      content: markdown,
      outFile: opts.out,
      reportsDir,
      defaultFileName: "audit-report.md",
      cwd,
    });
  }

  const text = renderSummary(result, source, repo, path);

  return { isGitRepo: repo, source, result, markdown, path, text };
}

const SEVERITY_LABEL: Record<AuditSuggestion["severity"], string> = {
  warn: "警告 (warn)",
  info: "提示 (info)",
};

/** Render the Markdown audit report, grouped by severity. */
function renderMarkdown(
  result: AuditResult,
  source: AuditDiffResult["source"],
  repo: boolean,
): string {
  const lines: string[] = [];
  lines.push("# 变更审计 (audit-diff)");
  lines.push("");
  lines.push(`- 是否 git 仓库：${repo ? "是" : "否"}`);
  lines.push(`- 变更来源：${source}`);
  lines.push(`- 变更文件数：${result.changedFiles.length}`);
  lines.push(`- 命中功能：${result.matchedFeatures.length}`);
  lines.push("");

  if (result.changedFiles.length) {
    lines.push("## 变更文件");
    lines.push("");
    for (const f of result.changedFiles) lines.push(`- ${f}`);
    lines.push("");
  }

  const grouped = groupBySeverity(result.suggestions);
  for (const severity of ["warn", "info"] as const) {
    const items = grouped[severity];
    if (!items.length) continue;
    lines.push(`## ${SEVERITY_LABEL[severity]}`);
    lines.push("");
    for (const s of items) {
      lines.push(`- (${s.kind}) ${s.message}`);
    }
    lines.push("");
  }

  if (!result.suggestions.length) {
    lines.push("> 没有需要关注的审计建议。");
    lines.push("");
  }

  return lines.join("\n");
}

function groupBySeverity(
  suggestions: AuditSuggestion[],
): Record<AuditSuggestion["severity"], AuditSuggestion[]> {
  const grouped: Record<AuditSuggestion["severity"], AuditSuggestion[]> = {
    warn: [],
    info: [],
  };
  for (const s of suggestions) grouped[s.severity].push(s);
  return grouped;
}

/** Render the short stdout summary. */
function renderSummary(
  result: AuditResult,
  source: AuditDiffResult["source"],
  repo: boolean,
  path: string | undefined,
): string {
  const lines: string[] = [];

  if (!repo && source === "none") {
    lines.push(
      "当前目录不是 git 仓库。可用 --changed-files a,b,c 手动提供变更文件列表。",
    );
    return lines.join("\n");
  }

  lines.push(
    `变更审计：来源 ${source}，变更文件 ${result.changedFiles.length} 个，` +
      `命中功能 ${result.matchedFeatures.length} 个。`,
  );

  const grouped = groupBySeverity(result.suggestions);
  if (grouped.warn.length) {
    lines.push(`警告 (${grouped.warn.length})：`);
    for (const s of grouped.warn) lines.push(`  ⚠ (${s.kind}) ${s.message}`);
  }
  if (grouped.info.length) {
    lines.push(`提示 (${grouped.info.length})：`);
    for (const s of grouped.info) lines.push(`  • (${s.kind}) ${s.message}`);
  }
  if (!result.suggestions.length) {
    lines.push("没有需要关注的审计建议。");
  }
  if (path) lines.push(`报告输出：${path}`);

  return lines.join("\n");
}
