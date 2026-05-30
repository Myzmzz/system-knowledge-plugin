// Build script: bundle the MCP server (TypeScript) into a single runnable
// JavaScript file, then distribute it (and the shared skills) into BOTH plugin
// packages.
//
// Layout: the repo root holds the canonical source (mcp-server/, skills/). Each
// distributable plugin lives under plugins/<tool>/ and must be SELF-CONTAINED,
// because marketplace install for both Claude Code and Codex is a `git clone`
// (or subdir checkout) of the plugin directory — there is no `npm install` step
// at install time. So we commit the bundle + a copy of skills into each plugin.
//
// Codex requires a plugin to live in a SUBDIRECTORY of the marketplace repo
// (its source.path is e.g. "./plugins/codex"); it does not accept the repo root
// itself as a plugin. Claude Code is kept symmetric for clarity.
//
// MCP server command per tool:
//   - Claude Code: ${CLAUDE_PLUGIN_ROOT}/mcp/index.js (inline mcpServers)
//   - Codex:       mcp/index.js (relative to plugin root, per Codex docs)

import { build } from "esbuild";
import { createRequire } from "node:module";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const builtinModules = require("node:module").builtinModules;

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const ENTRY = path.join(ROOT, "mcp-server/src/index.ts");
const SKILLS_SRC = path.join(ROOT, "skills");

// Mark every Node built-in as external (both bare and `node:`-prefixed forms).
const nodeBuiltins = [
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
];

const PLUGIN_DIRS = [
  path.join(ROOT, "plugins/claude-code"),
  path.join(ROOT, "plugins/codex"),
];

async function bundleInto(outfile) {
  await build({
    entryPoints: [ENTRY],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    external: nodeBuiltins,
    logLevel: "error",
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
}

async function main() {
  for (const dir of PLUGIN_DIRS) {
    const mcpOut = path.join(dir, "mcp/index.js");
    mkdirSync(path.dirname(mcpOut), { recursive: true });
    await bundleInto(mcpOut);

    // Sync the shared skills into the plugin package (self-contained install).
    const skillsDest = path.join(dir, "skills");
    rmSync(skillsDest, { recursive: true, force: true });
    cpSync(SKILLS_SRC, skillsDest, { recursive: true });

    console.log(`Built plugin package: ${path.relative(ROOT, dir)}`);
  }
  console.log("Build succeeded: mcp-server/src/index.ts -> plugins/*/mcp/index.js (+ skills synced)");
}

main().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
