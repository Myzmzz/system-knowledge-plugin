/**
 * Change-impact analysis — backs `impact_analyze` (MCP) and `knowledge impact`
 * (CLI). plunginintro.md §6.5.
 *
 * Given a feature (and optionally the files that changed), compute:
 *   - directImpact:   downstream features that consume it
 *   - affectedEntities: entities used by the feature or its downstream
 *   - regressionTests: test paths whose target/regression_scope is touched
 *   - knowledgeUpdateSuggestions: advisory hints (never auto-decides business truth)
 *
 * Per §13 this is advisory only — it suggests, it does not mutate.
 */

import type { KnowledgeBase } from "../knowledge/schema.js";
import { traceDependencies } from "./dependency.js";

export type ChangeType = "add" | "modify" | "remove";

export interface ImpactResult {
  featureId: string;
  changeType: ChangeType;
  /** Downstream features directly impacted. */
  directImpact: string[];
  /** Entities consumed by the feature or any directly-impacted feature. */
  affectedEntities: string[];
  /** Test path ids that should be re-run. */
  regressionTests: string[];
  /** Human-facing advisory suggestions. */
  knowledgeUpdateSuggestions: string[];
  /** When changedFiles were supplied: which features they mapped to. */
  changedFeatures?: string[];
}

/** Map changed file paths to feature ids via each feature's `code_refs`. */
export function mapFilesToFeatures(
  kb: KnowledgeBase,
  changedFiles: string[],
): { matched: Record<string, string[]>; unmatched: string[] } {
  const matched: Record<string, string[]> = {};
  const unmatched: string[] = [];

  for (const file of changedFiles) {
    const norm = file.replace(/\\/g, "/");
    let hit = false;
    for (const [featureId, feature] of Object.entries(kb.features)) {
      for (const ref of feature.code_refs ?? []) {
        const refNorm = ref.replace(/\\/g, "/");
        // match on suffix or substring either direction (refs may be partial paths)
        if (norm.endsWith(refNorm) || refNorm.endsWith(norm) || norm.includes(refNorm)) {
          (matched[featureId] ??= []).push(file);
          hit = true;
        }
      }
    }
    if (!hit) unmatched.push(file);
  }
  return { matched, unmatched };
}

export function analyzeImpact(
  kb: KnowledgeBase,
  input: { featureId: string; changeType?: ChangeType; changedFiles?: string[] },
): ImpactResult {
  const changeType = input.changeType ?? "modify";

  // Seed feature set: the target plus any features the changed files map to.
  const seeds = new Set<string>([input.featureId]);
  let changedFeatures: string[] | undefined;
  if (input.changedFiles?.length) {
    const { matched } = mapFilesToFeatures(kb, input.changedFiles);
    changedFeatures = Object.keys(matched);
    for (const f of changedFeatures) seeds.add(f);
  }

  // Direct downstream impact across all seeds (depth 1).
  const directImpact = new Set<string>();
  for (const seed of seeds) {
    for (const node of traceDependencies(kb, seed, { direction: "downstream", depth: 1 }).downstream) {
      directImpact.add(node.featureId);
    }
  }

  // Entities used by any seed or directly-impacted feature.
  const touched = new Set<string>([...seeds, ...directImpact]);
  const affectedEntities = new Set<string>();
  for (const [entityName, entity] of Object.entries(kb.entities)) {
    if ((entity.used_by ?? []).some((f) => touched.has(f))) {
      affectedEntities.add(entityName);
    }
  }

  // Regression tests: target_feature touched, or regression_scope intersects touched.
  const regressionTests = new Set<string>();
  for (const [testId, tp] of Object.entries(kb.testPaths)) {
    if (touched.has(tp.target_feature)) regressionTests.add(testId);
    if ((tp.regression_scope ?? []).some((f) => touched.has(f))) regressionTests.add(testId);
  }

  // Advisory suggestions.
  const suggestions: string[] = [];
  const featureName = kb.features[input.featureId]?.name ?? input.featureId;
  suggestions.push(
    `检查 features.yaml 中 ${input.featureId} 的 used_by 是否需要更新（当前直接下游 ${directImpact.size} 个）`,
  );
  if (regressionTests.size === 0) {
    suggestions.push(
      `${featureName} 当前没有任何关联测试路径，建议在 test-paths.yaml 中补充覆盖`,
    );
  } else {
    suggestions.push(`建议运行回归测试路径：${[...regressionTests].join("、")}`);
  }
  if (changedFeatures && input.changedFiles?.length) {
    const { unmatched } = mapFilesToFeatures(kb, input.changedFiles);
    if (unmatched.length) {
      suggestions.push(
        `以下变更文件未映射到任何功能 code_refs，可能需要登记新功能：${unmatched.join("、")}`,
      );
    }
  }
  if (changeType === "remove") {
    suggestions.push(
      `这是删除型变更：确认 ${directImpact.size} 个下游功能在 ${input.featureId} 移除后仍然成立`,
    );
  }

  return {
    featureId: input.featureId,
    changeType,
    directImpact: [...directImpact],
    affectedEntities: [...affectedEntities],
    regressionTests: [...regressionTests],
    knowledgeUpdateSuggestions: suggestions,
    changedFeatures,
  };
}
