/**
 * `knowledge` CLI entry point — plunginintro.md §7.
 *
 * Five deterministic subcommands that wrap the shared algorithm library:
 *   - validate    (§7.2)  校验知识库结构和引用 — CI gate
 *   - graph       (§7.3)  生成 Mermaid 图 / Markdown 报告
 *   - impact      (§7.4)  根据功能或文件变更生成影响面
 *   - audit-diff  (§7.5)  结合 git diff 提示知识图是否需要更新
 *   - scan-code   (§7.1)  轻量启发式扫描，生成功能草稿
 *
 * Argument parsing is intentionally thin (node:util parseArgs); every command's
 * logic lives in an exported core function under cli/commands/.
 *
 * Run in dev via `tsx cli/index.ts <command> [...flags]`; package.json `bin`
 * points the installed `knowledge` binary here (no shebang — invoked via tsx /
 * the built bundle).
 */

import { parseArgs } from "node:util";

import { runValidate } from "./commands/validate.js";
import { runGraph, type GraphFormat, type GraphType } from "./commands/graph.js";
import { runImpact } from "./commands/impact.js";
import { runAuditDiff } from "./commands/auditDiff.js";
import { runScanCode } from "./commands/scanCode.js";
import { parseCsv } from "./lib/report.js";

const USAGE = `knowledge — 系统知识图 CLI (plunginintro.md §7)

用法：
  knowledge <command> [选项]

命令：
  validate                校验知识库结构和引用（错误时退出码 1，供 CI 使用）
  graph                   生成 Mermaid 图 / Markdown 报告
  impact                  分析功能或文件变更的影响面
  audit-diff              结合 git diff 提示知识图是否需要更新
  scan-code               轻量启发式扫描代码，生成功能草稿

通用选项：
  --dir <path>            知识库目录（默认自动发现）
  --json                  以 JSON 输出（部分命令支持）
  -h, --help              显示帮助

各命令选项：
  graph       --type dependency|state-machine|journey
              [--entity <名称>] [--name <journey id>]
              [--format md|html] [--out <文件路径>]
  impact      --feature <id> | --changed-files a,b,c
              [--change-type add|modify|remove] [--out <文件路径>]
  audit-diff  [--base <ref>] [--changed-files a,b,c] [--out <文件路径>]
  scan-code   [--root <目录>] [--out <目录>]

示例：
  knowledge validate --dir examples/deploy-system/knowledge
  knowledge graph --type dependency
  knowledge graph --type state-machine --entity DeployTask
  knowledge graph --type journey --name full-deploy
  knowledge impact --feature deploy-config
  knowledge audit-diff
  knowledge scan-code --root .
`;

interface ParsedCli {
  command: string | undefined;
  values: Record<string, string | boolean | undefined>;
}

/** Parse argv into a command + flag map. Unknown flags are tolerated. */
function parse(argv: string[]): ParsedCli {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
    options: {
      dir: { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      // graph
      type: { type: "string" },
      entity: { type: "string" },
      name: { type: "string" },
      format: { type: "string" },
      out: { type: "string" },
      // impact
      feature: { type: "string" },
      "changed-files": { type: "string" },
      "change-type": { type: "string" },
      // audit-diff
      base: { type: "string" },
      // scan-code
      root: { type: "string" },
    },
  });
  return { command: positionals[0], values: values as ParsedCli["values"] };
}

function str(values: ParsedCli["values"], key: string): string | undefined {
  const v = values[key];
  return typeof v === "string" ? v : undefined;
}

function fail(message: string): never {
  console.error(`错误：${message}\n`);
  console.error(USAGE);
  process.exit(2);
}

function main(): void {
  const argv = process.argv.slice(2);
  const { command, values } = parse(argv);

  if (values.help || !command) {
    console.log(USAGE);
    process.exit(command ? 0 : values.help ? 0 : 1);
  }

  const dir = str(values, "dir");
  const json = values.json === true;

  switch (command) {
    case "validate": {
      const result = runValidate({ dir });
      if (json) {
        console.log(JSON.stringify(result.report, null, 2));
      } else {
        console.log(result.text);
      }
      process.exit(result.ok ? 0 : 1);
      break;
    }

    case "graph": {
      const type = str(values, "type") as GraphType | undefined;
      if (!type) fail("graph 需要 --type dependency|state-machine|journey");
      const format = (str(values, "format") as GraphFormat | undefined) ?? "md";
      if (format !== "md" && format !== "html") {
        fail("--format 仅支持 md 或 html");
      }
      try {
        const result = runGraph({
          dir,
          type: type as GraphType,
          entity: str(values, "entity"),
          name: str(values, "name"),
          format,
          out: str(values, "out"),
        });
        if (json) {
          console.log(
            JSON.stringify(
              { type: result.type, path: result.path, source: result.source },
              null,
              2,
            ),
          );
        } else {
          console.log(result.text);
        }
      } catch (err) {
        fail((err as Error).message);
      }
      break;
    }

    case "impact": {
      const feature = str(values, "feature");
      const changedFiles = parseCsv(str(values, "changed-files"));
      if (!feature && changedFiles.length === 0) {
        fail("impact 需要 --feature <id> 或 --changed-files a,b,c");
      }
      const changeType = str(values, "change-type") as
        | "add"
        | "modify"
        | "remove"
        | undefined;
      try {
        const result = runImpact({
          dir,
          feature,
          changedFiles: changedFiles.length ? changedFiles : undefined,
          changeType,
          out: str(values, "out"),
        });
        if (json) {
          console.log(
            JSON.stringify(
              { results: result.results, unmatchedFiles: result.unmatchedFiles, path: result.path },
              null,
              2,
            ),
          );
        } else {
          console.log(result.text);
        }
      } catch (err) {
        fail((err as Error).message);
      }
      break;
    }

    case "audit-diff": {
      const changedFiles = parseCsv(str(values, "changed-files"));
      const result = runAuditDiff({
        dir,
        base: str(values, "base"),
        changedFiles: changedFiles.length ? changedFiles : undefined,
        out: str(values, "out"),
      });
      if (json) {
        console.log(
          JSON.stringify(
            {
              isGitRepo: result.isGitRepo,
              source: result.source,
              result: result.result,
              path: result.path,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(result.text);
      }
      break;
    }

    case "scan-code": {
      const result = runScanCode({
        root: str(values, "root"),
        outDir: str(values, "out"),
      });
      if (json) {
        console.log(
          JSON.stringify(
            { scan: result.scan, jsonPath: result.jsonPath, yamlPath: result.yamlPath },
            null,
            2,
          ),
        );
      } else {
        console.log(result.text);
      }
      break;
    }

    default:
      fail(`未知命令：${command}`);
  }
}

main();
