/**
 * Shared helpers for the MCP tool layer.
 *
 * These keep the per-tool handlers thin: every tool ultimately returns a single
 * `text` content block holding pretty-printed JSON, and the read tools share the
 * same "closest id" suggestion strategy when a lookup misses (plunginintro.md
 * §6.3 — "找不到时返回相近功能 ID 建议").
 *
 * The functions here are intentionally pure so the unit tests can exercise the
 * tool logic without standing up an MCP transport.
 */

/**
 * The MCP tool result shape we always emit: one JSON text block.
 *
 * The index signature mirrors the SDK's `CallToolResult` (which allows extra
 * top-level keys via `_meta` etc.), so a `ToolTextResult` is directly
 * assignable to the SDK's tool-callback return type.
 */
export interface ToolTextResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

/** Wrap any serializable value as the standard single-text-block tool result. */
export function jsonResult(value: unknown): ToolTextResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

/**
 * Classic Levenshtein edit distance between two strings. Used to rank candidate
 * ids when an exact lookup fails. O(a.length * b.length); the id space is tiny
 * so this is plenty fast.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Single rolling row of the DP matrix.
  let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  let currentRow = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    currentRow[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow[j] = Math.min(
        currentRow[j - 1] + 1, // insertion
        previousRow[j] + 1, // deletion
        previousRow[j - 1] + substitutionCost, // substitution
      );
    }
    [previousRow, currentRow] = [currentRow, previousRow];
  }
  return previousRow[b.length];
}

/**
 * Given a target id that wasn't found and the set of known ids, return the
 * closest matches. Substring hits (either direction) are always surfaced; the
 * remainder are ranked by edit distance and only kept when reasonably close.
 *
 * @param limit maximum number of suggestions to return (default 5).
 */
export function suggestClosestIds(
  target: string,
  candidates: string[],
  limit = 5,
): string[] {
  const lowerTarget = target.toLowerCase();

  const scored = candidates.map((candidate) => {
    const lowerCandidate = candidate.toLowerCase();
    const isSubstring =
      lowerCandidate.includes(lowerTarget) || lowerTarget.includes(lowerCandidate);
    return {
      candidate,
      distance: levenshtein(lowerTarget, lowerCandidate),
      isSubstring,
    };
  });

  scored.sort((left, right) => {
    // Substring matches rank first, then by edit distance, then alphabetically.
    if (left.isSubstring !== right.isSubstring) return left.isSubstring ? -1 : 1;
    if (left.distance !== right.distance) return left.distance - right.distance;
    return left.candidate.localeCompare(right.candidate);
  });

  // Keep substring matches plus any candidate within a sane edit-distance bound,
  // so we never spew the entire id list for a wildly different query.
  const distanceCeiling = Math.max(3, Math.ceil(target.length / 2));
  return scored
    .filter((entry) => entry.isSubstring || entry.distance <= distanceCeiling)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}
