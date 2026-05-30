import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";

import { runAuditDiff } from "./commands/auditDiff.js";
import { cleanKnowledgeBase } from "./testutil.js";

describe("knowledge audit-diff", () => {
  it("audits a manual changed-files list (matched feature)", () => {
    const dir = cleanKnowledgeBase();
    const result = runAuditDiff({ dir, changedFiles: ["src/Alpha.jsx"] });
    expect(result.source).toBe("manual");
    expect(result.result.matchedFeatures).toContain("alpha");
    // matching a feature should produce a feature-touched suggestion.
    expect(
      result.result.suggestions.some((s) => s.kind === "feature-touched"),
    ).toBe(true);
    expect(result.path).toBeDefined();
    expect(existsSync(result.path!)).toBe(true);
  });

  it("classifies an unregistered page file", () => {
    const dir = cleanKnowledgeBase();
    const result = runAuditDiff({
      dir,
      changedFiles: ["src/NewThingPage.jsx"],
    });
    expect(
      result.result.suggestions.some((s) => s.kind === "new-page"),
    ).toBe(true);
  });

  it("falls back gracefully outside a git repo with no manual files", () => {
    // The temp knowledge dir is not inside a git repo.
    const dir = cleanKnowledgeBase();
    const result = runAuditDiff({ dir, cwd: dir });
    // Either it detected no repo (source none) or, if cwd happens to be inside
    // one, it still produced a valid result without throwing.
    expect(["none", "git"]).toContain(result.source);
    if (result.source === "none") {
      expect(result.isGitRepo).toBe(false);
      expect(result.text).toContain("不是 git 仓库");
    }
  });
});
