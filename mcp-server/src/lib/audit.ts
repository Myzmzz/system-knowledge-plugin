/**
 * Change audit — backs `change_audit` (MCP) and `knowledge audit-diff` (CLI).
 * plunginintro.md §6.x / §7.5.
 *
 * Takes the list of changed files (the CLI obtains these from `git diff`) and
 * the knowledge base, and produces advisory prompts about what the knowledge
 * graph may need to keep it in sync with the code. It NEVER edits the graph
 * (§13: auto analysis only suggests).
 */

import type { KnowledgeBase } from "../knowledge/schema.js";
import { mapFilesToFeatures } from "./impact.js";
import { analyzeImpact } from "./impact.js";

export interface AuditSuggestion {
  severity: "info" | "warn";
  kind:
    | "feature-touched"
    | "unregistered-file"
    | "new-page"
    | "new-state"
    | "new-test"
    | "regression";
  file?: string;
  featureId?: string;
  message: string;
}

export interface AuditResult {
  changedFiles: string[];
  matchedFeatures: string[];
  suggestions: AuditSuggestion[];
}

// Heuristics for classifying unregistered files (advisory only).
const PAGE_RE = /(page|view|screen)s?\/|\.(page|view)\.|Page\w*\.(t|j)sx?$/i;
const STATE_RE = /(state|status|reducer|store|machine)/i;
const TEST_RE = /(\.test\.|\.spec\.|__tests__\/|\/tests?\/)/i;

export function auditChanges(kb: KnowledgeBase, changedFiles: string[]): AuditResult {
  const { matched, unmatched } = mapFilesToFeatures(kb, changedFiles);
  const matchedFeatures = Object.keys(matched);
  const suggestions: AuditSuggestion[] = [];

  // Matched features: prompt to review the knowledge entry + run regression.
  for (const [featureId, files] of Object.entries(matched)) {
    suggestions.push({
      severity: "info",
      kind: "feature-touched",
      featureId,
      message: `变更命中功能 ${kb.features[featureId]?.name ?? featureId} 的 code_refs（${files.join(
        "、",
      )}）。请确认 features.yaml / dependencies.yaml 是否仍准确。`,
    });
    const impact = analyzeImpact(kb, { featureId, changeType: "modify" });
    if (impact.regressionTests.length) {
      suggestions.push({
        severity: "warn",
        kind: "regression",
        featureId,
        message: `建议运行回归测试：${impact.regressionTests.join("、")}`,
      });
    }
  }

  // Unregistered files: classify by heuristic.
  for (const file of unmatched) {
    if (TEST_RE.test(file)) {
      suggestions.push({
        severity: "info",
        kind: "new-test",
        file,
        message: `新增/修改测试文件 ${file}，但未关联任何 test-paths.yaml，考虑登记测试路径。`,
      });
    } else if (PAGE_RE.test(file)) {
      suggestions.push({
        severity: "warn",
        kind: "new-page",
        file,
        message: `新增页面文件 ${file} 未登记到 features.yaml，请补充功能节点或标注为内部组件（§10.2）。`,
      });
    } else if (STATE_RE.test(file)) {
      suggestions.push({
        severity: "info",
        kind: "new-state",
        file,
        message: `${file} 看起来涉及状态/状态机，确认 states.yaml 是否需要更新。`,
      });
    } else {
      suggestions.push({
        severity: "info",
        kind: "unregistered-file",
        file,
        message: `变更文件 ${file} 未映射到任何功能 code_refs（可能是新功能或内部实现）。`,
      });
    }
  }

  return { changedFiles, matchedFeatures, suggestions };
}
