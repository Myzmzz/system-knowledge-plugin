/**
 * Knowledge-base validation — plunginintro.md §10.
 *
 * Two tiers:
 *   - ERRORS  (§10.1 base rules): broken references, missing required journey
 *     fields, etc. These should fail CI.
 *   - WARNINGS (§10.2 quality rules): core feature without a test path, danger
 *     ops without failure recovery, test paths that are only button-clicks, etc.
 *
 * Cross-reference checks live here (not in the loader), because the loader only
 * enforces per-file shape. Schema/parse problems from the loader are folded in
 * as errors so a single report covers everything.
 */

import type { KnowledgeBase } from "./schema.js";
import type { LoadIssue } from "./loader.js";

export type Severity = "error" | "warning";

export interface ValidationIssue {
  severity: Severity;
  code: string;
  message: string;
  location?: string;
}

export interface ValidationReport {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const DANGER_RE =
  /(deploy|delete|remove|uninstall|drop|revoke|卸载|删除|部署|权限|凭证|密钥|credential|permission|secret|token)/i;

/** A feature is "core" if it appears in a journey, or is usable/production. */
function coreFeatureIds(kb: KnowledgeBase): Set<string> {
  const core = new Set<string>();
  for (const j of Object.values(kb.journeys)) {
    for (const step of j.steps ?? []) core.add(step);
  }
  for (const [id, f] of Object.entries(kb.features)) {
    if (f.maturity === "usable" || f.maturity === "production") core.add(id);
  }
  return core;
}

export function validateKnowledge(
  kb: KnowledgeBase,
  loadIssues: LoadIssue[] = [],
): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const featureIds = new Set(Object.keys(kb.features));

  // Fold schema/parse problems in as errors.
  for (const issue of loadIssues) {
    errors.push({
      severity: "error",
      code: "schema",
      message: issue.message,
      location: `${issue.file}:${issue.path}`,
    });
  }

  // --- §10.1 base rules: reference integrity ---------------------------------
  for (const [id, f] of Object.entries(kb.features)) {
    for (const dep of f.depends_on ?? []) {
      if (!featureIds.has(dep)) {
        errors.push({
          severity: "error",
          code: "ref.depends_on",
          message: `功能 ${id} 的 depends_on 引用了不存在的功能 ${dep}`,
          location: `features.${id}`,
        });
      }
    }
    for (const dep of f.used_by ?? []) {
      if (!featureIds.has(dep)) {
        errors.push({
          severity: "error",
          code: "ref.used_by",
          message: `功能 ${id} 的 used_by 引用了不存在的功能 ${dep}`,
          location: `features.${id}`,
        });
      }
    }
  }

  for (const [i, edge] of kb.dependencies.entries()) {
    if (!featureIds.has(edge.from)) {
      errors.push({
        severity: "error",
        code: "ref.edge.from",
        message: `依赖边 #${i} 的 from=${edge.from} 不是已登记功能`,
        location: `dependencies[${i}]`,
      });
    }
    if (!featureIds.has(edge.to)) {
      errors.push({
        severity: "error",
        code: "ref.edge.to",
        message: `依赖边 #${i} 的 to=${edge.to} 不是已登记功能`,
        location: `dependencies[${i}]`,
      });
    }
    if (!edge.reason || !edge.reason.trim()) {
      warnings.push({
        severity: "warning",
        code: "quality.edge.reason",
        message: `依赖边 ${edge.from} -> ${edge.to} 缺少 reason（§10.1 未解释原因的依赖边）`,
        location: `dependencies[${i}]`,
      });
    }
  }

  // entity used_by references
  for (const [name, entity] of Object.entries(kb.entities)) {
    for (const f of entity.used_by ?? []) {
      if (!featureIds.has(f)) {
        warnings.push({
          severity: "warning",
          code: "ref.entity.used_by",
          message: `实体 ${name} 的 used_by 引用了不存在的功能 ${f}`,
          location: `entities.${name}`,
        });
      }
    }
  }

  // --- §10.1 journeys must have start/end/acceptance -------------------------
  for (const [id, j] of Object.entries(kb.journeys)) {
    if (!j.start) {
      errors.push({ severity: "error", code: "journey.start", message: `业务链路 ${id} 缺少 start`, location: `journeys.${id}` });
    }
    if (!j.end) {
      errors.push({ severity: "error", code: "journey.end", message: `业务链路 ${id} 缺少 end`, location: `journeys.${id}` });
    }
    if (!(j.acceptance ?? []).length) {
      errors.push({ severity: "error", code: "journey.acceptance", message: `业务链路 ${id} 缺少验收条件 acceptance`, location: `journeys.${id}` });
    }
    for (const step of j.steps ?? []) {
      if (!featureIds.has(step)) {
        errors.push({ severity: "error", code: "ref.journey.step", message: `业务链路 ${id} 的步骤 ${step} 不是已登记功能`, location: `journeys.${id}` });
      }
    }
  }

  // --- §10.1 test paths: target_feature + journey must exist -----------------
  for (const [id, tp] of Object.entries(kb.testPaths)) {
    if (!featureIds.has(tp.target_feature)) {
      errors.push({ severity: "error", code: "ref.test.target", message: `测试路径 ${id} 的 target_feature=${tp.target_feature} 不存在`, location: `test_paths.${id}` });
    }
    if (tp.journey && !kb.journeys[tp.journey]) {
      errors.push({ severity: "error", code: "ref.test.journey", message: `测试路径 ${id} 的 journey=${tp.journey} 不存在`, location: `test_paths.${id}` });
    }
    for (const r of tp.regression_scope ?? []) {
      if (!featureIds.has(r)) {
        warnings.push({ severity: "warning", code: "ref.test.regression", message: `测试路径 ${id} 的 regression_scope 引用了不存在的功能 ${r}`, location: `test_paths.${id}` });
      }
    }
    // §10.2: test path must include preconditions and assertions, not just steps.
    if (!(tp.preconditions ?? []).length) {
      warnings.push({ severity: "warning", code: "quality.test.preconditions", message: `测试路径 ${id} 缺少前置条件 preconditions（§10.2 不能只包含按钮动作）`, location: `test_paths.${id}` });
    }
    if (!(tp.assertions ?? []).length) {
      warnings.push({ severity: "warning", code: "quality.test.assertions", message: `测试路径 ${id} 缺少后置验收 assertions（§10.2）`, location: `test_paths.${id}` });
    }
  }

  // --- §10.1 state machines: each state defines allowed + disabled actions ---
  for (const [name, sm] of Object.entries(kb.stateMachines)) {
    for (const [stateName, state] of Object.entries(sm.states)) {
      const hasAllowed = (state.allowed_actions ?? []).length > 0;
      const hasDisabled = (state.disabled_actions ?? []).length > 0;
      if (!hasAllowed && !hasDisabled) {
        errors.push({ severity: "error", code: "state.actions", message: `状态机 ${name} 的状态 ${stateName} 未定义 allowed_actions 或 disabled_actions`, location: `state_machines.${name}.${stateName}` });
      } else if (!hasAllowed || !hasDisabled) {
        warnings.push({ severity: "warning", code: "state.actions.partial", message: `状态机 ${name} 的状态 ${stateName} 只定义了 allowed/disabled 之一（§10.1 建议都定义）`, location: `state_machines.${name}.${stateName}` });
      }
    }
  }

  // --- §10.2 quality: core features ------------------------------------------
  const core = coreFeatureIds(kb);
  const testTargets = new Set(Object.values(kb.testPaths).map((t) => t.target_feature));
  const testCovered = new Set<string>(testTargets);
  for (const tp of Object.values(kb.testPaths)) {
    for (const r of tp.regression_scope ?? []) testCovered.add(r);
  }

  for (const id of core) {
    if (!featureIds.has(id)) continue;
    const f = kb.features[id];
    if (!testTargets.has(id)) {
      warnings.push({ severity: "warning", code: "quality.core.no-test", message: `核心功能 ${id} 没有以它为 target_feature 的测试路径（§10.1）`, location: `features.${id}` });
    }
    const hasDownstream =
      (f.used_by ?? []).length > 0 || kb.dependencies.some((e) => e.from === id);
    if (!hasDownstream) {
      warnings.push({ severity: "warning", code: "quality.core.no-downstream", message: `核心功能 ${id} 没有下游说明（§10.2）`, location: `features.${id}` });
    }
    const hasUpstream =
      (f.depends_on ?? []).length > 0 || kb.dependencies.some((e) => e.to === id);
    if (!hasDownstream && !hasUpstream) {
      warnings.push({ severity: "warning", code: "quality.core.isolated", message: `核心功能 ${id} 是孤立节点（无上游也无下游）`, location: `features.${id}` });
    }
    // §10.2: danger ops must have failure recovery.
    if (DANGER_RE.test(id) || DANGER_RE.test(f.name ?? "")) {
      const hasRecovery = Object.values(kb.journeys).some((j) => j.failure_recovery?.[id]?.length);
      if (!hasRecovery) {
        warnings.push({ severity: "warning", code: "quality.danger.no-recovery", message: `危险操作 ${id}（部署/删除/卸载/权限/凭证类）没有任何 failure_recovery（§10.2）`, location: `features.${id}` });
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
