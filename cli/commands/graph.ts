/**
 * `knowledge graph` — plunginintro.md §7.3.
 *
 *   knowledge graph --type dependency
 *   knowledge graph --type state-machine --entity DeployTask
 *   knowledge graph --type journey --name full-deploy
 *
 * Wraps the Mermaid library. Writes a Markdown report (default) with the diagram
 * in a ```mermaid fenced block, or a standalone HTML page (`--format html`).
 *
 * Default outputs (per the doc):
 *   reports/dependency-graph.md
 *   reports/state-machine-<entity>.md
 *   reports/journey-<name>.md
 *
 * Pure wrapper: diagram text comes entirely from the mermaid lib.
 */

import { loadKnowledge } from "../../mcp-server/src/knowledge/loader.js";
import {
  dependencyMermaid,
  stateMachineMermaid,
  journeyMermaid,
  mermaidHtml,
} from "../../mcp-server/src/lib/mermaid.js";
import {
  resolveReportsDir,
  writeReport,
  mermaidMarkdown,
} from "../lib/report.js";

export type GraphType = "dependency" | "state-machine" | "journey";
export type GraphFormat = "md" | "html";

export interface GraphOptions {
  type: GraphType;
  /** Entity name, required for `state-machine`. */
  entity?: string;
  /** Journey id, required for `journey`. */
  name?: string;
  format?: GraphFormat;
  /** Explicit output file path; otherwise a default name in the reports dir. */
  out?: string;
  dir?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface GraphResult {
  /** Diagram type that was produced. */
  type: GraphType;
  /** Raw Mermaid source. */
  source: string;
  /** Title used in the report. */
  title: string;
  /** Absolute path the report was written to. */
  path: string;
  format: GraphFormat;
  /** Human-readable summary text. */
  text: string;
}

/**
 * Build the Mermaid source for the requested diagram. Exported so tests can
 * assert on the diagram text (e.g. that dependency graphs contain "graph LR")
 * without touching the filesystem.
 */
export function buildGraphSource(opts: GraphOptions): {
  source: string;
  title: string;
  defaultFileName: string;
} {
  const { knowledge } = loadKnowledge(opts);

  switch (opts.type) {
    case "dependency":
      return {
        source: dependencyMermaid(knowledge),
        title: "依赖关系图 (dependency graph)",
        defaultFileName: "dependency-graph.md",
      };
    case "state-machine": {
      if (!opts.entity) {
        throw new Error("graph --type state-machine 需要 --entity <名称>");
      }
      return {
        source: stateMachineMermaid(knowledge, opts.entity),
        title: `状态机 (state machine): ${opts.entity}`,
        defaultFileName: `state-machine-${opts.entity}.md`,
      };
    }
    case "journey": {
      if (!opts.name) {
        throw new Error("graph --type journey 需要 --name <业务链路 id>");
      }
      return {
        source: journeyMermaid(knowledge, opts.name),
        title: `业务链路 (journey): ${opts.name}`,
        defaultFileName: `journey-${opts.name}.md`,
      };
    }
    default: {
      const exhaustive: never = opts.type;
      throw new Error(`未知的图类型: ${String(exhaustive)}`);
    }
  }
}

/**
 * Core of the graph command: build the diagram and write the report file.
 */
export function runGraph(opts: GraphOptions): GraphResult {
  const format: GraphFormat = opts.format ?? "md";
  const { source, title, defaultFileName } = buildGraphSource(opts);

  // For HTML output, swap the default extension to .html.
  const fileName =
    format === "html"
      ? defaultFileName.replace(/\.md$/, ".html")
      : defaultFileName;

  const content =
    format === "html"
      ? mermaidHtml(title, source)
      : mermaidMarkdown(title, source);

  const reportsDir = resolveReportsDir(opts);
  const path = writeReport({
    content,
    outFile: opts.out,
    reportsDir,
    defaultFileName: fileName,
    cwd: opts.cwd,
  });

  const text = `已生成 ${title}\n格式: ${format}\n输出: ${path}`;

  return { type: opts.type, source, title, path, format, text };
}
