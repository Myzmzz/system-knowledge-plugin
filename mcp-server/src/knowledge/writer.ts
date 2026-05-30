/**
 * Persists knowledge sections back to YAML.
 *
 * Safety boundary (plunginintro.md §13): writes default to a DRAFT location
 * (`<knowledgeDir>/.drafts/<file>`) and only land in the canonical file when
 * the caller passes `confirm: true`. This keeps agent-authored changes
 * reviewable before they become "official".
 *
 * The writer is schema-agnostic on purpose: it reads the raw object, lets the
 * caller mutate the relevant record, validates against the file's zod schema,
 * then serializes. Upsert tools own the merge logic.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { KNOWLEDGE_FILES, type KnowledgeFileKey } from "./schema.js";
import type { KnowledgePaths } from "./paths.js";

export interface WriteResult {
  /** Absolute path that was written. */
  path: string;
  /** Whether the write landed in the canonical file (true) or a draft (false). */
  committed: boolean;
}

/**
 * Reads the raw (unwrapped) object for a knowledge file. Prefers a pending
 * draft over the canonical file so successive upserts accumulate. Returns an
 * empty object shaped with the file's root key when nothing exists yet.
 */
export function readRawSection(
  paths: KnowledgePaths,
  key: KnowledgeFileKey,
): Record<string, unknown> {
  const { file } = KNOWLEDGE_FILES[key];
  const draftPath = path.join(paths.draftsDir, file);
  const finalPath = path.join(paths.knowledgeDir, file);
  const source = existsSync(draftPath) ? draftPath : finalPath;
  if (!existsSync(source)) return {};
  return (parseYaml(readFileSync(source, "utf8")) as Record<string, unknown>) ?? {};
}

/**
 * Validates `payload` against the file's schema and writes it as YAML to either
 * the draft dir (default) or the canonical file (`confirm: true`).
 *
 * @throws if `payload` fails schema validation — we never write invalid YAML.
 */
export function writeSection(
  paths: KnowledgePaths,
  key: KnowledgeFileKey,
  payload: unknown,
  opts: { confirm?: boolean } = {},
): WriteResult {
  const { file, schema } = KNOWLEDGE_FILES[key];

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    throw new Error(`Refusing to write invalid ${file}: ${detail}`);
  }

  const yamlText = stringifyYaml(payload, { lineWidth: 0 });

  const targetDir = opts.confirm ? paths.knowledgeDir : paths.draftsDir;
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, file);
  writeFileSync(targetPath, yamlText, "utf8");

  return { path: targetPath, committed: Boolean(opts.confirm) };
}
