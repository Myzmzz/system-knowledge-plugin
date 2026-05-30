# System Knowledge Plugin — 双形态（Claude Code + Codex）设计规格

更新时间：2026-05-30
状态：已批准（关键决策经用户确认）

## 0. 关系说明

本规格是 `plunginintro.md`（系统知识图插件的完整功能设计文档）的**交付增量规格**。
`plunginintro.md` 定义了「做什么」（功能/工具/知识结构/校验规则）；本文件定义「如何打成两个插件、放进一个仓库、发布到两个市场」。两者一起读。

## 1. 目标与范围

构建系统知识图插件，覆盖 `plunginintro.md` 的**全部 4 个阶段**：

- 阶段1：YAML 知识库 + 只读 MCP 工具 + `validate-knowledge` + 依赖 Mermaid 图 + 3 个 Skill
- 阶段2：写入型 MCP 工具（`*.upsert`，草稿/正式两态 + 变更记录）
- 阶段3：`audit-diff`（git diff → 知识图更新提示 + 回归建议）
- 阶段4：可视化（Mermaid + HTML 导出），团队协作导出

交付形态：

- **Claude Code 插件**（`.claude-plugin/plugin.json`）
- **Codex 插件**（`.codex-plugin/plugin.json`）
- 二者共享同一套核心（MCP server + 知识库模板 + skills），存放于**一个公开 GitHub 仓库** `Myzmzz/system-knowledge-plugin`
- 同一仓库同时充当两个市场清单源

## 2. 关键决策（已确认）

| 决策 | 选择 |
|---|---|
| 构建范围 | 完整设计，全 4 阶段 |
| 仓库结构 | 单仓库 + 共享核心 + 两层薄打包清单 + 双市场 |
| 知识库内容 | 通用模板（空 schema + 极简种子）+ `examples/deploy-system/` 部署示例 |
| 仓库可见性 | 公开（public），owner = Myzmzz |
| 写入工具行为 | 默认写 `knowledge/.drafts/`，需 `confirm:true` 才写正式文件 |
| 官方目录提交 | 备齐全部材料，最终"上架提交"由用户本人在网页操作 |

## 3. 技术选型

遵循 `plunginintro.md` 第 12 节：

- 语言：**TypeScript**
- MCP：`@modelcontextprotocol/sdk`（stdio 传输）
- 输入校验：`zod`
- YAML：`yaml`
- 打包：`esbuild` 将 MCP server 打成单文件，分别 bundle 进两个插件目录（插件自包含，安装后不依赖仓库外路径）
- 测试：`vitest`（TS 原生；本项目为 TS，故偏离全局 CLAUDE.md 的 Python/pytest 默认，已说明）
- 图：阶段1 Mermaid 字符串；阶段4 HTML（内嵌 mermaid.js CDN）
- CI：GitHub Actions = `type-check + vitest + knowledge validate`

## 4. 仓库结构

```text
system-knowledge-plugin/
├── README.md  LICENSE(MIT)  package.json  tsconfig.json  .gitignore
├── plunginintro.md                       # 原始功能设计文档（保留）
├── docs/superpowers/specs/               # 本规格
├── core/                                 # ★ 共享核心（唯一真源）
│   ├── mcp-server/
│   │   ├── src/
│   │   │   ├── index.ts                  # MCP server 入口（stdio）
│   │   │   ├── knowledge/                # schema(zod) + loader + writer + validate
│   │   │   ├── tools/                    # 全部 MCP 工具
│   │   │   └── lib/                      # 依赖图/影响面/测试路径/mermaid/diff 算法
│   │   ├── package.json  tsconfig.json
│   │   └── test/                         # vitest
│   ├── cli/                              # knowledge CLI（5 脚本）
│   └── skills/                           # 3 个 SKILL.md（两形态共用）
├── knowledge/                            # ★ 通用模板（空 schema + 极简种子）
│   ├── features.yaml dependencies.yaml entities.yaml
│   ├── states.yaml journeys.yaml test-paths.yaml
├── examples/deploy-system/knowledge/     # ★ 部署系统完整示例
├── plugins/
│   ├── claude-code/
│   │   ├── .claude-plugin/plugin.json
│   │   ├── .mcp.json
│   │   ├── mcp/index.js                  # 构建产物（bundle）
│   │   └── skills/                       # 构建期从 core/skills 同步
│   └── codex/
│       ├── .codex-plugin/plugin.json
│       ├── .mcp.json   (.app.json 可选)
│       ├── mcp/index.js
│       └── skills/
├── scripts/build.mjs                     # 构建 + 分发（bundle 进两个插件、同步 skills）
├── .github/workflows/ci.yml
├── .claude-plugin/marketplace.json       # Claude Code 市场清单
└── .agents/plugins/marketplace.json      # Codex 市场清单
```

## 5. 共享核心与数据契约

唯一真源是 `core/`。两个 `plugin.json` 只在元数据字段不同：

- Claude Code：`name`/`version`/`description`/`author` + `skills`/`mcpServers`/`commands` 引用
- Codex：额外 `displayName`/`shortDescription`/`category`/`capabilities`/`websiteURL`/`license`

**数据契约**（`core/mcp-server/src/knowledge/schema.ts`，zod）覆盖 `plunginintro.md` 第 5 节全部 YAML 结构：`Feature`、`Dependency`、`Entity`、`StateMachine`、`Journey`、`TestPath`。所有工具与 CLI 共用此 schema 与 loader——它是并行开发的接口边界。

## 6. MCP 工具（全量）

按 `plunginintro.md` 第 6 节：

- 只读：`feature.get` `feature.list` `dependency.trace` `impact.analyze` `journey.get` `test_path.generate`
- 写入（草稿/正式两态）：`feature.upsert` `dependency.upsert` `journey.upsert` `test_path.upsert`
- 审计：`knowledge.validate` `change.audit`

工具命名按 MCP 约定用下划线（`feature_get` 等），对外文档保留点号别名说明。

## 7. CLI 脚本（按第 7 节）

`scan-code`、`validate-knowledge`、`generate-graph`、`analyze-impact`、`audit-diff`。统一入口 `knowledge <cmd>`。

## 8. Skills（按第 8 节）

`system-knowledge-map`、`feature-closure-development`、`business-chain-testing`。每个为 `SKILL.md`（`name`+`description` frontmatter），两形态共用。

## 9. 校验规则

实现 `plunginintro.md` 第 10 节全部基础规则与质量规则，由 `knowledge.validate` 工具与 `validate-knowledge` CLI 共用同一实现。

## 10. 安全边界（按第 13 节）

- 知识库不存任何敏感凭证明文；扫描脚本不读用户私有凭证目录
- MCP 工具默认只操作插件知识库
- 写入工具区分草稿（`knowledge/.drafts/`）与正式（需 `confirm:true`）
- 影响分析只给建议，不替用户做业务判断
- 外部系统真实状态不由知识图伪造

## 11. 发布流程

1. `git init` + 首次提交
2. `gh repo create Myzmzz/system-knowledge-plugin --public` + push
3. 打 tag `v0.1.0` + GitHub Release
4. 验证两市场：`/plugin marketplace add Myzmzz/system-knowledge-plugin`（Claude Code & Codex 同命令）
5. 备齐官方目录提交材料（README、icon、分类、隐私说明等）；最终上架提交由用户本人操作

## 12. 执行（多 agent 协作）

1. Lead 建立基础：仓库脚手架 + 根 `package.json`(含全部依赖) + `tsconfig` + 数据契约 `schema.ts` + loader/writer。
2. 并行 agent（目录互不写冲突）：
   - Agent-Tools：`core/mcp-server/src/tools/` + `index.ts` 接线 + vitest
   - Agent-CLI：`core/cli/` 5 脚本 + vitest
   - Agent-Skills：`core/skills/` 3 个 SKILL.md
   - Agent-Knowledge：`knowledge/` 模板 + `examples/deploy-system/`
   - Agent-Packaging：两 `plugin.json` + 双 marketplace + `.mcp.json` + `build.mjs` + CI + README + LICENSE
3. Lead 集成：构建、跑测试、`knowledge validate`、修复。
4. Lead 发布：git/gh/release/市场验证/提交材料。

## 13. 验收

- `npm run build` 成功，两个 `plugins/*/mcp/index.js` 生成
- `npm test` 全绿（核心 lib + 工具 + CLI 有测试覆盖）
- `knowledge validate`（对 examples/deploy-system）通过
- 两个 `plugin.json` 与两个 `marketplace.json` 结构合法
- GitHub 公开仓库存在、CI 绿、有 `v0.1.0` release
- README 含两边安装命令与官方目录提交说明
