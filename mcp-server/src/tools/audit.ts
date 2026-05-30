/**
 * Audit MCP tools (plunginintro.md §6.1).
 *
 *   - knowledge_validate: load + cross-reference validate the whole knowledge
 *     base, folding loader (schema/parse) issues in as errors.
 *   - change_audit: map changed files to features and emit advisory suggestions
 *     about what the knowledge graph may need to stay in sync (never mutates).
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { loadKnowledge } from "../knowledge/loader.js";
import { validateKnowledge } from "../knowledge/validate.js";
import { auditChanges } from "../lib/audit.js";
import { jsonResult, type ToolTextResult } from "./helpers.js";

/* ------------------------------------------------------------------ */
/* knowledge_validate                                                  */
/* ------------------------------------------------------------------ */

export interface KnowledgeValidateInput {
  knowledgeDir?: string;
}

export function runKnowledgeValidate(input: KnowledgeValidateInput): ToolTextResult {
  const { knowledge, issues } = loadKnowledge({ dir: input.knowledgeDir });
  const report = validateKnowledge(knowledge, issues);

  return jsonResult({
    ok: report.ok,
    errors: report.errors,
    warnings: report.warnings,
    counts: {
      errors: report.errors.length,
      warnings: report.warnings.length,
      features: Object.keys(knowledge.features).length,
      dependencies: knowledge.dependencies.length,
      entities: Object.keys(knowledge.entities).length,
      stateMachines: Object.keys(knowledge.stateMachines).length,
      journeys: Object.keys(knowledge.journeys).length,
      testPaths: Object.keys(knowledge.testPaths).length,
    },
  });
}

export function registerKnowledgeValidate(server: McpServer): void {
  server.registerTool(
    "knowledge_validate",
    {
      title: "校验知识库",
      description:
        "加载并校验整个知识库（引用完整性 + 质量规则），返回 {ok, errors, warnings, counts}。schema/解析错误也会作为 error 汇总。",
      inputSchema: {
        knowledgeDir: z.string().optional().describe("知识库目录（可选）"),
      },
    },
    async (args) => runKnowledgeValidate(args as KnowledgeValidateInput),
  );
}

/* ------------------------------------------------------------------ */
/* change_audit                                                        */
/* ------------------------------------------------------------------ */

export interface ChangeAuditInput {
  changedFiles: string[];
  knowledgeDir?: string;
}

export function runChangeAudit(input: ChangeAuditInput): ToolTextResult {
  const { knowledge } = loadKnowledge({ dir: input.knowledgeDir });
  const result = auditChanges(knowledge, input.changedFiles);
  return jsonResult(result);
}

export function registerChangeAudit(server: McpServer): void {
  server.registerTool(
    "change_audit",
    {
      title: "根据代码变更提示知识图更新",
      description:
        "根据变更文件列表，映射到功能并输出知识图更新与回归测试建议（仅建议，不修改知识库）。",
      inputSchema: {
        changedFiles: z.array(z.string()).describe("变更的文件路径列表"),
        knowledgeDir: z.string().optional().describe("知识库目录（可选）"),
      },
    },
    async (args) => runChangeAudit(args as ChangeAuditInput),
  );
}

/** Register all audit tools on the server. */
export function registerAuditTools(server: McpServer): void {
  registerKnowledgeValidate(server);
  registerChangeAudit(server);
}
