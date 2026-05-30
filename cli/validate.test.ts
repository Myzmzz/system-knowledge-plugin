import { describe, it, expect } from "vitest";

import { runValidate } from "./commands/validate.js";
import { cleanKnowledgeBase, brokenKnowledgeBase } from "./testutil.js";

describe("knowledge validate", () => {
  it("returns ok on a clean knowledge base", () => {
    const dir = cleanKnowledgeBase();
    const result = runValidate({ dir });
    expect(result.ok).toBe(true);
    expect(result.report.errors).toHaveLength(0);
    expect(result.text).toContain("校验通过");
  });

  it("reports errors on a broken-reference knowledge base", () => {
    const dir = brokenKnowledgeBase();
    const result = runValidate({ dir });
    expect(result.ok).toBe(false);
    expect(result.report.errors.length).toBeGreaterThan(0);
    // The bad depends_on and the missing journey step should both be caught.
    const codes = result.report.errors.map((e) => e.code);
    expect(codes).toContain("ref.depends_on");
    expect(codes).toContain("ref.journey.step");
  });
});
