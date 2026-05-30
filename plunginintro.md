# 系统知识图插件设计文档

更新时间：2026-05-30

## 1. 背景与问题

在本次部署与资源管理平台开发过程中，反复出现了同一类问题：

- 单个按钮或页面功能完成后，又暴露出上下游数据、状态、入口门禁、真实环境校验、测试顺序等问题；
- 功能开发依赖人工记忆，缺少统一的功能依赖图；
- 测试经常从一个按钮动作开始，而不是从完整业务链路开始；
- 修改某个功能后，不容易判断需要回归哪些页面、接口、状态和测试路径；
- 系统知识散落在代码、对话、文档和测试结果中，没有形成可查询、可维护的结构化资产。

因此，需要设计一个“系统知识图插件”，用于长期维护系统级知识，并在开发和测试时为智能体提供可查询、可更新、可校验的能力。

本插件不是业务系统本身，也不是普通文档集合，而是面向智能体协作开发的系统知识基础设施。

## 2. 插件定位

### 2.1 一句话定义

系统知识图插件用于维护系统的功能节点、依赖关系、数据实体、状态流转、业务链路和测试路径，并通过 MCP Tools、脚本和 Skill 支持开发前分析、测试路径生成、变更影响分析和知识图校验。

### 2.2 要解决的问题

| 问题 | 插件能力 |
|---|---|
| 不知道当前功能依赖哪些功能 | 查询功能上游依赖 |
| 不知道当前功能被哪些功能使用 | 查询功能下游影响 |
| 不知道修改后要回归哪些链路 | 生成影响面和回归范围 |
| 不知道功能入口何时可用 | 查询状态机和操作门禁 |
| 不知道测试应该按什么顺序执行 | 生成业务链路测试路径 |
| 知识图容易写错、漏写、失效 | 脚本校验和 CI 检查 |
| 代码变化后知识图未同步 | diff 审计和变更提示 |

### 2.3 不做什么

第一阶段不做以下内容：

- 不做完整图数据库；
- 不做大型可视化平台；
- 不替代项目管理系统；
- 不自动决定业务真相；
- 不从代码中强行推断全部业务依赖；
- 不保存 Token、Key、密码、kubeconfig 等敏感信息。

## 3. 总体架构

```text
system-knowledge-plugin
├── skills/
│   ├── system-knowledge-map
│   ├── feature-closure-development
│   └── business-chain-testing
├── mcp-server/
│   ├── feature tools
│   ├── dependency tools
│   ├── impact tools
│   ├── journey tools
│   └── test-path tools
├── knowledge/
│   ├── features.yaml
│   ├── dependencies.yaml
│   ├── entities.yaml
│   ├── states.yaml
│   ├── journeys.yaml
│   └── test-paths.yaml
├── scripts/
│   ├── scan-code
│   ├── validate-knowledge
│   ├── generate-graph
│   ├── analyze-impact
│   └── audit-diff
└── reports/
    ├── dependency-graph.md
    ├── impact-report.md
    └── test-plan.md
```

### 3.1 三层分工

| 层级 | 作用 | 典型内容 |
|---|---|---|
| Skill | 告诉智能体如何思考和推进 | 开发闭环方法、测试链路方法、知识图维护原则 |
| MCP Tools | 让智能体结构化查询和维护知识图 | 查询功能、追踪依赖、分析影响、生成测试路径 |
| Scripts | 保证知识图可重复、可校验、可生成 | 扫描代码、校验 YAML、生成 Mermaid、CI 检查 |

## 4. 核心设计原则

### 4.1 功能必须放在系统环境中理解

任何功能节点都必须记录：

- 它依赖什么；
- 它产出什么；
- 谁使用它的产出；
- 它受哪些状态限制；
- 它应该如何测试；
- 它变化后需要回归哪些链路。

### 4.2 智能体负责语义，脚本负责确定性

| 工作 | 智能体 | 脚本 |
|---|---|---|
| 理解业务目标 | 主责 | 辅助 |
| 识别代码文件 | 辅助 | 主责 |
| 补充依赖原因 | 主责 | 不负责 |
| 校验 featureId 是否存在 | 不负责 | 主责 |
| 生成 Mermaid 图 | 辅助 | 主责 |
| 生成测试路径说明 | 主责 | 提供结构约束 |
| CI 校验 | 不负责 | 主责 |

### 4.3 知识图先轻量，后增强

第一版使用 YAML 文件存储知识，不直接引入数据库。原因：

- 易读；
- 易审查；
- 易跟随代码提交；
- 易做 diff；
- 易被 MCP Tools 和脚本读取。

后续如果知识量增大，再考虑 SQLite 或图数据库。

## 5. 知识库结构

### 5.1 目录结构

```text
knowledge/
├── features.yaml
├── dependencies.yaml
├── entities.yaml
├── states.yaml
├── journeys.yaml
└── test-paths.yaml
```

### 5.2 features.yaml

记录系统功能节点。

```yaml
features:
  deploy-config:
    name: 部署配置
    module: 部署流程
    description: 配置部署任务、服务参数、依赖组件和 Helm values。
    maturity: prototype
    owner_role: 运维
    entry_points:
      - page: 部署配置
        route: task
    code_refs:
      - 部署系统/prototype/Page1Deploy.jsx
      - 部署系统/prototype/app.jsx
    depends_on:
      - cluster-management
      - application-management
      - deploy-assets
    provides:
      - deploy-task-config
      - helm-values
      - service-overrides
      - middleware-modes
    used_by:
      - preflight
      - execution-verify
      - deploy-report
    states:
      - draft
      - configured
      - changed
```

建议字段：

| 字段 | 说明 |
|---|---|
| `name` | 功能中文名 |
| `module` | 所属模块 |
| `description` | 功能定位 |
| `maturity` | `idea`、`prototype`、`usable`、`production` |
| `owner_role` | 主要业务角色 |
| `entry_points` | 页面入口、路由、菜单 |
| `code_refs` | 相关代码路径 |
| `depends_on` | 上游依赖功能 |
| `provides` | 产出数据或状态 |
| `used_by` | 下游消费方 |
| `states` | 相关状态 |

### 5.3 dependencies.yaml

记录功能之间的边关系和原因。

```yaml
dependencies:
  - from: deploy-assets
    to: deploy-config
    type: data
    reason: 部署配置中的服务模块、依赖组件和 values 来源于资产解析结果。

  - from: preflight
    to: execution-verify
    type: gate
    reason: 预检通过或风险已确认后才允许进入部署执行。
```

建议字段：

| 字段 | 说明 |
|---|---|
| `from` | 上游功能 |
| `to` | 下游功能 |
| `type` | `data`、`state`、`gate`、`ui`、`external` |
| `reason` | 依赖原因 |

### 5.4 entities.yaml

记录系统核心实体和字段。

```yaml
entities:
  DeployTask:
    description: 一次应用部署任务。
    fields:
      id:
        type: string
        required: true
      appId:
        type: string
        required: true
        ref: DeployApplication.id
      clusterId:
        type: string
        required: true
        ref: Cluster.id
      namespace:
        type: string
        required: true
      releaseName:
        type: string
        required: true
      status:
        type: enum
        required: true
        values:
          - draft
          - configured
          - precheck_passed
          - running
          - verified
          - failed
          - uninstalling
          - uninstalled
    used_by:
      - dashboard
      - deploy-config
      - preflight
      - execution-verify
      - resource-management
```

### 5.5 states.yaml

记录状态机和操作门禁。

```yaml
state_machines:
  DeployTask:
    states:
      draft:
        label: 任务草稿
        allowed_actions:
          - edit-config
          - upload-assets
        disabled_actions:
          - run-preflight
          - deploy
          - uninstall
        visible_pages:
          - dashboard
          - cluster-management
          - application-management
          - deploy-assets

      precheck_passed:
        label: 预检通过
        allowed_actions:
          - deploy
          - edit-config
        disabled_actions:
          - uninstall
        visible_pages:
          - preflight
          - execution-verify
```

### 5.6 journeys.yaml

记录端到端业务链路。

```yaml
journeys:
  full-deploy:
    name: 完整部署链路
    start: no-system
    end: deployed-and-verified
    steps:
      - cluster-management
      - application-management
      - deploy-assets
      - deploy-config
      - preflight
      - execution-verify
      - resource-management
    failure_recovery:
      preflight:
        - fix-config
        - re-run-preflight
      execution-verify:
        - view-log
        - retry
        - rollback
        - uninstall
    acceptance:
      - Helm Release 状态为 deployed
      - Deployment Ready
      - Pod Running
      - 资源管理可同步
```

### 5.7 test-paths.yaml

记录业务链路测试路径。

```yaml
test_paths:
  deploy-e2e:
    name: 部署功能端到端测试
    target_feature: execution-verify
    journey: full-deploy
    preconditions:
      - cluster-management.cluster-connected
      - application-management.application-selected
      - deploy-assets.assets-parsed
      - deploy-config.configured
      - preflight.precheck-passed
    steps:
      - 保存部署配置
      - 执行预检
      - 点击部署
      - 查看实时日志
      - 同步资源
    assertions:
      - Helm Release 为 deployed
      - Deployment Ready
      - Pod Running
      - Service 已创建
      - 报告可导出
    regression_scope:
      - dashboard
      - deploy-config
      - preflight
      - resource-management
      - uninstall
```

## 6. MCP Tools 设计

MCP Tools 是给智能体调用的结构化工具。它们不直接替代业务系统 API，而是操作系统知识库。

### 6.1 Tool 分组

| 分组 | 工具 | 作用 |
|---|---|---|
| Feature | `feature.get` | 查询功能定义 |
| Feature | `feature.upsert` | 新增或更新功能 |
| Feature | `feature.list` | 列出功能节点 |
| Dependency | `dependency.trace` | 查询上游和下游 |
| Dependency | `dependency.upsert` | 新增或更新依赖边 |
| Impact | `impact.analyze` | 分析修改功能的影响面 |
| Journey | `journey.get` | 查询业务链路 |
| Test | `test_path.generate` | 生成测试路径 |
| Audit | `knowledge.validate` | 校验知识库 |
| Audit | `change.audit` | 根据代码变更提示知识图更新 |

### 6.2 MVP 工具

第一阶段只实现 4 个只读工具：

```text
feature.get
dependency.trace
impact.analyze
test_path.generate
```

这 4 个工具能够支撑开发前和测试前最核心的问题：

```text
这个功能是什么？
它依赖谁？
谁依赖它？
改它要回归哪些链路？
应该按什么顺序测试？
```

### 6.3 feature.get

用途：查询某个功能节点的完整定义。

输入：

```json
{
  "featureId": "deploy-config",
  "detail": "summary"
}
```

输出：

```json
{
  "featureId": "deploy-config",
  "name": "部署配置",
  "module": "部署流程",
  "dependsOn": ["cluster-management", "application-management", "deploy-assets"],
  "usedBy": ["preflight", "execution-verify", "deploy-report"],
  "provides": ["deploy-task-config", "helm-values"]
}
```

实现要点：

- 从 `features.yaml` 读取；
- 校验 `featureId` 是否存在；
- `detail=summary` 返回摘要；
- `detail=full` 返回完整字段；
- 找不到时返回相近功能 ID 建议。

### 6.4 dependency.trace

用途：查询某功能的直接依赖、下游依赖和可选的多级依赖。

输入：

```json
{
  "featureId": "deploy-config",
  "depth": 1,
  "direction": "both"
}
```

输出：

```json
{
  "featureId": "deploy-config",
  "upstream": [
    {
      "featureId": "deploy-assets",
      "name": "部署资产",
      "reason": "服务模块和 values 来源于资产解析结果"
    }
  ],
  "downstream": [
    {
      "featureId": "preflight",
      "name": "部署预检",
      "reason": "预检依赖部署参数和 values"
    }
  ]
}
```

实现要点：

- 同时读取 `features.yaml` 和 `dependencies.yaml`；
- 支持 `upstream`、`downstream`、`both`；
- 支持 `depth`；
- 默认不返回过长链路，避免上下文膨胀。

### 6.5 impact.analyze

用途：分析修改某个功能后的影响面。

输入：

```json
{
  "featureId": "application-management",
  "changeType": "modify",
  "changedFiles": [
    "部署系统/prototype/Page1Deploy.jsx"
  ]
}
```

输出：

```json
{
  "featureId": "application-management",
  "directImpact": [
    "deploy-assets",
    "deploy-config",
    "resource-management",
    "uninstall"
  ],
  "affectedEntities": [
    "DeployApplication",
    "DeployTask"
  ],
  "regressionTests": [
    "deploy-e2e",
    "application-switching",
    "asset-upload-and-parse"
  ],
  "knowledgeUpdateSuggestions": [
    "检查 features.yaml 中 application-management 的 used_by 是否需要更新",
    "检查 test-paths.yaml 是否覆盖多应用切换"
  ]
}
```

实现要点：

- 从功能依赖图查下游；
- 从实体关系查受影响实体；
- 从测试路径查 `regression_scope`；
- 从 `code_refs` 映射 changedFiles 到功能；
- 输出建议，不直接替用户做业务判断。

### 6.6 test_path.generate

用途：根据目标功能生成测试路径。

输入：

```json
{
  "featureId": "execution-verify",
  "scope": "e2e"
}
```

输出：

```json
{
  "featureId": "execution-verify",
  "testPath": "deploy-e2e",
  "preconditions": [
    "集群已接入",
    "应用已选择",
    "部署资产已解析",
    "部署配置已保存",
    "预检通过"
  ],
  "steps": [
    "点击部署",
    "查看日志",
    "等待 Helm upgrade/install 完成",
    "同步资源"
  ],
  "assertions": [
    "Helm Release 为 deployed",
    "Deployment Ready",
    "Pod Running"
  ]
}
```

实现要点：

- 优先读取 `test-paths.yaml` 中已有测试路径；
- 如果没有精确路径，则基于 `journeys.yaml` 和依赖图生成草案；
- 返回结果要区分“已登记测试路径”和“推导测试路径”。

## 7. 脚本设计

脚本用于保证知识图可重复、可校验、可生成。

### 7.1 scan-code

用途：扫描代码结构，生成或更新功能草稿。

输入：

```bash
knowledge scan-code --root .
```

输出：

```text
reports/scan-result.json
reports/feature-draft.yaml
```

扫描内容：

- 页面文件；
- 路由配置；
- API 文件；
- 组件命名；
- 状态字段；
- 测试文件；
- 文档标题。

注意：扫描结果只能作为草稿，不能直接作为最终业务图谱。

### 7.2 validate-knowledge

用途：校验知识库结构和引用。

检查项：

- YAML 是否能解析；
- `featureId` 是否唯一；
- `depends_on` 和 `used_by` 引用是否存在；
- `dependencies.yaml` 的边是否引用已存在功能；
- `test-paths.yaml` 的目标功能是否存在；
- 状态机是否存在不可达状态；
- 是否存在孤立核心功能；
- 是否存在未解释原因的依赖边。

命令：

```bash
knowledge validate
```

### 7.3 generate-graph

用途：生成 Mermaid 图和 Markdown 报告。

命令：

```bash
knowledge graph --type dependency
knowledge graph --type state-machine --entity DeployTask
knowledge graph --type journey --name full-deploy
```

输出：

```text
reports/dependency-graph.md
reports/state-machine-DeployTask.md
reports/journey-full-deploy.md
```

### 7.4 analyze-impact

用途：根据功能或文件变更生成影响面。

命令：

```bash
knowledge impact --feature deploy-config
knowledge impact --changed-files 部署系统/prototype/Page1Deploy.jsx
```

输出：

```text
reports/impact-report.md
```

### 7.5 audit-diff

用途：结合 git diff 提示知识图是否需要更新。

命令：

```bash
knowledge audit-diff
```

检查逻辑：

- 文件变化是否命中某个 feature 的 `code_refs`；
- 如果新增页面但 `features.yaml` 未登记，提示补充；
- 如果新增状态字段但 `states.yaml` 未登记，提示补充；
- 如果新增测试但 `test-paths.yaml` 未登记，提示补充；
- 如果改动 MCP/API 层但没有更新实体或功能依赖，提示人工确认。

## 8. Skill 设计

插件内置 3 个 Skill。

### 8.1 system-knowledge-map

用途：指导智能体如何查询、维护和更新系统知识图。

触发场景：

- 用户要求分析功能依赖；
- 用户要求设计新功能；
- 用户要求评估改动影响；
- 用户要求维护系统知识库。

### 8.2 feature-closure-development

用途：指导开发前做功能闭环分析。

核心问题：

```text
这个功能依赖什么？
它产出什么？
谁使用它？
失败后怎么恢复？
状态如何变化？
需要回归什么？
```

### 8.3 business-chain-testing

用途：指导测试时按业务链路组织。

核心分层：

```text
前置条件测试
主链路测试
后置验收测试
异常恢复测试
上下游回归测试
```

## 9. 工作流设计

### 9.1 生成初始图谱

```text
脚本扫描代码
→ 生成功能草稿
→ 智能体补充业务语义
→ 人工确认核心依赖
→ 写入 knowledge/
→ 脚本校验
→ 生成 Mermaid 图
```

### 9.2 开发前

```text
用户提出功能需求
→ 智能体调用 feature.get
→ 调用 dependency.trace
→ 调用 impact.analyze
→ 输出功能闭环分析
→ 再进入开发
```

### 9.3 开发中

```text
修改代码
→ 如新增功能、状态、实体、测试路径，同步更新 knowledge/
→ 运行 validate-knowledge
→ 根据结果修正
```

### 9.4 测试前

```text
调用 test_path.generate
→ 得到前置条件、步骤、验收项
→ 执行浏览器/API/命令测试
→ 对照验收项记录结果
```

### 9.5 开发后

```text
运行 audit-diff
→ 生成影响报告
→ 运行相关回归测试
→ 更新知识图和测试路径
```

## 10. 校验规则

### 10.1 基础规则

- 所有功能必须有唯一 `featureId`；
- 所有依赖边必须引用已存在功能；
- 所有核心功能必须至少有一个测试路径；
- 所有业务链路必须有起点、终点和验收条件；
- 所有状态机必须定义 allowed actions 和 disabled actions；
- 所有外部系统状态必须标注来源，例如 Kubernetes、Helm、数据库、第三方 API。

### 10.2 质量规则

- 核心功能不能没有下游说明；
- 危险操作必须有前置条件和失败恢复；
- 部署、删除、卸载、权限、凭证类功能必须有异常场景；
- 测试路径不能只包含按钮动作，必须包含前置条件和后置验收；
- 代码新增页面时，知识图中应有对应功能节点或明确标注为内部组件。

## 11. 实现阶段

### 11.1 阶段 1：知识库和只读查询 MVP

目标：让智能体能查询功能依赖和测试路径。

范围：

- 建立 `knowledge/` YAML；
- 实现 `feature.get`；
- 实现 `dependency.trace`；
- 实现 `impact.analyze`；
- 实现 `test_path.generate`；
- 实现 `validate-knowledge`；
- 生成依赖 Mermaid 图。

### 11.2 阶段 2：可维护知识图

目标：支持通过工具更新知识图。

范围：

- 实现 `feature.upsert`；
- 实现 `dependency.upsert`；
- 实现 `journey.upsert`；
- 实现 `test_path.upsert`；
- 增加变更记录；
- 增加人工确认机制。

### 11.3 阶段 3：代码变更审计

目标：结合代码 diff 做影响分析。

范围：

- 实现 `audit-diff`；
- 根据 changed files 映射 feature；
- 输出知识图更新建议；
- 输出回归测试建议；
- 可接入 PR 流程。

### 11.4 阶段 4：可视化和团队协作

目标：让团队可以直观看到系统知识图。

范围：

- 生成依赖图；
- 生成状态图；
- 生成业务链路图；
- 支持导出 Markdown / HTML；
- 后续可接入项目文档站。

## 12. 技术选型建议

### 12.1 MCP Server

建议使用 TypeScript 实现。

原因：

- 插件生态和前端项目更容易共享类型；
- Zod 适合定义工具输入 schema；
- 对 YAML、文件系统、git diff 处理成熟；
- 和 Codex 插件目录结构更容易集成。

### 12.2 YAML 解析

建议使用：

```text
yaml
zod
```

### 12.3 图生成

第一阶段只生成 Mermaid。

后续可扩展：

- DOT / Graphviz；
- JSON Graph；
- HTML 可视化。

## 13. 安全与边界

- 知识库不存储任何敏感凭证明文；
- 代码扫描脚本不能读取用户私有凭证目录；
- MCP Tools 默认只操作插件知识库；
- 写入型工具需要明确区分草稿写入和正式写入；
- 自动影响分析只能给建议，不能替代人工业务确认；
- 真实外部系统状态必须由对应系统查询，不应由知识图伪造。

## 14. 初始图谱建议

第一批建议登记以下功能节点：

```text
dashboard
cluster-management
application-management
deploy-assets
deploy-config
preflight
execution-verify
resource-management
uninstall
deploy-report
```

第一批建议登记以下测试路径：

```text
full-deploy
partial-service-update
preflight-blocked
uninstall-flow
application-switching
asset-upload-and-parse
resource-sync-and-detail
```

## 15. 后续待确认问题

| 问题 | 建议 |
|---|---|
| 插件是否只服务当前项目，还是跨项目复用 | 设计为跨项目通用，知识库放在项目内 |
| 知识图是否进入代码仓库 | 建议进入仓库，和代码一起 review |
| 写入工具是否允许智能体直接更新 | 初期允许写草稿，正式更新前需要人工确认 |
| 是否接入 CI | 建议至少接入 `validate-knowledge` |
| 是否支持多系统、多仓库 | 第二阶段再扩展 |

## 16. 总结

这个插件的核心价值不是“再写一份文档”，而是把系统知识变成可查询、可维护、可校验的结构化资产。

开发时，它回答：

```text
我要改的功能在系统里处于什么位置？
```

测试时，它回答：

```text
这个功能应该按什么业务顺序验证？
```

评审时，它回答：

```text
这次改动影响了哪些上下游，是否更新了知识图和测试路径？
```

第一版应保持轻量：YAML 知识库、4 个只读 MCP Tools、3 个基础脚本。等团队确认方法有效后，再扩展写入、审计和可视化能力。
