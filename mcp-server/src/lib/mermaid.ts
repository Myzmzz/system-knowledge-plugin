/**
 * Diagram generation — backs `knowledge graph` (CLI). plunginintro.md §7.3 / §12.3.
 *
 * Phase 1 emits Mermaid text; phase 4 wraps it in a self-contained HTML page
 * (Mermaid loaded from CDN). Three diagram kinds: dependency graph, state
 * machine, business journey.
 */

import type { KnowledgeBase } from "../knowledge/schema.js";

/** Mermaid node ids must be alphanumeric/underscore; map kebab ids safely. */
function nodeId(id: string): string {
  return "n_" + id.replace(/[^a-zA-Z0-9_]/g, "_");
}

function escapeLabel(text: string): string {
  return text.replace(/"/g, "&quot;").replace(/\n/g, " ");
}

/** Dependency graph: one directed edge per upstream→downstream relationship. */
export function dependencyMermaid(kb: KnowledgeBase): string {
  const lines = ["graph LR"];
  const declared = new Set<string>();

  const declare = (id: string) => {
    if (declared.has(id)) return;
    declared.add(id);
    const name = kb.features[id]?.name ?? id;
    lines.push(`  ${nodeId(id)}["${escapeLabel(name)}"]`);
  };

  // Collect edges from both explicit dependencies and depends_on arrays.
  const edges = new Map<string, string | undefined>(); // "from->to" -> reason/type
  for (const e of kb.dependencies) {
    edges.set(`${e.from}->${e.to}`, e.type);
    declare(e.from);
    declare(e.to);
  }
  for (const [id, f] of Object.entries(kb.features)) {
    declare(id);
    for (const up of f.depends_on ?? []) {
      const key = `${up}->${id}`;
      if (!edges.has(key)) edges.set(key, undefined);
      declare(up);
    }
  }

  for (const [key, type] of edges) {
    const [from, to] = key.split("->");
    const label = type ? `|${type}|` : "";
    lines.push(`  ${nodeId(from)} -->${label} ${nodeId(to)}`);
  }
  return lines.join("\n");
}

/** State machine for one entity: stateDiagram-v2. */
export function stateMachineMermaid(kb: KnowledgeBase, entity: string): string {
  const sm = kb.stateMachines[entity];
  if (!sm) {
    return `stateDiagram-v2\n  note "未找到状态机 ${escapeLabel(entity)}"`;
  }
  const lines = ["stateDiagram-v2"];
  for (const [stateName, state] of Object.entries(sm.states)) {
    const label = state.label ? `: ${escapeLabel(state.label)}` : "";
    lines.push(`  ${nodeId(stateName)}${label}`);
    // Edges are implied by allowed_actions that name another state; since the
    // doc models actions (not explicit target states) we annotate actions as notes.
    if ((state.allowed_actions ?? []).length) {
      lines.push(`  note right of ${nodeId(stateName)}`);
      lines.push(`    allowed: ${state.allowed_actions.join(", ")}`);
      lines.push(`  end note`);
    }
  }
  return lines.join("\n");
}

/** Business journey: ordered steps with failure-recovery branches. */
export function journeyMermaid(kb: KnowledgeBase, journeyId: string): string {
  const journey = kb.journeys[journeyId];
  if (!journey) {
    return `graph LR\n  missing["未找到业务链路 ${escapeLabel(journeyId)}"]`;
  }
  const lines = ["graph LR"];
  const steps = journey.steps ?? [];
  lines.push(`  start(("${escapeLabel(journey.start ?? "start")}"))`);
  let prev = "start";
  for (const step of steps) {
    const name = kb.features[step]?.name ?? step;
    lines.push(`  ${nodeId(step)}["${escapeLabel(name)}"]`);
    lines.push(`  ${prev} --> ${nodeId(step)}`);
    prev = nodeId(step);
    // failure recovery branch
    const recovery = journey.failure_recovery?.[step];
    if (recovery?.length) {
      const recId = nodeId(step) + "_rec";
      lines.push(`  ${recId}{{"恢复: ${escapeLabel(recovery.join(" / "))}"}}`);
      lines.push(`  ${nodeId(step)} -.->|失败| ${recId}`);
    }
  }
  lines.push(`  done(("${escapeLabel(journey.end ?? "end")}"))`);
  lines.push(`  ${prev} --> done`);
  return lines.join("\n");
}

/** Wrap any Mermaid source in a standalone HTML page (phase 4 export). */
export function mermaidHtml(title: string, mermaidSource: string): string {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeLabel(title)}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 2rem; }
    h1 { font-size: 1.25rem; }
  </style>
</head>
<body>
  <h1>${escapeLabel(title)}</h1>
  <pre class="mermaid">
${mermaidSource}
  </pre>
  <script type="module">
    import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
    mermaid.initialize({ startOnLoad: true });
  </script>
</body>
</html>`;
}
