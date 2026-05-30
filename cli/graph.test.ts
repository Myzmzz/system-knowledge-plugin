import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

import { buildGraphSource, runGraph } from "./commands/graph.js";
import { cleanKnowledgeBase } from "./testutil.js";

describe("knowledge graph", () => {
  it("produces a dependency diagram containing 'graph LR'", () => {
    const dir = cleanKnowledgeBase();
    const { source } = buildGraphSource({ type: "dependency", dir });
    expect(source).toContain("graph LR");
    // alpha -> beta edge should appear (node ids are prefixed with n_).
    expect(source).toContain("n_alpha");
    expect(source).toContain("n_beta");
  });

  it("writes a Markdown report with a fenced mermaid block", () => {
    const dir = cleanKnowledgeBase();
    const result = runGraph({ type: "dependency", dir, format: "md" });
    expect(existsSync(result.path)).toBe(true);
    expect(result.path.endsWith("dependency-graph.md")).toBe(true);
    const content = readFileSync(result.path, "utf8");
    expect(content).toContain("```mermaid");
    expect(content).toContain("graph LR");
  });

  it("writes HTML when --format html", () => {
    const dir = cleanKnowledgeBase();
    const result = runGraph({ type: "dependency", dir, format: "html" });
    expect(result.path.endsWith("dependency-graph.html")).toBe(true);
    const content = readFileSync(result.path, "utf8");
    expect(content).toContain("<!DOCTYPE html>");
    expect(content).toContain("class=\"mermaid\"");
  });

  it("requires --entity for state-machine", () => {
    const dir = cleanKnowledgeBase();
    expect(() => buildGraphSource({ type: "state-machine", dir })).toThrow(
      /entity/,
    );
  });
});
