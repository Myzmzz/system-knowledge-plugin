/**
 * Test fixtures for the CLI command tests.
 *
 * Builds small, self-contained knowledge bases in a temp directory so the tests
 * never depend on examples/ existing. Each helper returns the absolute path to a
 * `knowledge/` directory suitable for passing as `--dir`.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Create a fresh temp directory containing a `knowledge/` subdir. */
function makeKnowledgeDir(files: Record<string, string>): string {
  const base = mkdtempSync(path.join(os.tmpdir(), "knowledge-cli-"));
  const knowledgeDir = path.join(base, "knowledge");
  mkdirSync(knowledgeDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(knowledgeDir, name), content, "utf8");
  }
  return knowledgeDir;
}

/**
 * A valid (clean) knowledge base: two features with a dependency edge, an
 * entity, a journey, and a test path covering the core feature. Designed to
 * pass validation with no errors.
 */
export function cleanKnowledgeBase(): string {
  return makeKnowledgeDir({
    "features.yaml": `features:
  alpha:
    name: Alpha
    maturity: usable
    code_refs:
      - src/Alpha.jsx
    provides:
      - alpha-output
    used_by:
      - beta
    depends_on: []
  beta:
    name: Beta
    maturity: usable
    code_refs:
      - src/Beta.jsx
    depends_on:
      - alpha
    used_by: []
`,
    "dependencies.yaml": `dependencies:
  - from: alpha
    to: beta
    type: data
    reason: beta 消费 alpha 的输出
`,
    "entities.yaml": `entities:
  AlphaRecord:
    description: alpha 产出的记录
    fields:
      id:
        type: string
        required: true
    used_by:
      - alpha
`,
    "states.yaml": `state_machines:
  AlphaState:
    states:
      draft:
        label: 草稿
        allowed_actions:
          - submit
        disabled_actions:
          - delete
`,
    "journeys.yaml": `journeys:
  main-flow:
    name: 主链路
    start: 进入 alpha
    end: 完成 beta
    steps:
      - alpha
      - beta
    acceptance:
      - beta 成功产出
`,
    "test-paths.yaml": `test_paths:
  alpha-path:
    name: Alpha 测试
    target_feature: alpha
    journey: main-flow
    preconditions:
      - 已登录
    steps:
      - 打开 alpha
    assertions:
      - 看到 alpha 输出
    regression_scope:
      - beta
  beta-path:
    name: Beta 测试
    target_feature: beta
    preconditions:
      - alpha 已完成
    steps:
      - 打开 beta
    assertions:
      - beta 完成
`,
  });
}

/**
 * A broken knowledge base: a feature depends on a non-existent feature and a
 * journey references a missing step. Designed to produce validation errors.
 */
export function brokenKnowledgeBase(): string {
  return makeKnowledgeDir({
    "features.yaml": `features:
  alpha:
    name: Alpha
    maturity: usable
    depends_on:
      - does-not-exist
`,
    "journeys.yaml": `journeys:
  broken-flow:
    name: 坏链路
    start: 起点
    end: 终点
    steps:
      - alpha
      - ghost-feature
    acceptance:
      - 完成
`,
  });
}
