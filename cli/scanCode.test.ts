import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { scanCode, runScanCode } from "./commands/scanCode.js";

/** Build a tiny source tree to scan. */
function makeSourceTree(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "scan-code-"));
  mkdirSync(path.join(root, "src", "pages"), { recursive: true });
  mkdirSync(path.join(root, "src", "api"), { recursive: true });
  mkdirSync(path.join(root, "node_modules", "junk"), { recursive: true });
  writeFileSync(path.join(root, "src", "pages", "DashboardPage.jsx"), "export const x = 1;");
  writeFileSync(path.join(root, "src", "api", "deployRoute.ts"), "export const r = 1;");
  writeFileSync(path.join(root, "src", "Dashboard.test.tsx"), "test('x', () => {});");
  writeFileSync(path.join(root, "node_modules", "junk", "index.js"), "module.exports = {};");
  return root;
}

describe("knowledge scan-code", () => {
  it("classifies candidates and skips node_modules", () => {
    const root = makeSourceTree();
    const scan = scanCode({ root });
    const files = scan.candidates.map((c) => c.file);
    // node_modules must be skipped.
    expect(files.every((f) => !f.includes("node_modules"))).toBe(true);
    // page + test should be detected.
    expect(scan.byKind.page).toBeGreaterThanOrEqual(1);
    expect(scan.byKind.test).toBeGreaterThanOrEqual(1);
    expect(scan.byKind.route + scan.byKind.api).toBeGreaterThanOrEqual(1);
  });

  it("writes scan-result.json and feature-draft.yaml marked as a draft", () => {
    const root = makeSourceTree();
    const result = runScanCode({ root });
    expect(existsSync(result.jsonPath)).toBe(true);
    expect(existsSync(result.yamlPath)).toBe(true);
    const yaml = readFileSync(result.yamlPath, "utf8");
    expect(yaml).toContain("草稿");
    expect(yaml).toContain("features:");
    expect(result.text).toContain("草稿");
  });
});
