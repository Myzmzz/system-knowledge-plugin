/**
 * system-knowledge MCP server entry point.
 *
 * Wires the 12 tools (read / write / audit) onto a stdio-transported
 * `McpServer`. The tool *logic* lives in `./tools/*` as testable `run*`
 * functions; this file only constructs the server, registers the tools, and
 * connects the transport.
 *
 * The algorithms (dependency tracing, impact analysis, test-path generation,
 * change audit) and the knowledge loader/writer are pre-existing modules under
 * `./lib` and `./knowledge`; the tools merely wrap them.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerReadTools } from "./tools/read.js";
import { registerWriteTools } from "./tools/write.js";
import { registerAuditTools } from "./tools/audit.js";

/** Build a fully-configured server with all 12 tools registered. */
export function createServer(): McpServer {
  const server = new McpServer({ name: "system-knowledge", version: "0.1.0" });
  registerReadTools(server); // feature_get, feature_list, dependency_trace, impact_analyze, journey_get, test_path_generate
  registerWriteTools(server); // feature_upsert, dependency_upsert, journey_upsert, test_path_upsert
  registerAuditTools(server); // knowledge_validate, change_audit
  return server;
}

/** Start the server over stdio. Kept separate so tests can import without connecting. */
export async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only auto-start when executed directly (not when imported by tests).
// `import.meta.url` matches the process entry under both tsx and node.
const isDirectRun =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("system-knowledge MCP server failed to start:", error);
    process.exit(1);
  });
}
