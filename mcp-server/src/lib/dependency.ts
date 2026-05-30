/**
 * Dependency traversal — backs `dependency_trace` (MCP) and feeds impact
 * analysis. plunginintro.md §5.3 / §6.4.
 *
 * Edge semantics: an edge `{from, to}` means `from` is UPSTREAM of `to`
 * (i.e. `to` depends on `from`). This is consistent with a feature's
 * `depends_on` listing its upstreams and `used_by` listing its downstreams.
 *
 * Upstream/downstream are derived from BOTH sources and unioned:
 *   - explicit edges in dependencies.yaml (these carry a `reason`)
 *   - the feature's own `depends_on` / `used_by` arrays
 */

import type { KnowledgeBase } from "../knowledge/schema.js";

export type Direction = "upstream" | "downstream" | "both";

export interface TraceNode {
  featureId: string;
  /** Resolved feature name, or the id itself if the feature is unregistered. */
  name: string;
  /** Edge reason, when the relationship came from an explicit dependency edge. */
  reason?: string;
  /** Edge type, when available. */
  type?: string;
  /** BFS depth at which this node was reached (1 = direct neighbour). */
  depth: number;
}

export interface TraceResult {
  featureId: string;
  upstream: TraceNode[];
  downstream: TraceNode[];
}

function featureName(kb: KnowledgeBase, id: string): string {
  return kb.features[id]?.name ?? id;
}

/** Direct upstream neighbours of `id` (the things `id` depends on). */
function directUpstream(
  kb: KnowledgeBase,
  id: string,
): Array<{ featureId: string; reason?: string; type?: string }> {
  const out = new Map<string, { featureId: string; reason?: string; type?: string }>();
  // edges where `id` is the downstream (to)
  for (const edge of kb.dependencies) {
    if (edge.to === id) {
      out.set(edge.from, { featureId: edge.from, reason: edge.reason, type: edge.type });
    }
  }
  // declared depends_on
  for (const dep of kb.features[id]?.depends_on ?? []) {
    if (!out.has(dep)) out.set(dep, { featureId: dep });
  }
  return [...out.values()];
}

/** Direct downstream neighbours of `id` (the things that depend on `id`). */
function directDownstream(
  kb: KnowledgeBase,
  id: string,
): Array<{ featureId: string; reason?: string; type?: string }> {
  const out = new Map<string, { featureId: string; reason?: string; type?: string }>();
  for (const edge of kb.dependencies) {
    if (edge.from === id) {
      out.set(edge.to, { featureId: edge.to, reason: edge.reason, type: edge.type });
    }
  }
  for (const dep of kb.features[id]?.used_by ?? []) {
    if (!out.has(dep)) out.set(dep, { featureId: dep });
  }
  return [...out.values()];
}

/** BFS over one direction up to `depth`, deduplicating and avoiding cycles. */
function walk(
  kb: KnowledgeBase,
  start: string,
  depth: number,
  step: (kb: KnowledgeBase, id: string) => Array<{ featureId: string; reason?: string; type?: string }>,
): TraceNode[] {
  const seen = new Set<string>([start]);
  const result: TraceNode[] = [];
  let frontier = [start];
  for (let d = 1; d <= depth; d++) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const neighbour of step(kb, node)) {
        if (seen.has(neighbour.featureId)) continue;
        seen.add(neighbour.featureId);
        result.push({
          featureId: neighbour.featureId,
          name: featureName(kb, neighbour.featureId),
          reason: neighbour.reason,
          type: neighbour.type,
          depth: d,
        });
        next.push(neighbour.featureId);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return result;
}

export function traceDependencies(
  kb: KnowledgeBase,
  featureId: string,
  opts: { direction?: Direction; depth?: number } = {},
): TraceResult {
  const direction = opts.direction ?? "both";
  const depth = Math.max(1, opts.depth ?? 1);

  const wantUp = direction === "upstream" || direction === "both";
  const wantDown = direction === "downstream" || direction === "both";

  return {
    featureId,
    upstream: wantUp ? walk(kb, featureId, depth, directUpstream) : [],
    downstream: wantDown ? walk(kb, featureId, depth, directDownstream) : [],
  };
}

export { directUpstream, directDownstream };
