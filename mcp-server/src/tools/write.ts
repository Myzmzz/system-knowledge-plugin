/**
 * Write MCP tools (plunginintro.md §11.2 — 可维护知识图).
 *
 * Safety model (delegated to the writer): every upsert writes to a DRAFT under
 * `<knowledgeDir>/.drafts/` by default; passing `confirm: true` commits to the
 * canonical file. Each tool reads the raw section, merges in the new record,
 * then hands the whole section to `writeSection`, which validates against the
 * file's zod schema before persisting.
 *
 * Section shapes:
 *   - features / journeys / test_paths: maps keyed by id (upsert = set key).
 *   - dependencies: a LIST of edges (upsert = match by from+to+type, replace or append).
 *
 * Each `run*` returns `{ path, committed, draft }` (draft === !committed).
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { resolveKnowledgePaths } from "../knowledge/paths.js";
import { readRawSection, writeSection } from "../knowledge/writer.js";
import type { DependencyType } from "../knowledge/schema.js";
import { jsonResult, type ToolTextResult } from "./helpers.js";

export interface UpsertResult {
  path: string;
  committed: boolean;
  draft: boolean;
}

function toUpsertResult(write: { path: string; committed: boolean }): ToolTextResult {
  const payload: UpsertResult = {
    path: write.path,
    committed: write.committed,
    draft: !write.committed,
  };
  return jsonResult(payload);
}

/* ------------------------------------------------------------------ */
/* feature_upsert                                                      */
/* ------------------------------------------------------------------ */

export interface FeatureUpsertInput {
  featureId: string;
  feature: Record<string, unknown>;
  confirm?: boolean;
  knowledgeDir?: string;
}

export function runFeatureUpsert(input: FeatureUpsertInput): ToolTextResult {
  const paths = resolveKnowledgePaths({ dir: input.knowledgeDir });
  const raw = readRawSection(paths, "features");
  const features = (raw.features as Record<string, unknown>) ?? {};
  features[input.featureId] = input.feature;

  const write = writeSection(paths, "features", { features }, { confirm: input.confirm });
  return toUpsertResult(write);
}

export function registerFeatureUpsert(server: McpServer): void {
  server.registerTool(
    "feature_upsert",
    {
      title: "新增或更新功能",
      description:
        "新增或更新一个功能节点。默认写入 .drafts 草稿；confirm=true 才写入正式 features.yaml。",
      inputSchema: {
        featureId: z.string().describe("功能 ID（kebab-case）"),
        feature: z.record(z.string(), z.unknown()).describe("功能定义对象"),
        confirm: z.boolean().optional().describe("true=写入正式文件，默认写草稿"),
        knowledgeDir: z.string().optional().describe("知识库目录（可选）"),
      },
    },
    async (args) => runFeatureUpsert(args as FeatureUpsertInput),
  );
}

/* ------------------------------------------------------------------ */
/* dependency_upsert (LIST: match by from+to+type)                     */
/* ------------------------------------------------------------------ */

export interface DependencyUpsertInput {
  from: string;
  to: string;
  type: DependencyType;
  reason?: string;
  confirm?: boolean;
  knowledgeDir?: string;
}

export function runDependencyUpsert(input: DependencyUpsertInput): ToolTextResult {
  const paths = resolveKnowledgePaths({ dir: input.knowledgeDir });
  const raw = readRawSection(paths, "dependencies");
  const dependencies = Array.isArray(raw.dependencies)
    ? (raw.dependencies as Array<Record<string, unknown>>)
    : [];

  const edge: Record<string, unknown> = {
    from: input.from,
    to: input.to,
    type: input.type,
  };
  if (input.reason !== undefined) edge.reason = input.reason;

  // Match an existing edge by (from, to, type); replace in place, else append.
  const existingIndex = dependencies.findIndex(
    (candidate) =>
      candidate.from === input.from &&
      candidate.to === input.to &&
      candidate.type === input.type,
  );
  if (existingIndex >= 0) {
    dependencies[existingIndex] = edge;
  } else {
    dependencies.push(edge);
  }

  const write = writeSection(paths, "dependencies", { dependencies }, { confirm: input.confirm });
  return toUpsertResult(write);
}

export function registerDependencyUpsert(server: McpServer): void {
  server.registerTool(
    "dependency_upsert",
    {
      title: "新增或更新依赖边",
      description:
        "新增或更新一条依赖边（按 from+to+type 匹配，存在则替换否则追加）。默认写草稿；confirm=true 写入正式 dependencies.yaml。",
      inputSchema: {
        from: z.string().describe("上游功能 ID"),
        to: z.string().describe("下游功能 ID"),
        type: z.enum(["data", "state", "gate", "ui", "external"]).describe("依赖类型"),
        reason: z.string().optional().describe("依赖原因（建议填写）"),
        confirm: z.boolean().optional().describe("true=写入正式文件，默认写草稿"),
        knowledgeDir: z.string().optional().describe("知识库目录（可选）"),
      },
    },
    async (args) => runDependencyUpsert(args as DependencyUpsertInput),
  );
}

/* ------------------------------------------------------------------ */
/* journey_upsert                                                      */
/* ------------------------------------------------------------------ */

export interface JourneyUpsertInput {
  journeyId: string;
  journey: Record<string, unknown>;
  confirm?: boolean;
  knowledgeDir?: string;
}

export function runJourneyUpsert(input: JourneyUpsertInput): ToolTextResult {
  const paths = resolveKnowledgePaths({ dir: input.knowledgeDir });
  const raw = readRawSection(paths, "journeys");
  const journeys = (raw.journeys as Record<string, unknown>) ?? {};
  journeys[input.journeyId] = input.journey;

  const write = writeSection(paths, "journeys", { journeys }, { confirm: input.confirm });
  return toUpsertResult(write);
}

export function registerJourneyUpsert(server: McpServer): void {
  server.registerTool(
    "journey_upsert",
    {
      title: "新增或更新业务链路",
      description:
        "新增或更新一条业务链路（journey）。默认写草稿；confirm=true 写入正式 journeys.yaml。",
      inputSchema: {
        journeyId: z.string().describe("业务链路 ID（kebab-case）"),
        journey: z.record(z.string(), z.unknown()).describe("业务链路定义对象"),
        confirm: z.boolean().optional().describe("true=写入正式文件，默认写草稿"),
        knowledgeDir: z.string().optional().describe("知识库目录（可选）"),
      },
    },
    async (args) => runJourneyUpsert(args as JourneyUpsertInput),
  );
}

/* ------------------------------------------------------------------ */
/* test_path_upsert                                                    */
/* ------------------------------------------------------------------ */

export interface TestPathUpsertInput {
  testPathId: string;
  testPath: Record<string, unknown>;
  confirm?: boolean;
  knowledgeDir?: string;
}

export function runTestPathUpsert(input: TestPathUpsertInput): ToolTextResult {
  const paths = resolveKnowledgePaths({ dir: input.knowledgeDir });
  const raw = readRawSection(paths, "testPaths");
  const testPaths = (raw.test_paths as Record<string, unknown>) ?? {};
  testPaths[input.testPathId] = input.testPath;

  const write = writeSection(paths, "testPaths", { test_paths: testPaths }, { confirm: input.confirm });
  return toUpsertResult(write);
}

export function registerTestPathUpsert(server: McpServer): void {
  server.registerTool(
    "test_path_upsert",
    {
      title: "新增或更新测试路径",
      description:
        "新增或更新一条测试路径（test path）。默认写草稿；confirm=true 写入正式 test-paths.yaml。",
      inputSchema: {
        testPathId: z.string().describe("测试路径 ID（kebab-case）"),
        testPath: z.record(z.string(), z.unknown()).describe("测试路径定义对象"),
        confirm: z.boolean().optional().describe("true=写入正式文件，默认写草稿"),
        knowledgeDir: z.string().optional().describe("知识库目录（可选）"),
      },
    },
    async (args) => runTestPathUpsert(args as TestPathUpsertInput),
  );
}

/** Register all write tools on the server. */
export function registerWriteTools(server: McpServer): void {
  registerFeatureUpsert(server);
  registerDependencyUpsert(server);
  registerJourneyUpsert(server);
  registerTestPathUpsert(server);
}
