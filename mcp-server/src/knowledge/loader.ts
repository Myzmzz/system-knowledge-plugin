/**
 * Loads and validates the six knowledge YAML files into a single in-memory
 * `KnowledgeBase`. Missing files are treated as empty sections (a brand-new
 * project may not have every file yet). Parse and schema errors are collected
 * rather than thrown, so callers (validate tooling) can report all problems.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

import {
  KNOWLEDGE_FILES,
  type KnowledgeBase,
  type KnowledgeFileKey,
} from "./schema.js";
import { resolveKnowledgePaths, type KnowledgePaths } from "./paths.js";

export interface LoadIssue {
  /** Which knowledge file the issue came from. */
  file: string;
  /** zod path (dot-joined) or a parse-level marker. */
  path: string;
  message: string;
}

export interface LoadResult {
  knowledge: KnowledgeBase;
  paths: KnowledgePaths;
  issues: LoadIssue[];
}

function emptyKnowledgeBase(): KnowledgeBase {
  return {
    features: {},
    dependencies: [],
    entities: {},
    stateMachines: {},
    journeys: {},
    testPaths: {},
  };
}

/**
 * Maps a parsed-and-validated file payload onto the corresponding slice of the
 * combined KnowledgeBase. Keeps the loader honest about the (intentional)
 * key renames between the YAML root keys and the in-memory shape.
 */
function assign(
  kb: KnowledgeBase,
  key: KnowledgeFileKey,
  // deno-lint-ignore no-explicit-any
  payload: any,
): void {
  switch (key) {
    case "features":
      kb.features = payload.features;
      break;
    case "dependencies":
      kb.dependencies = payload.dependencies;
      break;
    case "entities":
      kb.entities = payload.entities;
      break;
    case "states":
      kb.stateMachines = payload.state_machines;
      break;
    case "journeys":
      kb.journeys = payload.journeys;
      break;
    case "testPaths":
      kb.testPaths = payload.test_paths;
      break;
  }
}

export function loadKnowledge(opts?: {
  dir?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): LoadResult {
  const paths = resolveKnowledgePaths(opts);
  const kb = emptyKnowledgeBase();
  const issues: LoadIssue[] = [];

  for (const [key, { file, schema }] of Object.entries(KNOWLEDGE_FILES)) {
    const filePath = path.join(paths.knowledgeDir, file);
    if (!existsSync(filePath)) {
      // Missing file -> empty section. Not an error.
      continue;
    }

    let raw: unknown;
    try {
      raw = parseYaml(readFileSync(filePath, "utf8")) ?? {};
    } catch (err) {
      issues.push({
        file,
        path: "<yaml>",
        message: `YAML parse error: ${(err as Error).message}`,
      });
      continue;
    }

    const result = schema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({
          file,
          path: issue.path.join(".") || "<root>",
          message: issue.message,
        });
      }
      continue;
    }

    assign(kb, key as KnowledgeFileKey, result.data);
  }

  return { knowledge: kb, paths, issues };
}
