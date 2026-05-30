/**
 * Resolves where the knowledge base lives on disk.
 *
 * Resolution order (first hit wins):
 *   1. Explicit `dir` argument.
 *   2. `SYSTEM_KNOWLEDGE_DIR` environment variable.
 *   3. Nearest ancestor directory (from cwd upward) that contains a
 *      `knowledge/features.yaml`.
 *   4. `<cwd>/knowledge` as the default.
 *
 * Draft writes (plunginintro.md §13 — "区分草稿写入和正式写入") go to
 * `<knowledgeDir>/.drafts/`, which is git-ignored.
 */

import { existsSync } from "node:fs";
import path from "node:path";

export interface KnowledgePaths {
  /** Absolute path to the knowledge directory holding the six YAML files. */
  knowledgeDir: string;
  /** Absolute path to the draft staging directory. */
  draftsDir: string;
}

/** Walk upward from `start` looking for a directory with knowledge/features.yaml. */
function findKnowledgeDirUpward(start: string): string | undefined {
  let current = path.resolve(start);
  // Guard against infinite loops at the filesystem root.
  for (let i = 0; i < 64; i++) {
    const candidate = path.join(current, "knowledge", "features.yaml");
    if (existsSync(candidate)) {
      return path.join(current, "knowledge");
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

export function resolveKnowledgePaths(opts?: {
  dir?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): KnowledgePaths {
  const cwd = opts?.cwd ?? process.cwd();
  const env = opts?.env ?? process.env;

  let knowledgeDir: string;
  if (opts?.dir) {
    knowledgeDir = path.resolve(cwd, opts.dir);
  } else if (env.SYSTEM_KNOWLEDGE_DIR) {
    knowledgeDir = path.resolve(cwd, env.SYSTEM_KNOWLEDGE_DIR);
  } else {
    knowledgeDir = findKnowledgeDirUpward(cwd) ?? path.join(cwd, "knowledge");
  }

  return {
    knowledgeDir,
    draftsDir: path.join(knowledgeDir, ".drafts"),
  };
}
