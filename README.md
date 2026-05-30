# System Knowledge Plugin（系统知识图插件）

面向智能体协作开发的**系统知识基础设施**。它把分散在代码、对话、文档和测试结果中的系统知识，沉淀为**可查询、可维护、可校验**的结构化资产，并通过 MCP Tools、CLI 脚本和 Skill，支持开发前依赖分析、变更影响分析、业务链路测试路径生成与知识图校验。

本仓库**同时是一个 Claude Code 插件，也是一个 Codex 插件**，并且仓库本身就充当两个市场（marketplace）的清单源。两个插件各自打包在子目录下、自包含：`plugins/claude-code/` 与 `plugins/codex/`，每个目录内含自己的清单、`.mcp.json`、`skills/`（从根 `skills/` 同步）和构建产物 `mcp/index.js`。根目录保留两份市场清单（`.claude-plugin/marketplace.json`、`.agents/plugins/marketplace.json`）和共享源码（`mcp-server/`、`cli/`、`skills/`、`knowledge/`）。

> 两个版本均已用真实 CLI 端到端验证：Claude Code（识别 3 skills + 1 MCP server）与 Codex 0.135.0（`codex plugin add` 成功、`codex mcp list` 显示 `system-knowledge` 已启用）。

---

## 这是什么

开发与测试中反复出现的问题：

- 单点功能做完后，又暴露上下游数据、状态、入口门禁、真实环境校验、测试顺序等问题；
- 功能依赖靠人工记忆，缺少统一的功能依赖图；
- 测试常从一个按钮动作开始，而不是从完整业务链路开始；
- 改动某功能后，难以判断要回归哪些页面、接口、状态和测试路径；
- 系统知识散落各处，没有形成可查询、可维护的结构化资产。

本插件用一套 YAML 知识库 + MCP 工具 + CLI 脚本 + Skill 来回答三个问题：

- **开发时**：我要改的功能在系统里处于什么位置？依赖谁？谁依赖它？
- **测试时**：这个功能应该按什么业务顺序验证？
- **评审时**：这次改动影响了哪些上下游，是否同步更新了知识图和测试路径？

---

## 架构（三层）

| 层级 | 作用 | 典型内容 |
|---|---|---|
| **Skill** | 告诉智能体如何思考和推进 | 开发闭环方法、业务链路测试方法、知识图维护原则 |
| **MCP Tools** | 让智能体结构化查询与维护知识图 | 查询功能、追踪依赖、分析影响、生成测试路径、写入草稿 |
| **Scripts（CLI）** | 保证知识图可重复、可校验、可生成 | 扫描代码、校验 YAML、生成 Mermaid 图、影响分析、diff 审计 |

核心原则：**智能体负责语义，脚本负责确定性**。依赖原因、业务判断由智能体补充；唯一性、引用完整性、图生成由 CLI / 工具保证。影响分析只给建议，不替用户做业务确认。

---

## 6 个知识文件

知识库位于 `knowledge/`，由 6 个 YAML 文件组成：

| 文件 | 内容 |
|---|---|
| `features.yaml` | 系统功能节点：`name`、`module`、`maturity`、`entry_points`、`code_refs`、`depends_on`、`provides`、`used_by`、`states` 等 |
| `dependencies.yaml` | 功能之间的边关系与原因：`from`、`to`、`type`（`data` / `state` / `gate` / `ui` / `external`）、`reason` |
| `entities.yaml` | 系统核心实体与字段：字段类型、是否必填、跨实体引用（`ref`） |
| `states.yaml` | 状态机与操作门禁：每个状态的 `allowed_actions`、`disabled_actions`、`visible_pages` |
| `journeys.yaml` | 端到端业务链路：`start`、`end`、`steps`、`failure_recovery`、`acceptance` |
| `test-paths.yaml` | 业务链路测试路径：`target_feature`、`preconditions`、`steps`、`assertions`、`regression_scope` |

仓库自带：

- `knowledge/` —— **通用模板**（空 schema + 极简种子），克隆后可直接替换为你自己的系统知识；
- `examples/deploy-system/knowledge/` —— **部署系统完整示例**，展示一套真实的功能依赖图与测试路径。

---

## MCP 工具列表

工具名按 MCP 约定使用下划线；文档中出现的点号写法（如 `feature.get`）是同一工具的别名。

**只读查询**

| 工具 | 作用 |
|---|---|
| `feature_get` | 查询某功能节点的完整定义 |
| `feature_list` | 列出功能节点 |
| `dependency_trace` | 查询某功能的上游依赖与下游影响（支持 `depth` / `direction`） |
| `impact_analyze` | 分析修改某功能后的影响面与回归范围 |
| `journey_get` | 查询端到端业务链路 |
| `test_path_generate` | 根据目标功能生成测试路径（区分"已登记"与"推导"） |

**写入（草稿 / 正式两态）**

> 所有 `*_upsert` 工具**默认只写 `knowledge/.drafts/`**；只有显式传 `confirm: true` 才写入正式 YAML。先写草稿、校验、人工确认，再正式落盘。

| 工具 | 作用 |
|---|---|
| `feature_upsert` | 新增或更新功能节点 |
| `dependency_upsert` | 新增或更新依赖边 |
| `journey_upsert` | 新增或更新业务链路 |
| `test_path_upsert` | 新增或更新测试路径 |

**审计**

| 工具 | 作用 |
|---|---|
| `knowledge_validate` | 校验知识库结构与引用完整性 |
| `change_audit` | 结合代码变更（git diff）提示知识图更新与回归建议 |

---

## CLI 命令

统一入口为 `knowledge <cmd>`（开发时用 `npx tsx cli/index.ts <cmd>`）：

```bash
# 扫描代码结构，生成功能草稿
knowledge scan-code --root .

# 校验知识库（YAML 可解析、featureId 唯一、引用完整、状态可达等）
knowledge validate
knowledge validate --dir examples/deploy-system/knowledge

# 生成 Mermaid 图与 Markdown 报告
knowledge graph --type dependency
knowledge graph --type state-machine --entity DeployTask
knowledge graph --type journey --name full-deploy

# 影响分析
knowledge impact --feature deploy-config
knowledge impact --changed-files 部署系统/prototype/Page1Deploy.jsx

# 结合 git diff 审计知识图是否需要更新
knowledge audit-diff
```

---

## 在 Claude Code 中安装

```text
/plugin marketplace add Myzmzz/system-knowledge-plugin
/plugin install system-knowledge-plugin@system-knowledge
```

安装后：

- `plugins/claude-code/skills/` 下的 Skill 会被自动发现；
- MCP 服务器 `system-knowledge` 由 `plugins/claude-code/.mcp.json` 声明，Claude Code 通过 `${CLAUDE_PLUGIN_ROOT}/mcp/index.js` 启动它。

---

## 在 Codex 中安装

```text
/plugin marketplace add Myzmzz/system-knowledge-plugin
/plugin install
/reload-plugins
```

安装后：

- `plugins/codex/skills/` 下的 Skill 与 Claude Code 同源（构建时从根 `skills/` 同步）；
- MCP 服务器由 `plugins/codex/.codex-plugin/plugin.json` 通过 `mcpServers: "./.mcp.json"` 引用，`plugins/codex/.mcp.json` 中以**相对插件根的路径** `mcp/index.js` 指向构建产物（见下方"MCP 路径解析说明"）。

---

## 让服务器指向你自己项目的知识库

MCP 服务器解析知识库目录的顺序（命中即止）：

1. 工具调用时显式传入的 `dir` 参数；
2. 环境变量 **`SYSTEM_KNOWLEDGE_DIR`**；
3. 从当前工作目录向上逐级查找，第一个包含 `knowledge/features.yaml` 的目录；
4. 兜底为 `<cwd>/knowledge`。

因此最简单的两种用法：

- 在你的项目根放一个 `knowledge/` 目录（推荐，和代码一起进仓库、一起 review），服务器会自动发现；
- 或显式设置环境变量指向任意位置：

```bash
export SYSTEM_KNOWLEDGE_DIR=/absolute/path/to/your/knowledge
```

### MCP 路径解析说明（Claude Code vs Codex）

两种工具都用各自的 `.mcp.json` 文件声明 MCP 服务器，但路径写法不同（已分别用真实 CLI 验证）：

- **Claude Code**：`plugins/claude-code/.mcp.json` 用插件根变量 `${CLAUDE_PLUGIN_ROOT}/mcp/index.js`，能稳定定位安装后的插件目录。（注意：Claude Code 的组件计数读取 `.mcp.json` **文件**，而非 `plugin.json` 里的内联 `mcpServers` 块——所以这里用独立文件。）
- **Codex**：`plugins/codex/.mcp.json` 用**相对插件根的路径** `["mcp/index.js"]`。Codex 官方文档说明 `.mcp.json` 中的路径相对于插件根解析；实测 Codex 0.135.0 以插件根为工作目录启动该命令，可正常加载 12 个工具。
- **两个要点（均由真实 CLI 暴露并修正）**：Codex 的 `policy.authentication` 合法值是 `ON_INSTALL` / `ON_USE`（不是 `ON_FIRST_USE`）；且 Codex 不接受仓库根作为插件源，插件必须位于子目录（`./plugins/codex`）。

> 注意：`mcp/index.js`（esbuild 打出的单文件 bundle）**会随仓库一起提交**到每个插件子目录。因为两个市场的安装方式都是 `git clone`（或子目录检出），可运行的 MCP server 必须在仓库内、自包含，无需安装期 `npm install`。

---

## 部署系统示例（examples/deploy-system）

`examples/deploy-system/knowledge/` 是一套完整的示例知识库，围绕一个 Kubernetes / Helm 部署平台建模，包含集群管理、应用管理、部署资产、部署配置、预检、执行验证、资源管理、卸载、报告等功能节点，以及 `full-deploy` 等业务链路与 `deploy-e2e` 等测试路径。

可直接对它运行校验：

```bash
npx tsx cli/index.ts validate --dir examples/deploy-system/knowledge
```

CI 也会对该示例执行同一条校验命令。

---

## 开发与构建

本项目为 TypeScript 项目，使用 `vitest` 测试（因此偏离全局默认的 Python/pytest 约定）。

```bash
# 安装依赖
npm ci

# 类型检查
npm run typecheck

# 运行测试
npm test

# 构建 MCP server 单文件 bundle -> plugins/{claude-code,codex}/mcp/index.js（并同步 skills）
npm run build

# 本地直接跑 MCP server（stdio）
npm run mcp

# 本地跑 CLI
npm run knowledge -- validate
```

构建脚本 `scripts/build.mjs` 使用 esbuild 把 `mcp-server/src/index.ts` 打包，并分发进两个插件目录：

```text
bundle:   true
platform: node
format:   esm
target:   node18
outfile:  plugins/claude-code/mcp/index.js 和 plugins/codex/mcp/index.js
external: 全部 Node 内置模块（bare 形式与 node: 前缀形式）
banner:   注入真实 require/__filename/__dirname（修复 ESM 下 "Dynamic require" 崩溃）
其它:     把根 skills/ 同步复制进每个插件目录
```

---

## 提交到官方市场（Submitting to the official marketplaces）

本仓库已备齐两边的市场清单与插件清单：

- Claude Code 市场清单：`.claude-plugin/marketplace.json`（plugin source 指向 `./plugins/claude-code`）
- Claude Code 插件清单：`plugins/claude-code/.claude-plugin/plugin.json`
- Codex 市场清单：`.agents/plugins/marketplace.json`（plugin source 指向 `./plugins/codex`）
- Codex 插件清单：`plugins/codex/.codex-plugin/plugin.json`

通过 `/plugin marketplace add Myzmzz/system-knowledge-plugin` 即可让任意用户从本仓库直接安装。

> **官方目录上架是手动的网页步骤**：把插件提交到 Claude Code / Codex 的**官方目录**（official directory），需要由仓库维护者本人在对应平台的网页上完成提交（填写分类、图标、隐私说明等材料）。本仓库已准备好上架所需的全部材料；最终"上架提交"动作不在本仓库的自动化范围内。

---

## License

[MIT](./LICENSE) © 2026 Myzmzz
