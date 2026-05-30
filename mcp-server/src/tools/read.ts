/**
 * Read-only MCP tools (plunginintro.md §6.3–6.6).
 *
 * Each tool's core is factored into an exported, side-effect-light `run*`
 * function that loads the knowledge base and delegates to the shared algorithm
 * library. The `register*` wrappers attach those cores to an `McpServer`. Tests
 * call the `run*` functions directly against a temp-dir fixture.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { loadKnowledge } from "../knowledge/loader.js";
import { traceDependencies, type Direction } from "../lib/dependency.js";
import { analyzeImpact, type ChangeType } from "../lib/impact.js";
import { generateTestPath, type TestScope } from "../lib/testpath.js";
import { jsonResult, suggestClosestIds, type ToolTextResult } from "./helpers.js";

/* ------------------------------------------------------------------ */
/* feature_get — §6.3                                                  */
/* ------------------------------------------------------------------ */

export interface FeatureGetInput {
  featureId: string;
  detail?: "summary" | "full";
  knowledgeDir?: string;
}

export function runFeatureGet(input: FeatureGetInput): ToolTextResult {
  const { knowledge } = loadKnowledge({ dir: input.knowledgeDir });
  const feature = knowledge.features[input.featureId];

  if (!feature) {
    // §6.3: when missing, suggest the closest ids instead of just failing.
    return jsonResult({
      found: false,
      featureId: input.featureId,
      message: `功能 ${input.featureId} 未在 features.yaml 中登记`,
      suggestions: suggestClosestIds(input.featureId, Object.keys(knowledge.features)),
    });
  }

  const detail = input.detail ?? "summary";
  if (detail === "summary") {
    // Summary view per the §6.3 example output.
    return jsonResult({
      found: true,
      featureId: input.featureId,
      name: feature.name,
      module: feature.module,
      maturity: feature.maturity,
      dependsOn: feature.depends_on ?? [],
      usedBy: feature.used_by ?? [],
      provides: feature.provides ?? [],
    });
  }

  // Full view: the complete feature record plus its id.
  return jsonResult({ found: true, featureId: input.featureId, ...feature });
}

export function registerFeatureGet(server: McpServer): void {
  server.registerTool(
    "feature_get",
    {
      title: "查询功能定义",
      description:
        "查询某个功能节点的定义。detail=summary 返回摘要，detail=full 返回完整字段；找不到时返回相近功能 ID 建议。",
      inputSchema: {
        featureId: z.string().describe("功能 ID（kebab-case）"),
        detail: z.enum(["summary", "full"]).optional().describe("返回摘要还是完整字段"),
        knowledgeDir: z.string().optional().describe("知识库目录（可选）"),
      },
    },
    async (args) => runFeatureGet(args as FeatureGetInput),
  );
}

/* ------------------------------------------------------------------ */
/* feature_list                                                        */
/* ------------------------------------------------------------------ */

export interface FeatureListInput {
  module?: string;
  maturity?: "idea" | "prototype" | "usable" | "production";
  knowledgeDir?: string;
}

export function runFeatureList(input: FeatureListInput): ToolTextResult {
  const { knowledge } = loadKnowledge({ dir: input.knowledgeDir });

  const features = Object.entries(knowledge.features)
    .filter(([, feature]) => {
      if (input.module && feature.module !== input.module) return false;
      if (input.maturity && feature.maturity !== input.maturity) return false;
      return true;
    })
    .map(([featureId, feature]) => ({
      featureId,
      name: feature.name,
      module: feature.module,
      maturity: feature.maturity,
    }));

  return jsonResult({ count: features.length, features });
}

export function registerFeatureList(server: McpServer): void {
  server.registerTool(
    "feature_list",
    {
      title: "列出功能节点",
      description:
        "列出已登记的功能节点，可按 module 和 maturity 过滤。返回 {featureId, name, module, maturity} 列表。",
      inputSchema: {
        module: z.string().optional().describe("按模块过滤"),
        maturity: z
          .enum(["idea", "prototype", "usable", "production"])
          .optional()
          .describe("按成熟度过滤"),
        knowledgeDir: z.string().optional().describe("知识库目录（可选）"),
      },
    },
    async (args) => runFeatureList(args as FeatureListInput),
  );
}

/* ------------------------------------------------------------------ */
/* dependency_trace — §6.4                                             */
/* ------------------------------------------------------------------ */

export interface DependencyTraceInput {
  featureId: string;
  depth?: number;
  direction?: Direction;
  knowledgeDir?: string;
}

export function runDependencyTrace(input: DependencyTraceInput): ToolTextResult {
  const { knowledge } = loadKnowledge({ dir: input.knowledgeDir });
  const result = traceDependencies(knowledge, input.featureId, {
    direction: input.direction ?? "both",
    depth: input.depth ?? 1,
  });
  return jsonResult(result);
}

export function registerDependencyTrace(server: McpServer): void {
  server.registerTool(
    "dependency_trace",
    {
      title: "查询上游和下游依赖",
      description:
        "查询某功能的上游（依赖谁）与下游（被谁依赖）。支持 direction=upstream|downstream|both 与 depth 多级追踪。",
      inputSchema: {
        featureId: z.string().describe("功能 ID（kebab-case）"),
        depth: z.number().int().positive().optional().describe("追踪层数，默认 1"),
        direction: z
          .enum(["upstream", "downstream", "both"])
          .optional()
          .describe("追踪方向，默认 both"),
        knowledgeDir: z.string().optional().describe("知识库目录（可选）"),
      },
    },
    async (args) => runDependencyTrace(args as DependencyTraceInput),
  );
}

/* ------------------------------------------------------------------ */
/* impact_analyze — §6.5                                               */
/* ------------------------------------------------------------------ */

export interface ImpactAnalyzeInput {
  featureId: string;
  changeType?: ChangeType;
  changedFiles?: string[];
  knowledgeDir?: string;
}

export function runImpactAnalyze(input: ImpactAnalyzeInput): ToolTextResult {
  const { knowledge } = loadKnowledge({ dir: input.knowledgeDir });
  const result = analyzeImpact(knowledge, {
    featureId: input.featureId,
    changeType: input.changeType,
    changedFiles: input.changedFiles,
  });
  return jsonResult(result);
}

export function registerImpactAnalyze(server: McpServer): void {
  server.registerTool(
    "impact_analyze",
    {
      title: "分析修改功能的影响面",
      description:
        "分析修改某功能后的影响：直接下游、受影响实体、回归测试路径，以及知识图更新建议（仅建议，不自动修改）。",
      inputSchema: {
        featureId: z.string().describe("功能 ID（kebab-case）"),
        changeType: z
          .enum(["add", "modify", "remove"])
          .optional()
          .describe("变更类型，默认 modify"),
        changedFiles: z.array(z.string()).optional().describe("变更的文件路径列表"),
        knowledgeDir: z.string().optional().describe("知识库目录（可选）"),
      },
    },
    async (args) => runImpactAnalyze(args as ImpactAnalyzeInput),
  );
}

/* ------------------------------------------------------------------ */
/* journey_get                                                         */
/* ------------------------------------------------------------------ */

export interface JourneyGetInput {
  journeyId: string;
  knowledgeDir?: string;
}

export function runJourneyGet(input: JourneyGetInput): ToolTextResult {
  const { knowledge } = loadKnowledge({ dir: input.knowledgeDir });
  const journey = knowledge.journeys[input.journeyId];

  if (!journey) {
    return jsonResult({
      found: false,
      journeyId: input.journeyId,
      message: `业务链路 ${input.journeyId} 未在 journeys.yaml 中登记`,
      suggestions: suggestClosestIds(input.journeyId, Object.keys(knowledge.journeys)),
    });
  }

  return jsonResult({ found: true, journeyId: input.journeyId, ...journey });
}

export function registerJourneyGet(server: McpServer): void {
  server.registerTool(
    "journey_get",
    {
      title: "查询业务链路",
      description: "查询某条业务链路（journey）的定义；找不到时返回相近链路 ID 建议。",
      inputSchema: {
        journeyId: z.string().describe("业务链路 ID（kebab-case）"),
        knowledgeDir: z.string().optional().describe("知识库目录（可选）"),
      },
    },
    async (args) => runJourneyGet(args as JourneyGetInput),
  );
}

/* ------------------------------------------------------------------ */
/* test_path_generate — §6.6                                           */
/* ------------------------------------------------------------------ */

export interface TestPathGenerateInput {
  featureId: string;
  scope?: TestScope;
  knowledgeDir?: string;
}

export function runTestPathGenerate(input: TestPathGenerateInput): ToolTextResult {
  const { knowledge } = loadKnowledge({ dir: input.knowledgeDir });
  // The lib clearly marks source: "registered" | "derived".
  const result = generateTestPath(knowledge, {
    featureId: input.featureId,
    scope: input.scope,
  });
  return jsonResult(result);
}

export function registerTestPathGenerate(server: McpServer): void {
  server.registerTool(
    "test_path_generate",
    {
      title: "生成测试路径",
      description:
        "根据目标功能生成测试路径。优先返回 test-paths.yaml 中已登记路径（source=registered），否则基于业务链路与依赖图推导（source=derived）。",
      inputSchema: {
        featureId: z.string().describe("功能 ID（kebab-case）"),
        scope: z
          .enum(["e2e", "unit", "integration"])
          .optional()
          .describe("测试范围"),
        knowledgeDir: z.string().optional().describe("知识库目录（可选）"),
      },
    },
    async (args) => runTestPathGenerate(args as TestPathGenerateInput),
  );
}

/** Register all read tools on the server. */
export function registerReadTools(server: McpServer): void {
  registerFeatureGet(server);
  registerFeatureList(server);
  registerDependencyTrace(server);
  registerImpactAnalyze(server);
  registerJourneyGet(server);
  registerTestPathGenerate(server);
}
