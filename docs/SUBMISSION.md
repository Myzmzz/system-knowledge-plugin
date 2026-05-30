# 市场上架材料与流程（Submission packet）

更新：2026-05-30 · 仓库：https://github.com/Myzmzz/system-knowledge-plugin · 版本 v0.1.0

## 渠道与状态一览

| 渠道 | 是否开放自助上架 | 机制 | 谁能做 |
|---|---|---|---|
| **任意用户 `/plugin marketplace add`**（Claude Code & Codex） | ✅ 已完成 | 指向本公开仓库即可安装 | 已验证可用 |
| **Claude 社区市场** `anthropics/claude-plugins-community` | ✅ 开放 | **网页表单**提交 + 自动校验/安全审查 | 需 Myzmzz 本人登录 claude.ai 提交 |
| **Claude 官方目录** `claude-plugins-official` | ❌ 无申请流程 | Anthropic 自行甄选 | 任何人都无法主动提交 |
| **Codex 社区登记** `awesome-codex-plugins` | ✅ 开放 | **Fork + PR** 改 README | 可由 Myzmzz 开 PR |
| **Codex 官方目录** `openai-curated` | ❌ 尚未开放（"coming soon"） | 暂无 | 暂不可提交 |

> 结论：原始目标"发布到 Claude 和 Codex 的市场"已达成（仓库即两端市场，均验证可安装）。下面是把它进一步登记进**社区目录**的材料。官方目录两边都不接受主动自助提交。

## 通用元数据（任何表单/登记都用这套）

- 插件名 / Plugin name：`system-knowledge-plugin`
- 安装 ID：`system-knowledge-plugin@system-knowledge`
- 仓库 / Repository：`https://github.com/Myzmzz/system-knowledge-plugin`
- 作者 / Author：Myzmzz
- 许可 / License：MIT
- 分类 / Category：Code Quality（备选：Developer Tools）
- 简介（EN）：System knowledge graph infrastructure for agent-collaborative development: query feature dependencies, analyze change impact, and generate business-chain test paths.
- 简介（中）：面向智能体协作开发的系统知识基础设施——查询功能依赖、分析变更影响、生成业务链路测试路径。
- 安装后包含：3 个 Skill（system-knowledge-map / feature-closure-development / business-chain-testing）+ 1 个 MCP server（system-knowledge，12 个工具）
- 关键词 / tags：knowledge-graph, dependency-analysis, impact-analysis, test-planning, mcp, agent-collaboration

## A. Claude 社区市场（网页表单）

1. 本机预校验（审查流水线会跑同一条）：`claude plugin validate ./plugins/claude-code --strict` —— ✅ 已通过。
2. 打开 https://claude.ai/settings/plugins/submit （或 https://platform.claude.com/plugins/submit），用 Myzmzz 账号登录。
3. 填入上面的「通用元数据」（仓库 URL + 名称 + 描述 + 分类）。
4. 提交后进入自动校验 + 安全审查；通过后会被 pin 到社区 catalog 的某个 commit SHA，目录每晚同步。
5. 验证是否上架：在 https://github.com/anthropics/claude-plugins-community/blob/main/.claude-plugin/marketplace.json 搜索 `system-knowledge-plugin`。

> 该表单需要登录态，不能用 CLI/API 提交。可由我用浏览器（Claude in Chrome）在你已登录的会话里代填、由你点最终"提交"，或你自行提交。

## B. Codex 社区登记 awesome-codex-plugins（GitHub PR）

- 流程：fork `hashgraph-online/awesome-codex-plugins` → 在 README 对应分类加一行 → 提交 PR。
- 建议归类：Development & Workflow（或 Tools & Integrations）。
- 登记条目（README 行）：

  ```markdown
  - [system-knowledge-plugin](https://github.com/Myzmzz/system-knowledge-plugin) - 系统知识图基础设施：查询功能依赖、分析变更影响、生成业务链路测试路径（12 个 MCP 工具 + 3 个 Skill）。
  ```
- 可选预校验：`pipx run plugin-scanner lint plugins/codex` / `verify plugins/codex`。
- 这是公开 PR，会以 Myzmzz 身份出现在第三方仓库。

## C.（可选）awesome-ai-plugins

`hashgraph-online/awesome-ai-plugins`（含 Claude Code + Codex 的更大列表），同样 fork + PR，条目格式与 B 类似。
