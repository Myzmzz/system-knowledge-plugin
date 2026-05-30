/**
 * `knowledge validate` — plunginintro.md §7.2.
 *
 * Loads the knowledge base, runs the cross-reference validator, and reports
 * errors / warnings grouped by severity. This is the command CI runs:
 *
 *   knowledge validate --dir examples/deploy-system/knowledge
 *
 * Exit code is 1 when there is at least one error (so CI fails); warnings alone
 * do not fail the command.
 *
 * Pure wrapper: all logic lives in loadKnowledge + validateKnowledge.
 */

import { loadKnowledge } from "../../mcp-server/src/knowledge/loader.js";
import {
  validateKnowledge,
  type ValidationReport,
} from "../../mcp-server/src/knowledge/validate.js";

export interface ValidateOptions {
  /** Explicit knowledge directory (defaults to auto-discovery). */
  dir?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ValidateResult {
  /** True when there are zero errors. */
  ok: boolean;
  report: ValidationReport;
  /** Absolute path of the knowledge directory that was validated. */
  knowledgeDir: string;
  /** Human-readable summary text (already grouped by severity). */
  text: string;
}

/**
 * Core of the validate command. Returns a structured result so tests can assert
 * on `ok` / counts without parsing stdout, and so the argv layer stays thin.
 */
export function runValidate(opts: ValidateOptions = {}): ValidateResult {
  const { knowledge, paths, issues } = loadKnowledge(opts);
  const report = validateKnowledge(knowledge, issues);
  const text = formatReport(report, paths.knowledgeDir);
  return {
    ok: report.ok,
    report,
    knowledgeDir: paths.knowledgeDir,
    text,
  };
}

/** Format the validation report as grouped, human-readable text. */
function formatReport(report: ValidationReport, knowledgeDir: string): string {
  const lines: string[] = [];
  lines.push(`知识库校验：${knowledgeDir}`);
  lines.push("");

  if (report.errors.length > 0) {
    lines.push(`错误 (errors) — ${report.errors.length}：`);
    for (const e of report.errors) {
      const loc = e.location ? ` [${e.location}]` : "";
      lines.push(`  ✗ (${e.code})${loc} ${e.message}`);
    }
    lines.push("");
  }

  if (report.warnings.length > 0) {
    lines.push(`警告 (warnings) — ${report.warnings.length}：`);
    for (const w of report.warnings) {
      const loc = w.location ? ` [${w.location}]` : "";
      lines.push(`  ⚠ (${w.code})${loc} ${w.message}`);
    }
    lines.push("");
  }

  if (report.ok) {
    const note =
      report.warnings.length > 0
        ? `校验通过（无错误，${report.warnings.length} 条警告）。`
        : "校验通过（无错误，无警告）。";
    lines.push(note);
  } else {
    lines.push(`校验失败：${report.errors.length} 个错误。`);
  }

  return lines.join("\n");
}
