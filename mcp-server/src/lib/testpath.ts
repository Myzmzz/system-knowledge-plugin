/**
 * Test-path generation — backs `test_path_generate` (MCP). plunginintro.md §6.6.
 *
 * Strategy:
 *   1. If a test path is REGISTERED with target_feature === featureId, return it
 *      (source: "registered").
 *   2. Otherwise DERIVE a draft from the journey that contains the feature plus
 *      the dependency graph (source: "derived"). Derived paths are clearly
 *      marked so callers never mistake a guess for a vetted path (§6.6).
 */

import type { KnowledgeBase, TestPath } from "../knowledge/schema.js";
import { traceDependencies } from "./dependency.js";

export type TestScope = "e2e" | "unit" | "integration";

export interface GeneratedTestPath {
  featureId: string;
  /** "registered" = taken verbatim from test-paths.yaml; "derived" = inferred. */
  source: "registered" | "derived";
  /** The registered test path id, when source === "registered". */
  testPath?: string;
  /** The journey used to derive, when source === "derived". */
  journey?: string;
  name: string;
  preconditions: string[];
  steps: string[];
  assertions: string[];
  regressionScope: string[];
  /** Present on derived paths: why this is only a draft. */
  note?: string;
}

function fromRegistered(id: string, tp: TestPath, featureId: string): GeneratedTestPath {
  return {
    featureId,
    source: "registered",
    testPath: id,
    journey: tp.journey,
    name: tp.name,
    preconditions: tp.preconditions ?? [],
    steps: tp.steps ?? [],
    assertions: tp.assertions ?? [],
    regressionScope: tp.regression_scope ?? [],
  };
}

export function generateTestPath(
  kb: KnowledgeBase,
  input: { featureId: string; scope?: TestScope },
): GeneratedTestPath {
  const { featureId } = input;

  // 1. Prefer a registered path targeting this feature.
  for (const [id, tp] of Object.entries(kb.testPaths)) {
    if (tp.target_feature === featureId) return fromRegistered(id, tp, featureId);
  }

  // 2. Derive from a journey that includes the feature.
  const journeyEntry = Object.entries(kb.journeys).find(([, j]) =>
    (j.steps ?? []).includes(featureId),
  );

  if (journeyEntry) {
    const [journeyId, journey] = journeyEntry;
    const idx = journey.steps.indexOf(featureId);
    // Upstream steps in the journey become preconditions; the target step + the
    // rest become the exercise steps.
    const priorSteps = journey.steps.slice(0, idx);
    const preconditions = priorSteps.map((s) => `${kb.features[s]?.name ?? s} 已就绪`);
    const steps = journey.steps
      .slice(idx)
      .map((s) => `执行 ${kb.features[s]?.name ?? s}`);
    return {
      featureId,
      source: "derived",
      journey: journeyId,
      name: `${kb.features[featureId]?.name ?? featureId} 推导测试路径`,
      preconditions,
      steps,
      assertions: journey.acceptance ?? [],
      regressionScope: traceDependencies(kb, featureId, {
        direction: "downstream",
        depth: 1,
      }).downstream.map((n) => n.featureId),
      note: "这是基于业务链路推导的测试路径草案，未在 test-paths.yaml 中登记，请人工确认后再正式使用。",
    };
  }

  // 3. Nothing to go on — return a minimal derived skeleton.
  return {
    featureId,
    source: "derived",
    name: `${kb.features[featureId]?.name ?? featureId} 测试路径草案`,
    preconditions: traceDependencies(kb, featureId, { direction: "upstream", depth: 1 }).upstream.map(
      (n) => `${n.name} 已就绪`,
    ),
    steps: [`触发 ${kb.features[featureId]?.name ?? featureId}`, "校验主要产出"],
    assertions: [],
    regressionScope: traceDependencies(kb, featureId, {
      direction: "downstream",
      depth: 1,
    }).downstream.map((n) => n.featureId),
    note: "知识库中没有匹配的业务链路，仅生成最小骨架草案，请补充 journeys.yaml / test-paths.yaml。",
  };
}
