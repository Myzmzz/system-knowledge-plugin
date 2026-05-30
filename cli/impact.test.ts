import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";

import { loadKnowledge } from "../mcp-server/src/knowledge/loader.js";
import { computeImpact, runImpact } from "./commands/impact.js";
import { cleanKnowledgeBase } from "./testutil.js";

describe("knowledge impact", () => {
  it("computes the expected directImpact for a feature", () => {
    const dir = cleanKnowledgeBase();
    const { knowledge } = loadKnowledge({ dir });
    const { results } = computeImpact(knowledge, { feature: "alpha" });
    expect(results).toHaveLength(1);
    // alpha -> beta, so beta is the direct downstream impact.
    expect(results[0].featureId).toBe("alpha");
    expect(results[0].directImpact).toContain("beta");
    // alpha's test path + beta regression coverage should surface.
    expect(results[0].regressionTests).toContain("alpha-path");
  });

  it("maps changed files to features when no --feature is given", () => {
    const dir = cleanKnowledgeBase();
    const { knowledge } = loadKnowledge({ dir });
    const { results } = computeImpact(knowledge, {
      changedFiles: ["src/Alpha.jsx"],
    });
    expect(results.map((r) => r.featureId)).toContain("alpha");
  });

  it("writes an impact-report.md", () => {
    const dir = cleanKnowledgeBase();
    const result = runImpact({ dir, feature: "alpha" });
    expect(existsSync(result.path)).toBe(true);
    expect(result.path.endsWith("impact-report.md")).toBe(true);
    expect(result.markdown).toContain("影响面分析");
  });

  it("throws when neither feature nor changed files are provided", () => {
    const dir = cleanKnowledgeBase();
    const { knowledge } = loadKnowledge({ dir });
    expect(() => computeImpact(knowledge, {})).toThrow();
  });
});
