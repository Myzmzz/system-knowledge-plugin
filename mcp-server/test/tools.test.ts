/**
 * Unit tests for the MCP tool layer.
 *
 * These exercise the testable `run*` cores directly against a temp-dir
 * knowledge fixture built in-memory — no MCP transport, no dependency on
 * `examples/` or the repo's own `knowledge/`. Each `run*` returns a single
 * JSON text content block; `parse()` unwraps it.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify as stringifyYaml, parse as parseYaml } from "yaml";

import {
  runFeatureGet,
  runFeatureList,
  runDependencyTrace,
  runImpactAnalyze,
  runJourneyGet,
  runTestPathGenerate,
} from "../src/tools/read.js";
import {
  runFeatureUpsert,
  runDependencyUpsert,
  runJourneyUpsert,
  runTestPathUpsert,
} from "../src/tools/write.js";
import { runKnowledgeValidate, runChangeAudit } from "../src/tools/audit.js";
import type { ToolTextResult } from "../src/tools/helpers.js";

/** Unwrap the single JSON text block a tool returns. */
function parse(result: ToolTextResult): any {
  expect(result.content).toHaveLength(1);
  expect(result.content[0].type).toBe("text");
  return JSON.parse(result.content[0].text);
}

let knowledgeDir: string;

/** Build a small but valid knowledge base on disk. */
function writeFixture(dir: string): void {
  mkdirSync(dir, { recursive: true });

  const features = {
    features: {
      "deploy-assets": {
        name: "部署资产",
        module: "部署流程",
        maturity: "production",
        code_refs: ["src/assets/parse.ts"],
        provides: ["service-modules"],
        used_by: ["deploy-config"],
      },
      "deploy-config": {
        name: "部署配置",
        module: "部署流程",
        maturity: "production",
        code_refs: ["src/config/Page1Deploy.jsx"],
        depends_on: ["deploy-assets"],
        provides: ["helm-values"],
        used_by: ["execution-verify"],
      },
      "execution-verify": {
        name: "执行校验",
        module: "部署流程",
        maturity: "usable",
        depends_on: ["deploy-config"],
      },
    },
  };

  const dependencies = {
    dependencies: [
      {
        from: "deploy-assets",
        to: "deploy-config",
        type: "data",
        reason: "服务模块和 values 来源于资产解析结果",
      },
      {
        from: "deploy-config",
        to: "execution-verify",
        type: "gate",
        reason: "预检依赖部署参数和 values",
      },
    ],
  };

  const entities = {
    entities: {
      DeployTask: {
        description: "部署任务",
        fields: { id: { type: "string", required: true } },
        used_by: ["deploy-config", "execution-verify"],
      },
    },
  };

  const journeys = {
    journeys: {
      "deploy-e2e": {
        name: "部署端到端链路",
        start: "deploy-assets",
        end: "execution-verify",
        steps: ["deploy-assets", "deploy-config", "execution-verify"],
        acceptance: ["Helm Release 为 deployed"],
      },
    },
  };

  const testPaths = {
    test_paths: {
      "deploy-e2e-test": {
        name: "部署 E2E 测试",
        target_feature: "execution-verify",
        journey: "deploy-e2e",
        preconditions: ["集群已接入"],
        steps: ["点击部署", "查看日志"],
        assertions: ["Deployment Ready"],
        regression_scope: ["deploy-config"],
      },
    },
  };

  writeFileSync(path.join(dir, "features.yaml"), stringifyYaml(features), "utf8");
  writeFileSync(path.join(dir, "dependencies.yaml"), stringifyYaml(dependencies), "utf8");
  writeFileSync(path.join(dir, "entities.yaml"), stringifyYaml(entities), "utf8");
  writeFileSync(path.join(dir, "journeys.yaml"), stringifyYaml(journeys), "utf8");
  writeFileSync(path.join(dir, "test-paths.yaml"), stringifyYaml(testPaths), "utf8");
}

beforeAll(() => {
  const base = mkdtempSync(path.join(tmpdir(), "skp-"));
  knowledgeDir = path.join(base, "knowledge");
  writeFixture(knowledgeDir);
});

afterAll(() => {
  // Clean up the temp tree (its parent dir).
  if (knowledgeDir) rmSync(path.dirname(knowledgeDir), { recursive: true, force: true });
});

describe("feature_get", () => {
  it("returns a summary view for an existing feature", () => {
    const out = parse(runFeatureGet({ featureId: "deploy-config", knowledgeDir }));
    expect(out.found).toBe(true);
    expect(out.name).toBe("部署配置");
    expect(out.dependsOn).toEqual(["deploy-assets"]);
    expect(out.usedBy).toEqual(["execution-verify"]);
    expect(out.provides).toEqual(["helm-values"]);
    // Summary must NOT include raw fields like code_refs.
    expect(out.code_refs).toBeUndefined();
  });

  it("returns full fields when detail=full", () => {
    const out = parse(runFeatureGet({ featureId: "deploy-config", detail: "full", knowledgeDir }));
    expect(out.found).toBe(true);
    expect(out.code_refs).toEqual(["src/config/Page1Deploy.jsx"]);
    expect(out.depends_on).toEqual(["deploy-assets"]);
  });

  it("suggests closest ids when the feature is missing", () => {
    const out = parse(runFeatureGet({ featureId: "deploy-confg", knowledgeDir }));
    expect(out.found).toBe(false);
    expect(out.suggestions).toContain("deploy-config");
  });
});

describe("feature_list", () => {
  it("lists all features with no filter", () => {
    const out = parse(runFeatureList({ knowledgeDir }));
    expect(out.count).toBe(3);
    const ids = out.features.map((f: any) => f.featureId).sort();
    expect(ids).toEqual(["deploy-assets", "deploy-config", "execution-verify"]);
  });

  it("filters by maturity", () => {
    const out = parse(runFeatureList({ maturity: "usable", knowledgeDir }));
    expect(out.count).toBe(1);
    expect(out.features[0].featureId).toBe("execution-verify");
  });

  it("filters by module", () => {
    const out = parse(runFeatureList({ module: "部署流程", knowledgeDir }));
    expect(out.count).toBe(3);
  });
});

describe("dependency_trace", () => {
  it("traces both directions at depth 1", () => {
    const out = parse(runDependencyTrace({ featureId: "deploy-config", knowledgeDir }));
    expect(out.featureId).toBe("deploy-config");
    expect(out.upstream.map((n: any) => n.featureId)).toEqual(["deploy-assets"]);
    expect(out.downstream.map((n: any) => n.featureId)).toEqual(["execution-verify"]);
    // Edge reason is carried through from dependencies.yaml.
    expect(out.upstream[0].reason).toContain("资产解析");
  });

  it("traces multi-level upstream at depth 2", () => {
    const out = parse(
      runDependencyTrace({ featureId: "execution-verify", direction: "upstream", depth: 2, knowledgeDir }),
    );
    const ids = out.upstream.map((n: any) => n.featureId);
    expect(ids).toContain("deploy-config");
    expect(ids).toContain("deploy-assets");
    expect(out.downstream).toEqual([]);
  });
});

describe("impact_analyze", () => {
  it("computes downstream impact, entities, and regression tests", () => {
    const out = parse(runImpactAnalyze({ featureId: "deploy-config", knowledgeDir }));
    expect(out.featureId).toBe("deploy-config");
    expect(out.changeType).toBe("modify");
    expect(out.directImpact).toContain("execution-verify");
    expect(out.affectedEntities).toContain("DeployTask");
    expect(out.regressionTests).toContain("deploy-e2e-test");
    expect(out.knowledgeUpdateSuggestions.length).toBeGreaterThan(0);
  });

  it("maps changed files to features", () => {
    const out = parse(
      runImpactAnalyze({
        featureId: "deploy-config",
        changeType: "modify",
        changedFiles: ["src/config/Page1Deploy.jsx"],
        knowledgeDir,
      }),
    );
    expect(out.changedFeatures).toContain("deploy-config");
  });
});

describe("journey_get", () => {
  it("returns an existing journey", () => {
    const out = parse(runJourneyGet({ journeyId: "deploy-e2e", knowledgeDir }));
    expect(out.found).toBe(true);
    expect(out.name).toBe("部署端到端链路");
    expect(out.steps).toEqual(["deploy-assets", "deploy-config", "execution-verify"]);
  });

  it("suggests closest ids when missing", () => {
    const out = parse(runJourneyGet({ journeyId: "deploy-e2", knowledgeDir }));
    expect(out.found).toBe(false);
    expect(out.suggestions).toContain("deploy-e2e");
  });
});

describe("test_path_generate", () => {
  it("returns a registered path verbatim", () => {
    const out = parse(runTestPathGenerate({ featureId: "execution-verify", knowledgeDir }));
    expect(out.source).toBe("registered");
    expect(out.testPath).toBe("deploy-e2e-test");
    expect(out.assertions).toEqual(["Deployment Ready"]);
  });

  it("derives a path for a feature with no registered test path", () => {
    const out = parse(runTestPathGenerate({ featureId: "deploy-config", knowledgeDir }));
    expect(out.source).toBe("derived");
    expect(out.journey).toBe("deploy-e2e");
    expect(out.note).toBeTruthy();
  });
});

describe("knowledge_validate", () => {
  it("reports ok and counts for a valid base", () => {
    const out = parse(runKnowledgeValidate({ knowledgeDir }));
    expect(out.ok).toBe(true);
    expect(out.errors).toEqual([]);
    expect(out.counts.features).toBe(3);
    expect(out.counts.dependencies).toBe(2);
    expect(out.counts.journeys).toBe(1);
    expect(out.counts.testPaths).toBe(1);
  });

  it("flags a broken reference as an error", () => {
    // Build a separate broken fixture in its own temp dir.
    const brokenBase = mkdtempSync(path.join(tmpdir(), "skp-broken-"));
    const brokenDir = path.join(brokenBase, "knowledge");
    mkdirSync(brokenDir, { recursive: true });
    writeFileSync(
      path.join(brokenDir, "features.yaml"),
      stringifyYaml({ features: { a: { name: "A", depends_on: ["does-not-exist"] } } }),
      "utf8",
    );
    try {
      const out = parse(runKnowledgeValidate({ knowledgeDir: brokenDir }));
      expect(out.ok).toBe(false);
      expect(out.errors.some((e: any) => e.code === "ref.depends_on")).toBe(true);
    } finally {
      rmSync(brokenBase, { recursive: true, force: true });
    }
  });
});

describe("change_audit", () => {
  it("matches changed files to features and emits suggestions", () => {
    const out = parse(
      runChangeAudit({ changedFiles: ["src/config/Page1Deploy.jsx"], knowledgeDir }),
    );
    expect(out.matchedFeatures).toContain("deploy-config");
    expect(out.suggestions.length).toBeGreaterThan(0);
  });
});

describe("upsert tools (draft vs confirm)", () => {
  it("writes a feature to .drafts by default and to canonical on confirm", () => {
    // Use a fresh empty knowledge dir so we don't mutate the shared fixture.
    const base = mkdtempSync(path.join(tmpdir(), "skp-upsert-"));
    const dir = path.join(base, "knowledge");
    mkdirSync(dir, { recursive: true });
    try {
      // Draft write (default): lands under .drafts/, NOT in the canonical file.
      const draft = parse(
        runFeatureUpsert({
          featureId: "new-feature",
          feature: { name: "新功能", maturity: "prototype" },
          knowledgeDir: dir,
        }),
      );
      expect(draft.draft).toBe(true);
      expect(draft.committed).toBe(false);
      expect(draft.path).toContain(`${path.sep}.drafts${path.sep}`);
      expect(existsSync(path.join(dir, ".drafts", "features.yaml"))).toBe(true);
      expect(existsSync(path.join(dir, "features.yaml"))).toBe(false);

      // Confirm write: lands in the canonical features.yaml.
      const committed = parse(
        runFeatureUpsert({
          featureId: "new-feature",
          feature: { name: "新功能", maturity: "prototype" },
          confirm: true,
          knowledgeDir: dir,
        }),
      );
      expect(committed.draft).toBe(false);
      expect(committed.committed).toBe(true);
      expect(committed.path).not.toContain(".drafts");
      expect(existsSync(path.join(dir, "features.yaml"))).toBe(true);

      // The committed feature is loadable via feature_get.
      const got = parse(runFeatureGet({ featureId: "new-feature", knowledgeDir: dir }));
      expect(got.found).toBe(true);
      expect(got.name).toBe("新功能");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("dependency_upsert appends then replaces by from+to+type", () => {
    const base = mkdtempSync(path.join(tmpdir(), "skp-dep-"));
    const dir = path.join(base, "knowledge");
    mkdirSync(dir, { recursive: true });
    try {
      // First upsert (append) committed to canonical.
      runDependencyUpsert({ from: "a", to: "b", type: "data", reason: "v1", confirm: true, knowledgeDir: dir });
      // Second upsert, same key, should replace in place (reason updated), still 1 edge.
      runDependencyUpsert({ from: "a", to: "b", type: "data", reason: "v2", confirm: true, knowledgeDir: dir });
      // A different type appends a new edge.
      runDependencyUpsert({ from: "a", to: "b", type: "gate", reason: "gate edge", confirm: true, knowledgeDir: dir });

      // Read the canonical file back and assert the merge semantics.
      const yamlText = readFileSync(path.join(dir, "dependencies.yaml"), "utf8");
      const parsed = parseYaml(yamlText);
      expect(parsed.dependencies).toHaveLength(2);
      const dataEdge = parsed.dependencies.find((e: any) => e.type === "data");
      expect(dataEdge.reason).toBe("v2");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("journey_upsert and test_path_upsert write drafts", () => {
    const base = mkdtempSync(path.join(tmpdir(), "skp-jt-"));
    const dir = path.join(base, "knowledge");
    mkdirSync(dir, { recursive: true });
    try {
      const j = parse(
        runJourneyUpsert({
          journeyId: "j1",
          journey: { name: "链路1", start: "a", end: "b", steps: ["a"], acceptance: ["ok"] },
          knowledgeDir: dir,
        }),
      );
      expect(j.draft).toBe(true);
      expect(existsSync(path.join(dir, ".drafts", "journeys.yaml"))).toBe(true);

      const t = parse(
        runTestPathUpsert({
          testPathId: "t1",
          testPath: { name: "测试1", target_feature: "a" },
          knowledgeDir: dir,
        }),
      );
      expect(t.draft).toBe(true);
      expect(existsSync(path.join(dir, ".drafts", "test-paths.yaml"))).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
