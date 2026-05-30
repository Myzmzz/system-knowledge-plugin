/**
 * `knowledge impact` — plunginintro.md §7.4.
 *
 *   knowledge impact --feature deploy-config
 *   knowledge impact --changed-files a.jsx,b.jsx
 *
 * Wraps analyzeImpact (and mapFilesToFeatures). When `--changed-files` is given
 * without an explicit `--feature`, the files are first mapped to features and an
 * impact analysis is run for each matched feature.
 *
 * Writes reports/impact-report.md and prints a summary. Pure wrapper.
 */

import { loadKnowledge } from "../../mcp-server/src/knowledge/loader.js";
import {
  analyzeImpact,
  mapFilesToFeatures,
  type ChangeType,
  type ImpactResult,
} from "../../mcp-server/src/lib/impact.js";
import type { KnowledgeBase } from "../../mcp-server/src/knowledge/schema.js";
import { resolveReportsDir, writeReport } from "../lib/report.js";

export interface ImpactOptions {
  /** Target feature id. Optional if `changedFiles` is provided. */
  feature?: string;
  /** Changed file paths (already split from any CSV). */
  changedFiles?: string[];
  changeType?: ChangeType;
  /** Explicit output file path; otherwise reports/impact-report.md. */
  out?: string;
  dir?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ImpactCommandResult {
  /** One ImpactResult per analysed feature. */
  results: ImpactResult[];
  /** Files that mapped to no feature (only when changedFiles was used). */
  unmatchedFiles: string[];
  /** Rendered Markdown report. */
  markdown: string;
  /** Absolute path the report was written to. */
  path: string;
  /** Human-readable summary text. */
  text: string;
}

/**
 * Decide which feature(s) to analyse, then run analyzeImpact for each. Exported
 * so tests can assert on `directImpact` etc. without filesystem writes.
 */
export function computeImpact(
  kb: KnowledgeBase,
  opts: ImpactOptions,
): { results: ImpactResult[]; unmatchedFiles: string[] } {
  const changedFiles = opts.changedFiles ?? [];
  const results: ImpactResult[] = [];
  let unmatchedFiles: string[] = [];

  if (opts.feature) {
    // Explicit feature: a single analysis, optionally informed by changed files.
    results.push(
      analyzeImpact(kb, {
        featureId: opts.feature,
        changeType: opts.changeType,
        changedFiles: changedFiles.length ? changedFiles : undefined,
      }),
    );
    if (changedFiles.length) {
      unmatchedFiles = mapFilesToFeatures(kb, changedFiles).unmatched;
    }
  } else if (changedFiles.length) {
    // No explicit feature: map files -> features, analyse each match.
    const { matched, unmatched } = mapFilesToFeatures(kb, changedFiles);
    unmatchedFiles = unmatched;
    for (const featureId of Object.keys(matched)) {
      results.push(
        analyzeImpact(kb, {
          featureId,
          changeType: opts.changeType,
          changedFiles,
        }),
      );
    }
  } else {
    throw new Error("impact 需要 --feature <id> 或 --changed-files a,b,c");
  }

  return { results, unmatchedFiles };
}

/** Core of the impact command: compute impact and write the Markdown report. */
export function runImpact(opts: ImpactOptions): ImpactCommandResult {
  const { knowledge } = loadKnowledge(opts);
  const { results, unmatchedFiles } = computeImpact(knowledge, opts);

  const markdown = renderMarkdown(knowledge, results, unmatchedFiles, opts);

  const reportsDir = resolveReportsDir(opts);
  const path = writeReport({
    content: markdown,
    outFile: opts.out,
    reportsDir,
    defaultFileName: "impact-report.md",
    cwd: opts.cwd,
  });

  const text = renderSummary(results, unmatchedFiles, path);

  return { results, unmatchedFiles, markdown, path, text };
}

function featureName(kb: KnowledgeBase, id: string): string {
  return kb.features[id]?.name ?? id;
}

/** Render the full Markdown impact report. */
function renderMarkdown(
  kb: KnowledgeBase,
  results: ImpactResult[],
  unmatchedFiles: string[],
  opts: ImpactOptions,
): string {
  const lines: string[] = [];
  lines.push("# 影响面分析 (impact report)");
  lines.push("");

  if (opts.changedFiles?.length) {
    lines.push(`变更文件：${opts.changedFiles.join("、")}`);
    lines.push("");
  }

  if (results.length === 0) {
    lines.push("> 没有匹配到任何功能。");
  }

  for (const r of results) {
    lines.push(`## ${featureName(kb, r.featureId)} (\`${r.featureId}\`)`);
    lines.push("");
    lines.push(`- 变更类型：${r.changeType}`);
    lines.push(
      `- 直接下游影响 (${r.directImpact.length})：${
        r.directImpact.length
          ? r.directImpact.map((id) => `${featureName(kb, id)} (\`${id}\`)`).join("、")
          : "无"
      }`,
    );
    lines.push(
      `- 受影响实体 (${r.affectedEntities.length})：${
        r.affectedEntities.length ? r.affectedEntities.join("、") : "无"
      }`,
    );
    lines.push(
      `- 建议回归测试路径 (${r.regressionTests.length})：${
        r.regressionTests.length ? r.regressionTests.join("、") : "无"
      }`,
    );
    if (r.changedFeatures?.length) {
      lines.push(`- 命中变更功能：${r.changedFeatures.join("、")}`);
    }
    lines.push("");
    lines.push("知识图更新建议：");
    for (const s of r.knowledgeUpdateSuggestions) {
      lines.push(`- ${s}`);
    }
    lines.push("");
  }

  if (unmatchedFiles.length) {
    lines.push("## 未映射到功能的变更文件");
    lines.push("");
    for (const f of unmatchedFiles) {
      lines.push(`- ${f}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Render the short stdout summary. */
function renderSummary(
  results: ImpactResult[],
  unmatchedFiles: string[],
  path: string,
): string {
  const lines: string[] = [];
  if (results.length === 0) {
    lines.push("影响面分析：没有匹配到任何功能。");
  }
  for (const r of results) {
    lines.push(
      `功能 ${r.featureId}（${r.changeType}）：直接下游 ${r.directImpact.length}，` +
        `受影响实体 ${r.affectedEntities.length}，回归测试 ${r.regressionTests.length}。`,
    );
  }
  if (unmatchedFiles.length) {
    lines.push(`未映射文件：${unmatchedFiles.join("、")}`);
  }
  lines.push(`报告输出：${path}`);
  return lines.join("\n");
}
