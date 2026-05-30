// Build script: bundle the MCP server (TypeScript) into a single runnable
// JavaScript file at `mcp/index.js`.
//
// Why a single bundle: marketplace install for both Claude Code and Codex is a
// `git clone` of this repo, so the runnable server must be in-tree and
// self-contained (no `npm install` step at install time). esbuild inlines all
// the third-party dependencies; only Node built-ins stay external.
//
// Both plugin forms point their MCP `command` at `node` and pass this file:
//   - Claude Code: `${CLAUDE_PLUGIN_ROOT}/mcp/index.js` (inline mcpServers in
//     .claude-plugin/plugin.json)
//   - Codex:       `mcp/index.js` (relative path in .mcp.json)

import { build } from "esbuild";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const builtinModules = require("node:module").builtinModules;

// Mark every Node built-in as external (both bare and `node:`-prefixed forms)
// so esbuild does not try to bundle the standard library into the output.
const nodeBuiltins = [
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
];

const ENTRY = "mcp-server/src/index.ts";
const OUTFILE = "mcp/index.js";

async function main() {
  await build({
    entryPoints: [ENTRY],
    outfile: OUTFILE,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    external: nodeBuiltins,
    logLevel: "info",
    // The output is ESM, but some transitive deps use CommonJS `require()` at
    // runtime (e.g. dynamic `require("process")`). esbuild's ESM output would
    // otherwise replace `require` with a stub that throws "Dynamic require of X
    // is not supported". Re-introduce a real `require` (and __filename/__dirname
    // for deps that read them) bound to this module's URL.
    banner: {
      js: [
        "import { createRequire as __createRequire } from 'node:module';",
        "import { fileURLToPath as __fileURLToPath } from 'node:url';",
        "import { dirname as __pathDirname } from 'node:path';",
        "const require = __createRequire(import.meta.url);",
        "const __filename = __fileURLToPath(import.meta.url);",
        "const __dirname = __pathDirname(__filename);",
      ].join("\n"),
    },
  });

  console.log(`Build succeeded: ${ENTRY} -> ${OUTFILE}`);
}

main().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
