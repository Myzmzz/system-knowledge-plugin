/**
 * `knowledge scan-code` — plunginintro.md §7.1.
 *
 *   knowledge scan-code --root .
 *
 * A LIGHTWEIGHT, dependency-free heuristic scan. It walks the repo (skipping
 * node_modules / .git / dist), classifies candidate files by filename pattern
 * (page / route / api / component / state / test), and emits:
 *
 *   reports/scan-result.json   — the raw classification
 *   reports/feature-draft.yaml — a DRAFT features.yaml the user can refine
 *
 * Per §7.1 this output is ONLY a draft and must never be used directly as the
 * final business knowledge graph — the agent / human supplies the semantics.
 *
 * This command intentionally does NOT depend on the knowledge library (it scans
 * source code, not the knowledge base) and uses only node:fs.
 */

import { readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export type CandidateKind =
  | "page"
  | "route"
  | "api"
  | "component"
  | "state"
  | "test"
  | "doc";

export interface Candidate {
  /** Path relative to the scan root, POSIX-style. */
  file: string;
  kind: CandidateKind;
  /** A suggested kebab-case feature id derived from the filename. */
  suggestedFeatureId: string;
}

export interface ScanResult {
  root: string;
  scannedFiles: number;
  candidates: Candidate[];
  /** Counts per kind, for the summary. */
  byKind: Record<CandidateKind, number>;
}

export interface ScanCodeOptions {
  /** Directory to scan (defaults to cwd). */
  root?: string;
  /** Where to write the two report files (defaults to <root>/reports). */
  outDir?: string;
  cwd?: string;
}

export interface ScanCodeResult {
  scan: ScanResult;
  /** Rendered draft features.yaml content. */
  draftYaml: string;
  /** Absolute path of scan-result.json. */
  jsonPath: string;
  /** Absolute path of feature-draft.yaml. */
  yamlPath: string;
  /** Human-readable summary text. */
  text: string;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".drafts",
  "reports",
  ".next",
  ".turbo",
]);

const SCANNABLE_EXT = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".vue",
  ".py",
  ".md",
]);

// Filename-based heuristics (order matters: most specific first).
const TEST_RE = /(\.test\.|\.spec\.|__tests__\/|(^|\/)tests?\/)/i;
const API_RE = /(api|route|controller|endpoint|handler|router)/i;
const PAGE_RE = /(page|view|screen)/i;
const ROUTE_RE = /(routes?|router)/i;
const STATE_RE = /(state|status|reducer|store|machine|context)/i;
const COMPONENT_RE = /(component|widget|^[A-Z][A-Za-z0-9]*\.(jsx|tsx|vue)$)/;

/** Recursively collect scannable files under `dir`, relative to `root`. */
function walk(root: string, dir: string, acc: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir, { encoding: "utf8" });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
      walk(root, full, acc);
    } else if (st.isFile()) {
      if (SCANNABLE_EXT.has(path.extname(entry).toLowerCase())) {
        acc.push(path.relative(root, full).split(path.sep).join("/"));
      }
    }
  }
}

/** kebab-case a filename's base into a candidate feature id. */
function toFeatureId(file: string): string {
  const base = path.basename(file).replace(/\.[^.]+$/, "");
  return (
    base
      // camelCase / PascalCase -> dash
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "unnamed"
  );
}

/** Classify a single relative file path into a candidate kind, or undefined. */
function classify(file: string): CandidateKind | undefined {
  const lower = file.toLowerCase();
  const ext = path.extname(file).toLowerCase();

  if (ext === ".md") return "doc";
  if (TEST_RE.test(file)) return "test";
  if (PAGE_RE.test(lower)) return "page";
  if (ROUTE_RE.test(lower)) return "route";
  if (API_RE.test(lower)) return "api";
  if (STATE_RE.test(lower)) return "state";
  if (COMPONENT_RE.test(path.basename(file))) return "component";
  return undefined;
}

/** Walk + classify. Exported so tests can run the scan without filesystem writes. */
export function scanCode(opts: ScanCodeOptions = {}): ScanResult {
  const cwd = opts.cwd ?? process.cwd();
  const root = path.resolve(cwd, opts.root ?? ".");

  const files: string[] = [];
  walk(root, root, files);

  const byKind: Record<CandidateKind, number> = {
    page: 0,
    route: 0,
    api: 0,
    component: 0,
    state: 0,
    test: 0,
    doc: 0,
  };

  const candidates: Candidate[] = [];
  for (const file of files) {
    const kind = classify(file);
    if (!kind) continue;
    byKind[kind] += 1;
    candidates.push({
      file,
      kind,
      suggestedFeatureId: toFeatureId(file),
    });
  }

  return { root, scannedFiles: files.length, candidates, byKind };
}

/**
 * Render a DRAFT features.yaml from the page/component candidates. Pages and
 * components become draft feature nodes; tests/docs/state are surfaced only as
 * comments so the human knows to wire them up. This is intentionally minimal.
 */
function renderDraftYaml(scan: ScanResult): string {
  const lines: string[] = [];
  lines.push("# ============================================================");
  lines.push("# feature-draft.yaml — 由 `knowledge scan-code` 自动生成的草稿");
  lines.push("# !! 警告：这只是草稿，不能直接作为最终业务图谱使用 (plunginintro.md §7.1)。");
  lines.push("# 请由人工/智能体补充 description、depends_on、used_by、states 等语义信息。");
  lines.push("# ============================================================");
  lines.push("");
  lines.push("features:");

  // Use pages first, then components, as feature seeds. De-dupe by feature id.
  const seeds = scan.candidates.filter(
    (c) => c.kind === "page" || c.kind === "component",
  );

  if (seeds.length === 0) {
    lines.push("  # （扫描未发现页面/组件候选，请手动添加功能节点）");
  }

  const seen = new Set<string>();
  for (const c of seeds) {
    let id = c.suggestedFeatureId;
    if (seen.has(id)) {
      // disambiguate duplicate ids by appending a numeric suffix
      let n = 2;
      while (seen.has(`${id}-${n}`)) n += 1;
      id = `${id}-${n}`;
    }
    seen.add(id);

    lines.push(`  ${id}:`);
    lines.push(`    name: ${id}   # TODO: 替换为业务名称`);
    lines.push(`    maturity: idea   # TODO: idea|prototype|usable|production`);
    lines.push(`    code_refs:`);
    lines.push(`      - ${c.file}`);
    lines.push(`    depends_on: []   # TODO`);
    lines.push(`    provides: []     # TODO`);
    lines.push(`    used_by: []      # TODO`);
    lines.push("");
  }

  // Surface other candidate kinds as comments for follow-up.
  const others = scan.candidates.filter(
    (c) => c.kind !== "page" && c.kind !== "component",
  );
  if (others.length) {
    lines.push("# --- 其它候选（需人工判断是否登记）---------------------------");
    for (const c of others) {
      lines.push(`#   [${c.kind}] ${c.file}`);
    }
  }

  return lines.join("\n") + "\n";
}

/** Core of the scan-code command: scan, then write the two report files. */
export function runScanCode(opts: ScanCodeOptions = {}): ScanCodeResult {
  const cwd = opts.cwd ?? process.cwd();
  const root = path.resolve(cwd, opts.root ?? ".");
  const outDir = opts.outDir
    ? path.resolve(cwd, opts.outDir)
    : path.join(root, "reports");

  const scan = scanCode({ ...opts, root });
  const draftYaml = renderDraftYaml(scan);

  mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "scan-result.json");
  const yamlPath = path.join(outDir, "feature-draft.yaml");
  writeFileSync(jsonPath, JSON.stringify(scan, null, 2) + "\n", "utf8");
  writeFileSync(yamlPath, draftYaml, "utf8");

  const kindSummary = (Object.keys(scan.byKind) as CandidateKind[])
    .map((k) => `${k}=${scan.byKind[k]}`)
    .join(" ");

  const text = [
    `代码扫描（启发式，仅供草稿）：${root}`,
    `扫描文件 ${scan.scannedFiles} 个，候选 ${scan.candidates.length} 个（${kindSummary}）。`,
    "注意：feature-draft.yaml 只是草稿，不能直接作为最终业务图谱 (§7.1)。",
    `输出：${jsonPath}`,
    `输出：${yamlPath}`,
  ].join("\n");

  return { scan, draftYaml, jsonPath, yamlPath, text };
}
