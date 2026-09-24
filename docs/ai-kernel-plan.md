# AI 内核（Kernel AI）规划 v2 —— 插件能力聚合器

> **修订说明**：v1 把「工作台工具」当成内核自带的能力。这个前提是错的。
> 正确的模型（本版）：**内核 agent 独立于任何插件**（plugin-main 也是插件），它的能力 = 已安装插件声明能力的聚合。
> 装一个插件，agent 就多一份能力；卸掉，能力就消失。
> 对标 Notion 工作台首页。本文只做规划与设计。决策记录：2026-09。

---

## 0. 核心模型

```
        ┌────────────────────────────────────────────┐
        │   Kernel Agent Runtime（不认识任何具体插件） │
        └────────────────────┬───────────────────────┘
                             │ 读取
        ┌────────────────────▼───────────────────────┐
        │   Capability Registry（能力注册表）          │
        │   tools | skills | context | actions | agents│
        └────────────────────▲───────────────────────┘
                             │ 聚合声明
   ┌──────────┬──────────────┼──────────────┬──────────────┐
 plugin-main  plugin-office  plugin-bitable  plugin-studio  …（含第三方）
 工作台能力    表格能力       多维表能力      插件开发能力
```

一句话：**内核不是「拥有能力」，而是「聚合能力」。**

推论（这条决定了整个设计）：
- 内核**不能**把 `searchPages` / `createPage` 这类工作台工具写死在自己身上——它们应该由 **plugin-main** 声明；
- 内核**不能**假设存在编辑器——editor 只是 `page` scope 下的一种可选上下文；
- 安装 / 卸载插件必须让注册表**热更新**，且正在跑的 run 要有一致的工具快照。

---

## 1. 现状审计：能力贡献点只有一个，而且是编辑器绑定的

### 1.1 事实

| 事实 | 证据 |
|---|---|
| `PluginConfig` 顶层有 routes / menus / editorExtension / services / dockPanels / pageTypes … | `packages/common/src/core/PluginManager.ts:52` |
| **没有**顶层 `agent` / `tools` / `skills` 字段 | 同上 |
| agent 能力只能挂在 `editorExtension[].tools / .skills` | `PluginManager.ts:938` `resolveTools(editor)`、`1210` `resolveSkills()` |
| 工具类型被强制绑定 editor | `packages/common/src/core/editor.ts:32-38`：`execute: (editor: Editor) => (params) => any` |
| plugin-studio 已被迫绕过这个限制 | `packages/plugin-plugin-studio/src/index.tsx:50-58` |

### 1.2 铁证：plugin-studio 的注释

> Agent surface. `editorExtension` is the only contribution point a plugin has for agent tools and skills (PluginManager.resolveTools/resolveSkills), and both are **editor-independent** — they drive the studio's desktop capabilities, not the document.
> —— `plugin-plugin-studio/src/index.tsx:50-53`

它只能写一个假扩展来挂载与文档无关的工具：

```ts
editorExtension: [{
  extendsion: [],                                   // ← 假扩展，为了过契约
  name: 'plugin-studio-tools',
  tools: studioTools.map(([name, tool]) => ({
    ...
    execute: () => tool.execute,                     // ← 丢弃 editor 参数
  })),
}]
```

**这不是特例，而是当前唯一可用的路径。** 任何「与编辑器无关」的插件能力（插件管理、日历、集成、后台任务）都只能重复这个 hack。它同时说明：contract 里 `editorExtension` 承担了两个不该混在一起的职责——「Tiptap 扩展」与「agent 能力贡献」。

### 1.3 另一个事实：plugin-main 贡献了 0 个 agent 能力

`plugin-main/src/index.tsx` 声明了 `routes` / `menus` / `dockPanels`，**没有 `editorExtension`、没有 tools/skills**。
它以纯 UI 插件存在，所以今天「装 plugin-main → agent 获得工作台能力」并不成立。

### 1.4 现有零件仍然有价值

- Run 运行时 / 事件溯源 / checkpoint / 断点恢复 / 记忆 / 委派：后端 `com.knowledge.agent.core.*`，协议不用动。
- 前端 SDK：`packages/common/src/ai/agent/`（client / events / run-store / tool-executor）。
- 工作台工具本体（`searchPages` `createPage` `listSpaces` `getSpacePageTree` `editPage` `openPage`…）：**已存在**于 `packages/core/src/ai/tools/page-tools.ts:108`，只是归属（core）与门禁（editor）都需要调整。
- 热更新钩子：`PluginManager.onChange(listener)`（`PluginManager.ts:281`）——安装/卸载会触发，正是注册表需要的。

---

## 2. 目标：一等公民的插件能力契约

在 `PluginConfig` 增加与 `editorExtension` **平行**的顶层字段：

```ts
interface PluginConfig {
  // …现有字段不动
  agent?: AgentContribution
}

interface AgentContribution {
  tools?: AgentToolDef[]
  skills?: SkillDef[]
  context?: ContextProviderDef[]     // 按 scope 提供 grounding
  actions?: QuickActionDef[]         // 首页/斜杠菜单的产物级动作
  agents?: AgentDefinitionDef[]      // 命名 agent（截图 Agents 区）
}

interface AgentToolDef {
  name: string
  description: string
  inputSchema: unknown
  readOnly?: boolean
  /** 何时可用：取代「是否需要 editor」的布尔 */
  scope?: 'workspace' | 'space' | 'page' | 'any'
  create: (ctx: ToolContext) => (params: any) => Promise<unknown>
}

interface ToolContext {
  scope: RunScope                 // workspace | space | page
  editor?: Editor                 // 仅 page scope 且宿主已发布 editor 时存在；page scope 之外恒为 undefined
  resolveService<K extends keyof Services>(name: K): Services[K] | undefined
  navigate(target: { pageId?: string; spaceId?: string; path?: string }): void
  signal?: AbortSignal
}
```

### 2.1 这一处改动的意义

- `execute(editor)` → `create(ctx)`：**editor 从「必需入参」降为「可选上下文」**。
  与文档无关的插件（plugin-studio、日历、集成）不再需要假 `extendsion: []`。
- `scope` 声明式表达可用范围：内核按 run 的 scope 过滤，而不是「声明了但调用时失败」。
- 插件仍可通过 `ctx.resolveService` 使用 core 服务（如 `spacePageService`），能力不缩水。
- `actions` / `context` / `agents` 让「能力」不再只有工具一种形态。

### 2.2 兼容旧插件（零改动）

- `resolveTools(editor)` 继续可用：内部改为从新注册表读取，并把 `editor` 注入 `ToolContext`；
- `editorExtension[].tools / .skills` 标记 `@deprecated`，由适配器转成 `agent.tools / agent.skills`（scope 推断为 `page`）；
- plugin-studio 那种「`execute()` 丢弃 editor」的工厂，适配后 scope 为 `any`。

### 2.3 actions / context / agents 的形状（示例）

```ts
actions: [{
  id: 'office.spreadsheet',
  label: '创建表格',
  icon: 'Table',
  scope: ['workspace', 'space'],
  prompt: '帮我创建一个用于 {{topic}} 的电子表格',
  tools: ['insertSpreadsheet', 'updateSpreadsheetData'],
}]

context: [{
  id: 'main.recent-pages',
  scope: ['workspace'],
  load: async (ctx) => ({ recentPages: await ctx.resolveService('spacePageService').pages.queryRecentPages({ pageSize: 10 }) }),
}]
```

---

## 3. Kernel 能力注册表

### 3.1 聚合

```ts
PluginManager.resolveAgentCapabilities(): {
  tools:    Array<AgentToolDef & { plugin: string; pluginKey: string; desktopOnly: boolean }>
  skills:   ...
  context:  ...
  actions:  ...
  agents:   ...
}
```

- 只收录 **ACTIVE 且已安装** 的插件；`desktopOnly` 在 Web 端过滤；
- 每个条目带 **provenance**（来源插件），UI 可展示「这个能力来自哪个插件」；
- **命名空间（已定，决策 2）**：工具一律以命名空间暴露，杜绝同名覆盖。
  - **线上名**（发给模型的 function name）：`{pluginKey}__{tool}`。**不能用冒号**——OpenAI / Anthropic 的 function name 约束是 `^[a-zA-Z0-9_-]{1,64}$`，`:` 非法，且总长必须 ≤64 字符（`pluginKey` 超长需截断 + 哈希兜底）。
  - **显示名**（UI / 日志）：`pluginName / tool`，配合 provenance 显示来源。
  - 内核维护 `wireName → (pluginKey, toolName)` 映射；`tool.requested` / `pendingTools` / `ToolCallRecord` 全程用 wireName。

### 3.2 热更新

- Kernel 订阅 `PluginManager.onChange()`（已存在）→ 重建 catalog → 已挂载的界面拿到新能力；
- **正在运行的 run 冻结工具快照**：run 创建时把当时解析出的 `tools[]` 固定下来，符合 `context-redesign.md` 的「会话内 tools[] 稳定」不变量。卸载插件不影响在跑的 run，新 run 才生效。
- **模型在 run 创建时冻结（已定，决策 4）**：run 内**不允许**切换模型。首页的「Auto」只是**创建时的选型策略**（成本 / 能力路由），选定即写进 run，中途不可变；要换模型就新建 run。复用后端已有的 run 级 `model` 字段，**不需要改协议**。

### 3.3 内核位置

Kernel provider 放 `@kn/common/src/ai/kernel/`：

- `@kn/plugin-main` → common / ui / icon / editor（**无 core**）
- `@kn/plugin-ai` → common / editor / icon / ui（**无 core**）
- 唯一共同层是 `@kn/common`（与 `useService` / `useCapabilityProviders` 的既有做法一致）。

```
kernel/
├── AgentKernelProvider.tsx   # 订阅 PluginManager.onChange + AgentClient + RunStore + session store
├── use-agent-kernel.ts       # 门面：send / stop / attach / resume / sessions
├── capability-catalog.ts     # 注册表读取 + scope 过滤 + run 级快照
├── tool-context.ts           # ToolContext 构造（editor 可选）
└── scope-context.ts          # scope → TurnContext（聚合各插件 context）
```

### 3.4 决策 1 的落地机制：core 实现、插件声明

仓库里已经有一模一样的桥。`packages/common/src/ai/tools/tool-factory-registry.ts` 是全局工具工厂注册表，注释写明：

> Decouples tool consumers (common/hooks) from tool implementations (core). Core registers its editor-specific tool factories here at startup. **Plugins use tools through common without needing to depend on core.**

现有链路（实测）：

```
core/App.tsx:289   registerCoreToolFactories()          # core 启动时注册实现
  → common/ai/tools/tool-factory-registry.ts          # 全局注册表（唯一的桥）
  → common/ai/providers/ToolProvider.ts  getToolFactories()
  → resolveTools(editor) → run 的 tools[]
```

所以「core 实现 + plugin-main 声明」**不需要新依赖、不需要迁代码**，扩展这张注册表即可：

1. 注册项从「裸 factory」升级为「带元数据的 tool def」：`{ name, description, inputSchema, scope, readOnly, create(ctx) }`；
2. core 仍在 `App.tsx` 启动时注册工作台工具实现（`searchPages` / `searchContent` / `createPage` / …），工厂签名由 `(editor) => …` 改为 `(ctx: ToolContext) => …`（editor 进 ctx，变可选）；
3. **plugin-main 在 `agent.tools` 里按名挑选并收窄 scope**，例如 `{ include: ['searchPages', 'createPage'], scope: 'workspace' }`——它只依赖 `@kn/common`，不 import core；
4. **没有 plugin-main 声明时，core 注册的实现不进入 catalog**（实现存在 ≠ 能力可用）。这正是「装 plugin-main 才获得工作台能力」的字面实现。

这条同时把决策 1 与决策 2 接上：进入 catalog 的 name 统一加 `{pluginKey}__` 前缀。

---

## 4. 能力 → 界面 → agent 的映射

| 插件声明 | 去向 | 效果 |
|---|---|---|
| `agent.tools`（scope 过滤后） | run 的 `tools[]` | agent 能调用 |
| `agent.skills` | 系统提示片段 + deferred 工具目录 | agent 知道怎么用 |
| `agent.actions` | 首页快捷动作 + 斜杠菜单 | 截图那排按钮，**装插件自动多一个** |
| `agent.context` | TurnContext（append-only，不进 system） | 截图左侧 Recent / Upcoming 的 grounding |
| `agent.agents` | Agents 区 + 可调用 agent | 截图 Agents |

### 4.1 具体举例

| 安装的插件 | agent 因此获得 |
|---|---|
| **plugin-main** | 工作台能力：`plugin-main__searchPages` / `__searchContent` / `__createPage` / `__editPage` / `__openPage` / `__listSpaces`；context：最近页面、团队空间（白名单）；action：研究、新建页面 |
| plugin-office | `plugin-office__insertSpreadsheet` / `__updateSpreadsheetData` / `__createPivotTable` / `__exportSpreadsheet`；action：表格 |
| plugin-bitable + plugin-chart | `plugin-bitable__addBitableView` 等；action：可视化 |
| plugin-plugin-studio | `plugin-studio__*` + skill（现状迁移） |
| （未来）日历插件 | context：Upcoming events（截图左侧） |
| （未来）presentation 插件 | action：幻灯片（当前唯一无对应插件的快捷动作） |

> 注意最后一行：**Create Slides 之所以缺，不是内核缺能力，而是没有插件声明它。** 这正是本模型的直接结论。

---

## 5. 首页 AI（Kernel Home）

```
[✦] 今天想让 AI 帮你做什么？                     ← 内核问候
┌──────────────────────────────────────────────┐
│  ◎  @ 引用页面 / 空间        Ask ▏Agent      │  ← 复用 ChatComposer（Ask/Agent、@提及、附件）
│  +   [Auto ▾]                            ↑   │
└──────────────────────────────────────────────┘
   研究   表格   可视化  [ + 由插件动态增加 ]     ← = registry.actions（不是写死的）
   ─────────────────────────────────
   最近页面 / Agents / 团队空间                  ← = registry.context + 现有 Home 数据
```

- 快捷动作与 grounding **全部来自注册表**：首页只负责渲染；
- 装 plugin-office 后首页自动出现「表格」，卸掉就消失——这是「能力随插件变强」的用户可见证明；
- composer 复用 `plugin-ai/src/ai/menu/chat/ChatComposer.tsx`（已有 mode / model / @提及 / 附件），scope=workspace。
- 「Auto」只在**新建 run 时**决定模型（决策 4：run 内不可切换）；run 进行中模型选择器置灰，要换模型只能新建 run。

---

## 6. 迁移路径（旧插件零改动）

| 阶段 | 内容 | 验证 |
|---|---|---|
| **M0 契约** | `PluginConfig.agent` + `ToolContext`；注册表升级为带元数据的 tool def（§3.4）；`editorExtension[].tools` 适配器 + 命名空间映射 | 单测：旧插件工具仍可用（旧名）；plugin-studio 可去掉假 extension |
| **M1 注册表** | `kernel/capability-catalog.ts` + `onChange` 热更新 + run 级快照 | 单测：装/卸插件前后 catalog 变化；在跑 run 不受影响 |
| **M2 首页** | Home hero + registry.actions + session；无编辑器可对话 | 手动：装 plugin-office → 首页多「表格」 |
| **M3 plugin-main 能力化** | 决策 1：**core 去 editor 硬依赖**（工厂改收 `ToolContext`），**plugin-main 声明** `agent.tools: { include, scope }`（不迁代码）；新增 `searchContent` | 手动：装 plugin-main → 能检索/建页；不装 → 工具不在 catalog |
| **M4 多入口统一** | Dock / 面板 / 内联 / 命令面板走 kernel；context providers 打通 | 各包 tsc + 断点恢复回归 |
| **M5 主动化** | `agent.agents` + 定时/触发 + 通知 | 端到端：定时跑一次并产出页面 |

后端若要补检索工具：`mvn -pl knowledge-service/knowledge-agent-skills -am test`
前端：`pnpm -F @kn/core check`、各包 tsc / build。

---

## 7. 风险与边界

1. **能力快照**：run 创建时冻结 `tools[]`。否则卸载插件会让在跑的 run 出现「工具不存在」，也违反前缀缓存不变量。
2. **插件越权**：插件通过 `ctx.resolveService` 能碰 core 服务。**已定（决策 3）：走白名单**——`services` 白名单 + `context providers` 白名单。`agent.context` 默认不生效（它能读用户数据），必须宿主显式授权。
3. **命名空间迁移**：命名空间化是 breaking change（模型已学到的旧工具名、历史 run 事件里的旧名）。对策：M0 适配器先保留旧名，新声明一律命名空间；历史事件按原样回放，不做重命名。
4. **权限**：工作台检索必须复用服务端 ACL（现有 `SpacePageService` 已鉴权），不能「先取后判」。
5. **上下文注入**：插件贡献的 context 一律走 TurnContext，**不进 system 前缀**。
6. **desktopOnly / 平台差异**：Web 端过滤 desktopOnly 能力，插件安装时已有 `PLUGIN_INCOMPATIBLE` 事件可复用。

---

## 8. 已定决策（2026-09）

| # | 决策 | 落地影响 |
|---|---|---|
| 1 | **工作台工具：core 实现 + plugin-main 声明** | 实现留在 core 的 `page-tools.ts`（依赖 `SpacePageService`），由 plugin-main 在 `agent.tools` 里按名挑选 + 收窄 scope。机制见 §3.4：复用既有 `tool-factory-registry`，**不迁代码、不新增依赖**。没有 plugin-main 声明 → 实现存在但能力不可用 |
| 2 | **工具命名空间** | 线上名 `{pluginKey}__{tool}`（`__` 分隔，冒号非法且需 ≤64 字符）；内核维护 wireName ↔ (plugin, tool) 映射；UI 显示 `plugin / tool` |
| 3 | **context 走白名单** | `agent.context` 默认不生效，需宿主白名单显式授权；`services` 同样白名单 |
| 4 | **run 内不允许切换模型** | model 在 run 创建时冻结；「Auto」= 创建时选型；UI 进行中禁用模型选择器。不改协议 |

### 仍待确定

- 旧 `editorExtension[].tools` 的移除时间（建议保留两个版本周期）；
- `pluginKey` 超长时的截断 / 哈希规则（function name ≤64 字符）。

---

## 9. 本期不做

- 不改后端 run / 事件协议；
- 不引入向量库（`MemoryRetriever` 已预留）；
- 不做幻灯片插件本体（等第三方或后续插件声明）；
- 不做跨标签页写串行化（沿用 `agent-redesign.md §16.3`）。

---

## 11. 实现记录（M0 已落地）

> 契约 + 注册表 + 适配器 + 首个验证案例。策略：**旧插件零改动**，新声明一律命名空间。

### 11.1 新增：`packages/common/src/ai/plugin-agent/`

| 文件 | 内容 |
|---|---|
| `types.ts` | `AgentContribution` / `AgentToolDefinition` / `AgentSkillDefinition` / `AgentContextProviderDefinition` / `AgentActionDefinition` / `AgentDefinitionDefinition` / `AgentToolContext` / `AgentScope`；`normalizeAgentScopes` / `agentScopeMatches` |
| `namespace.ts` | 线上名 `{pluginKey}__{tool}`：`sanitizeNamespaceSegment` / `toAgentWireName`（≤64 字符）/ `parseAgentWireName` / `resolveAgentToolNames` |
| `registry.ts` | core 实现注册表（`registerAgentToolImplementations` 等）—— §3.4 的桥，供 plugin-main 按名 `include` |
| `adapter.ts` | legacy `editorExtension[].tools/skills` → `AgentContribution`（`namespace: false` 保留旧名，`scope: 'any'`） |
| `index.ts` | `Resolved*` 类型 + `filterContributionByScope` |
| `plugin-agent.check.ts` | 纯逻辑运行时检查（命名空间 / scope / 适配器 / 注册表），`pnpm -F @kn/common check:plugin-agent` |

### 11.2 改动

- `PluginConfig.agent?: AgentContribution` + `KPlugin.agent` getter（`core/PluginManager.ts`）。
- `PluginManager`：
  - `resolveAgentContributions()`：按插件聚合 explicit `agent` + legacy 适配，带 provenance；
  - `resolveAgentCapabilities(scope?)`：展平 + 命名空间 + `include` 解析 + scope 过滤；
  - `resolvePluginToolGroups(editor)`：**唯一实例化路径**；`resolveTools` 改为合并各组；
  - `resolveSkills()`：新增 `agent.skills`（local→wire 解析）与未认领工具的默认技能。
- `use-capability-providers.tsx`：`collectPluginToolsByPlugin` 改走 `resolvePluginToolGroups`，工具不会「一处声明、另一处缺失」。
- **plugin-studio 迁移**：删掉 `extendsion: []` 假扩展，改为 `agent.tools` + `agent.skills`（`scope: 'any'`）。这是「与文档无关的插件不再需要 hack」的首个验证案例。

### 11.3 验证（实测）

- `pnpm -F @kn/common check:plugin-agent` → `plugin-agent checks passed`；
- `pnpm -F @kn/common check`（全链）→ `65 passed, 0 failed`；
- `tsc -p` 通过：`@kn/common`、`@kn/core`（自身源码 0 错；`../editor`/`../ui` 报错是既有的路径别名配置问题）、`@kn/plugin-plugin-studio`。
- 期间修掉一个真实 bug：适配器最初把 legacy 工厂的调用**延迟**到执行器里，导致「无编辑器时跳过 editor-bound 工具」的语义失效；改为在 `create(ctx)` 内**立即**调用工厂后恢复。

### 11.4 已知边界（后续里程碑）

- `context` / `services` 白名单（决策 3）尚未强制，只做了类型与位置预留；
- `AgentToolContext.navigate` 由内核层注入，当前未接；
- plugin-main 尚未声明工作台能力（§3.4 的 `include` 机制已就绪，属 M3）；
- `agent.actions` / `agent.agents` 已聚合但还没有 UI 消费者（M2/M5）。

---

## 12. 实现记录（M2 已落地）—— AI 首页由 plugin-ai 拥有

> **归属决策（用户拍板）**：AI 首页是 **plugin-ai 自己贡献的独立整页/路由**，**plugin-main 里没有任何 AI 代码**。
> 原因：内核 agent 独立于任何插件；首页作为一个 surface，装/卸 AI 插件即增/减该 surface。
> 最初的实现把 hero 放进 plugin-main 的 `Home`，已按此决策撤回并迁走。

### 12.1 新增：`packages/common/src/ai/kernel/`（内核运行时）

| 文件 | 内容 |
|---|---|
| `prompts.ts` | `WORKSPACE_AGENT_PROMPT`：workspace scope 的稳定系统提示（只放不变量） |
| `use-agent-capabilities.ts` | `useAgentCapabilities(scope)`：注册表的响应式视图，插件装/卸自动重算（走 `usePluginState`） |
| `use-workspace-agent.ts` | `useWorkspaceAgent()`：**无编辑器**的 run —— `useCapabilityProviders(null)` + `useEditorAgent`，scope=workspace |
| `filter-catalog.ts` | `filterAgentCatalog`：按 scope 裁剪 catalog（纯函数，已加运行时检查） |

### 12.2 scope 正确性（M2 的关键修复）

前端 catalog 由编辑器 `ToolProvider` 组装，会**急切实例化全部 17 个 builtin 编辑工具**（需要活的 editor）。
workspace run 没有编辑器，若照单全收，模型会调用 `getDocumentStructure` 之类工具并运行时报错——即 M0 想消灭的「声明了但失败」。

处理：workspace scope 只保留 **插件来源**（`source === 'plugin'`）的工具，builtin 编辑工具被 `filterAgentCatalog` 剔除，引用了它们的 builtin 技能一并丢弃（prompt-only 技能保留）。
因此 workspace run 的能力 = **后端 builtins（web_search / web_fetch / memory / plan / delegate）+ 已装插件声明的工具**；M3 的 `agent.include` 工作台工具会以插件来源注册，自动通过该过滤。

### 12.3 plugin-ai：AI 首页

- 新增 `packages/plugin-ai/src/ai/home/KernelHomePage.tsx`：整页 AI 首页，**直接复用侧边栏聊天的那套组件**——`ChatEmptyState`（空态 + 起始提示）、`MessageBubble`（Streamdown 渲染 markdown + 活动时间线）、`ChatComposer`（Ask/Agent 切换、模型选择、自定义 Agent、发送/停止）、`ChatMessageList`、`PlanApprovalCard`。视觉与侧边栏一致，只是整宽、无「@页面」目标 chip。
- `packages/plugin-ai/src/index.tsx`：新增 `routes: [{ path: '/ai', element: <KernelHomePage/> }]` 与侧边 `menus` 项；插件卸载即整页消失。
- 删除 `packages/plugin-main/src/pages/Home/HomeAgentHero.tsx`，`Home/index.tsx` 恢复原样。

### 12.4 验证（实测）

- `pnpm -F @kn/common check:plugin-agent` → `plugin-agent checks passed`（新增 catalog 过滤用例）；
- `tsc -p`：`@kn/common` 0 错；`@kn/plugin-ai` / `@kn/plugin-main` 自身源码 0 错（其余为既有的 `../editor`/`../ui` 别名配置问题）；
- `grep HomeAgentHero plugin-main/src/pages/Home/index.tsx` 无匹配（已彻底撤出）。

### 12.5 与计划的偏差 / 后续

- ~~M2 先自建极简 composer~~ → 已改为**直接复用侧边栏组件**（用户反馈「要跟侧边栏一样」）。为支持 workspace 语义，给 `ChatComposer` 加了 `hideTargetPage`（隐藏 @页面 chip），并让附件按钮仅在提供 `onAddImages` 时渲染；`useWorkspaceAgent` 增加 `mode: 'ask' | 'agent'`（ask 不挂任何工具）。首页暂未接图片附件（M4 与 dock 统一时再补）。
- `/ai` 目前从侧边菜单进入；若要让它成为**默认首页**，需要路由优先级/重定向策略（未做，等确认）。
- `agent.actions` 尚无插件声明（plugin-main 未加、避免把 AI 关联写进 main）——快捷动作区当前为空，M3 由声明工作台能力的插件填充。
- 命名 agent 区已按 `agent.agents` 渲染，等 M5 的 `agent.agents` 贡献落地。

---

## 13. 插件能力如何体现在对话里：Artifacts + Sheets

> 目标（用户例子）：**让 AI 新建一个文档后，对话里出现一张卡片；点「在旁边打开」，右侧弹出 sheet 预览这个页面。**
> 现状：工具结果只有 `AgentActivityTimeline`（`ExecutionStepsDisplay.tsx`）里一个通用的 `DetailBlock` + `JSON.stringify(sanitizeToolPayload(result))`。插件没有任何可视化落点，能力再强也只表现为一行「工具名 + JSON」。

### 13.1 三层设计（数据 → 渲染 → 宿主）

**① Artifact 描述符（数据，属于工具实现）**

工具声明「我的结果是什么」：

```ts
export interface AgentArtifact {
  kind: string        // 'page' | 'spreadsheet' | 'bitable' | 'chart' | 'source-list' | ...
  id: string
  title?: string
  spaceId?: string
  subtitle?: string
  data?: unknown      // 渲染器专用、已脱敏的小载荷
}

interface AgentToolDefinition {
  // …existing
  /** 把工具结果映射成可渲染的 artifact；null = 无。 */
  artifactFromResult?: (result: unknown, args: unknown) => AgentArtifact | null
}
```

**② 插件 renderer（UI，属于插件）**

```ts
interface AgentContribution {
  // …existing
  /** 对话里的工具结果卡片，按工具名。 */
  toolRenderers?: Array<{ tool: string; render: ComponentType<AgentToolResultProps> }>
  /** artifact 的预览/详情，按 artifact.kind。 */
  artifactRenderers?: Array<{ kind: string; render: ComponentType<AgentArtifactProps> }>
}

interface AgentToolResultProps {
  tool: string
  args: unknown
  result: unknown                    // 已 sanitize
  artifact?: AgentArtifact | null
  openArtifact: (a: AgentArtifact) => void   // → 右侧 sheet
  openInPage: (a: AgentArtifact) => void     // → 跳转整页
}
interface AgentArtifactProps {
  artifact: AgentArtifact
  close: () => void
  openInPage: (a: AgentArtifact) => void
}
```

**③ Kernel 宿主（框架，属于内核）**

- `PluginManager.resolveAgentCapabilities()` 一并聚合 `toolRenderers` / `artifactRenderers`，带 provenance（和 tools/skills 同一套）。
- `AgentToolResultCard`：按工具名找 renderer，找不到回退到现有 JSON 块（零破坏）。
- `AgentSheetProvider` + `useAgentSheet()`：`openArtifact(a)` / `openView(sheetId, props)` / `close()`。
- `<AgentSheetHost />`：右侧 `@kn/ui` 的 `Sheet`（已存在，`ui/src/components/ui/sheet.tsx`），内部渲染 `artifactRenderers[kind]`，找不到就显示通用兜底。
- 集成点：`ExecutionStepsDisplay.tsx` 的 step 渲染处加一个 slot。

### 13.2 用户例子的完整链路

```
agent 调 createPage
  → result { pageId, title, spaceId }        （core 的 page-tools.ts 已返回这些字段）
  → core 声明的 artifactFromResult 映射成 { kind:'page', id:pageId, title, spaceId }
  → 对话里 AgentToolResultCard 命中某插件注册的 toolRenderers['createPage']
       卡片：《标题》＋[在旁边打开][打开页面][复制链接]
  → 点「在旁边打开」→ openArtifact(artifact)
  → <AgentSheetHost> 打开右侧 sheet，渲染 artifactRenderers['page']
       页面预览：复用 PageEditWindow 的编辑器栈（core 已实现，common 有 bridge）
```

**归属**：`artifactFromResult`（数据映射）跟着**工具实现**走（core）；`toolRenderers`/`artifactRenderers`（UI）跟着**插件**走——所以「装了 plugin-office 就有表格卡片、装了 plugin-bitable 就有记录表格卡片」，内核不硬编码任何业务 UI。

### 13.3 可复用的现成件（已确认）

| 需求 | 现成件 |
|---|---|
| 右侧 sheet | `@kn/ui` 的 `Sheet`（已导出）；或 `resizable.tsx` |
| 页面预览/编辑 | `PageEditWindow`（core 实现 + common bridge，浮动可拖拽）；离屏编辑器池 `offscreen` |
| 页面跳转 | `page-navigation-bridge` 的 `openPage` |
| 结果脱敏 | `chat-types.ts` 的 `sanitizeToolPayload`（renderer 必须拿到脱敏后的 result） |
| 工具结果时间线 | `ExecutionStepsDisplay.tsx`（集成点） |

### 13.4 切片计划

| 切片 | 内容 | 依赖 |
|---|---|---|
| **S1 基础设施** | 契约（`artifactFromResult` / `toolRenderers` / `artifactRenderers`）+ 注册表聚合 + `AgentToolResultCard` + `AgentSheetHost`；用 **web_search 来源卡片**验证（后端 builtin，workspace scope 现在就能跑） | 无 |
| **S2 用户的例子** | `createPage` / `searchPages` 的 artifact 映射 + plugin-main 注册页面卡片与预览 sheet | **M3**（工作台工具要在 workspace scope 可用） |
| **S3 插件能力铺开** | office 表格 mini-grid、bitable 记录表、chart 缩略图；重活可放 sheet 里做 | S1 |
| **S4 反向能力** | 卡片上的动作回填为新一轮 turn（如「用这个表格做个透视表」） | S1+S3 |

### 13.5 边界

- renderer 只拿 **sanitize 后的 result**，敏感键位已在源头脱敏；
- renderer 崩溃要隔离（错误边界），不能让一张卡片带崩整个对话；
- `desktopOnly` 插件的 renderer 在 Web 端过滤（复用 capabilities 聚合里的 `desktopOnly`）；
- sheet 是**只读预览优先**：写操作仍走 agent（保持「AI 负责改、用户负责看」的边界），需要编辑时用 `PageEditWindow`。

---

## 14. 实现记录（S1 已落地）—— 能力全部落插件侧，内核提供配套

> 原则（用户拍板）：**这些能力最好都落在插件侧，所以内核要有一套相关的配套。**
> S1 只做「配套」：契约、注册表、宿主、API、消费点，以及一个插件侧示例。内核不认识任何业务 artifact。

### 14.1 契约（`packages/common/src/ai/plugin-agent/types.ts`）

- `AgentArtifact`：`{ kind, id, title?, spaceId?, subtitle?, data? }` —— 工具结果的**数据描述符**，内核只按 `kind` 路由，不解释。
- `AgentToolResultProps` / `AgentArtifactProps`：插件卡片 / sheet 视图拿到的 props（含 `openArtifact` / `openInPage`）。
- `AgentToolDefinition.artifactFromResult?`：**数据映射跟工具实现走**。
- `AgentContribution.toolRenderers?` / `artifactRenderers?`：**UI 跟插件走**。

### 14.2 注册表（`PluginManager`）

- `resolveAgentCapabilities()` 一并聚合 `toolRenderers` / `artifactRenderers`，带 provenance；工具名走 local→wire 解析。
- `include` 进来的 core 实现会透传 `artifactFromResult`（M3 的页面工具即用此路径）。

### 14.3 Kernel API（`packages/common/src/ai/kernel/`）

| 文件 | 内容 |
|---|---|
| `use-agent-renderers.ts` | `useAgentToolRenderers()` / `useAgentArtifactRenderers()`：注册表 → `Map`（scope 无关） |
| `agent-sheet.tsx` | `AgentSheetProvider` / `useAgentSheet()`（provider 外安全降级为 no-op）/ `AgentSheetOutlet` + `setAgentSheetHostImpl` 桥 |
| `agent-tool-result-card.tsx` | `AgentToolResultCard`：命中插件 renderer 才渲染，否则返回 `null`（回退现有 JSON）；**错误边界隔离** |

> `@kn/common` 不能依赖 `@kn/ui`，所以 sheet 的**视觉宿主**用既有桥模式注册（同 `PageEditWindow`）。

### 14.4 宿主与消费点

- **宿主（core）**：`packages/core/src/components/AgentSheetHostImpl.tsx`（`@kn/ui` 的 `Sheet` 右侧抽屉），`registerAgentSheetHost()` 在 `App.tsx` 的 `ensureCoreRuntimeRegistered()` 注册；
  `AgentSheetProvider` 挂在 **App 根部**（`AppContext.Provider` 内），因此首页 / 侧边 dock / 编辑器**全部**自动具备 sheet 能力。
- **消费点（plugin-ai）**：`ExecutionStepsDisplay.tsx` 的 `ToolItem` 挂 `<AgentToolResultCard>`。
- **插件侧示例**：`packages/plugin-ai/src/ai/artifacts/WebSearchSources.tsx` —— 为 `web_search` 注册对话卡片 + `source-list` 的 sheet 视图；在 plugin-ai 的 `agent` 里声明。**内核零业务代码。**

### 14.5 验证

- `tsc -p`：`@kn/common` 0 错；`@kn/core` / `@kn/plugin-ai` 自身源码 0 错；
- `pnpm -F @kn/common check:plugin-agent` → passed。

### 14.6 下一步（S2，即用户举的例子）

`createPage` → `artifactFromResult` 产出 `{ kind:'page', id, title, spaceId }` → 某插件注册 `page` 卡片与预览 sheet → 点「在旁边打开」→ 全局 sheet 宿主挂载页面预览（复用 `PageEditWindow` 编辑器栈）。
**依赖 M3**：`createPage` 需先由 plugin-main 用 `agent.include` 声明为工作台工具，才能在 workspace scope 出现。

---

## 15. 实现记录（M3 + S2 已落地）—— 「建页 → 点击 → 侧边预览」端到端

> 完成用户举的例子：AI 新建文档后，对话里出现卡片；点「在侧边查看」，右侧 sheet 只读预览这个页面。
> 原则不变：**实现与数据的归属按「core 实现 / 插件声明 / 插件渲染」切分**，内核无业务代码。

### 15.1 M3：core 实现 + plugin-main 声明（不迁代码）

- 新增 `packages/core/src/ai/tools/workspace-tools.ts`：
  - 复用既有 `createPageTools(null)`——因为 `resolveActivePage(editor?)` 的 editor 本就可选（无 editor 时回退到导航桥 + 会话绑定），所以**不需要重写页面工具**；
  - 暴露 `searchPages / createPage / listSpaces / getSpacePageTree / openPage`，并新增 `searchContent`（走 `relations.searchBlocks`，补上「只搜标题」的短板）；
  - `createPage` 增加**个人空间兜底**并强制 `bindToSession:false`（workspace 没有编辑器可绑）；
  - `pageArtifactFromResult`：成功结果 → `{ kind:'page', id, title, spaceId, subtitle }`。
- `registerCoreAgentTools()`（`ai/tools/register.ts`）在 `App.tsx` 启动时调用 `registerAgentToolImplementations(...)`。
- `plugin-main/src/index.tsx` 声明 `agent.include`——**注册 ≠ 可用**：不声明就进不了 catalog。
- 命名空间：plugin-main 的 pluginKey 是 `@kn/plugin-main` → 线上名 `kn_plugin-main__createPage`；工具 renderer 的 `tool:'createPage'` 由内核 local→wire 自动解析，插件写本地名即可。

### 15.2 S2：页面卡片 + 只读预览 sheet（插件侧）

- `packages/plugin-main/src/ai/PageArtifact.tsx`：
  - `PageArtifactCard`：对话卡片（标题 + 位置 + [在侧边查看] [打开页面]）；
  - `PagePreviewSheet`：sheet 内用 `@kn/editor` 的 `EditorRender`（`isEditable=false`）只读渲染页面，复用 SharedPage 同一套用法。
- 在 plugin-main 的 `agent` 里注册 `toolRenderers: [{ tool:'createPage' }]` 与 `artifactRenderers: [{ kind:'page' }]`。

### 15.3 内核补齐

- `useAgentToolArtifactMappers()`：按 wire name 暴露 `artifactFromResult`；`AgentToolResultCard` 现在按 **显式 artifact → 调用方 mapper → 工具实现 mapper** 的优先级解析，内核的数据通路成为权威。
- sheet 宿主挂在 **App 根部**，所以首页、侧边 dock、编辑器**都**具备该能力。

### 15.4 完整链路

```
模型调 kn_plugin-main__createPage（plugin-main 声明、core 实现）
  → 结果 { pageId, title, spaceId, placement }
  → 内核 mapper 产出 artifact { kind:'page', … }
  → ToolItem 命中 PageArtifactCard（插件注册）→ 卡片
  → 点「在侧边查看」→ useAgentSheet.openArtifact
  → 根部 AgentSheetProvider → core 的 AgentSheetHostImpl（@kn/ui Sheet 右侧）
  → plugin-main 的 PagePreviewSheet → EditorRender 只读预览
```

### 15.5 验证（实测）

| 检查 | 结果 |
|---|---|
| `tsc -p` @kn/common | exit 0 |
| `tsc -p` @kn/core / @kn/plugin-ai / @kn/plugin-main | 自身源码 0 错（其余为既有 `../editor`/`../ui` 别名配置问题） |
| `pnpm -F @kn/common check:plugin-agent` | passed |

### 15.6 已知边界

- workspace 的工具过滤按 `source === 'plugin'`；include 注册即 plugin 来源，故通过。M3 声明的是页面工具，文档级工具（applyEdits 等）仍**只属于 page scope**。
- `createPage` 的 `linkInDocument` 在 workspace 下无锚点页面，等价关闭；需要时由模型显式 `editPage` 后再操作（page scope）。
- 预览是**只读**（`EditorRender isEditable=false`）；编辑仍走 agent 或「打开页面」跳转。

---

## 16. 改版：从 side sheet 改为 side peek（内联分栏）

> 反馈：sheet 是**浮层**，会盖住内容（截图 1）。目标是对齐 Notion 的 **side peek**（截图 2）：页面与对话**并排**，不是覆盖。
> 结论：内核不提供「浮层宿主」，只提供**状态 + API + 渲染器解析 + 桥**；**分栏由 surface 自己排**。

### 16.1 内核改造（`@kn/common`）

- `agent-sheet.tsx` → **删除**；新增 `agent-pane.tsx`：
  - `AgentPaneProvider`：只管理状态（不再渲染任何 outlet）；
  - `useAgentPane()`：返回 `{ request, openArtifact, openView, openInPage, close }` —— surface 用 `request` 决定分栏宽度；
  - `AgentPaneHost`：转发到宿主实现（桥），**由 surface 放在自己的分栏里**；
  - `setAgentPaneHostImpl`：沿用桥模式。
- `agent-tool-result-card.tsx` 改用 `useAgentPane()`。

### 16.2 宿主（core）

- `AgentSheetHostImpl.tsx` → **删除**；新增 `AgentPaneHostImpl.tsx`：**不再用 `@kn/ui` 的 `Sheet`**，改为一个带 header（标题 / 打开页面 / 关闭）的内联列；注册名 `registerAgentPaneHost()`（`App.tsx`）。
- `AgentPaneProvider` 仍挂在 App 根部（状态全局），但**不再有浮层**。

### 16.3 表面积（plugin-ai）

- `KernelHomePage` 改为分栏：对话列 `flex-1` + 右侧 `<aside class="w-[min(560px,46vw)] border-l">` 内渲染 `<AgentPaneHost/>`（`md:` 以上显示）。
- plugin-main 的 `PagePreviewSheet` 更名 `PagePreviewPane`（只读 `EditorRender` 不变）。

### 16.4 验证

`tsc -p`：`@kn/common` exit 0；`@kn/core` / `@kn/plugin-ai` / `@kn/plugin-main` 自身源码 0 错；`check:plugin-agent` passed；全仓无 `AgentSheet`/`agent-sheet` 残留。

### 16.5 边界

- **侧边 dock 的 Chat 尚未渲染 `<AgentPaneHost/>`**：provider 在根部，所以在 dock 里点「在侧边查看」会设置全局状态但不显示分栏。M4 统一多入口时把同一分栏补进 dock。
- 分栏宽度目前固定；Notion 是可拖拽的，后续可换 `@kn/ui` 的 `resizable`。
- 移动端隐藏分栏（`md:`），后续需要改为全屏叠加。

---

## 17. Side peek：过渡动画 + 可拖拽宽度

> 反馈：分栏要有过渡动画，并且能调节宽度。

### 17.1 宿主改为 props 驱动（支持退出动画）

- `AgentPaneHostProps = { request, onClose, onOpenInPage }`；`AgentPaneHost` / `setAgentPaneHostImpl` 改为接收 props。
- 原因：surface 需要**自己持有 request 快照**。关闭时 context 里的 request 会立刻变 null，若宿主直接读 context，内容会在列收缩前消失；props 化后可以在 200ms 退出动画期间继续渲染同一份内容。

### 17.2 plugin-ai 的 `KernelHomePage`

- **宽度**：`paneWidth` state，`localStorage('kn_agent_pane_width')` 持久化；`clampPaneWidth` 限制 [320px, 68vw]。
- **进入动画**：request 出现 → 先以 `width:0 / opacity:0` 挂载 → `requestAnimationFrame` 后切到目标宽度 + opacity 1；`transition-[width] duration-200 ease-out`。
- **退出动画**：request 变 null → `paneOpen=false`（列收拢 + 淡出）→ 200ms 后清空 `paneDisplay` 并卸载。
- **内层固定宽度**：内层 div 固定 `width: paneWidth`，动画期间**内容不重排**，由外层 `overflow-hidden` 裁切。
- **拖拽调宽**：左边缘 `1.5px` 的 `cursor-col-resize` 分隔条；pointerdown 监听 window pointermove/up，按 `startWidth - Δx` 更新；拖拽中禁用宽度过渡（避免跟手延迟）并锁 `document.body.userSelect`；松手持久化。
- 移动端仍是隐藏（`md:block`）。

### 17.3 验证

`tsc -p`：`@kn/common` exit 0；`@kn/core` / `@kn/plugin-ai` / `@kn/plugin-main` 自身源码 0 错；`check:plugin-agent` passed。

### 17.4 后续

- 可换成 `@kn/ui` 的 `resizable`（react-resizable-panels）以获得双栏联动；当前手写实现是为了**同时控制动画**。
- dock 的分栏（M4）复用同一 `AgentPaneHost` 即可。

---

## 18. 会话管理：刷新不再丢对话

> 问题：KernelHome 用本地 `messages` state + `persist:false`，刷新即清空。
> 方案：**复用侧边 dock 已有的一整套会话体系**，不重造。

### 18.1 复用的现成件（plugin-ai）

| 件 | 作用 |
|---|---|
| `useChatSessions()` | `sessions / activeSessionId / messages / setMessages / loadingTranscript / create / switch / delete / clear` |
| `useSessionActions()` | 切换/新建/删除/清空前**先 abandon 在跑的 run**，避免用错会话驱动工具 |
| `ChatHeader` | 会话下拉（切换/新建/删除/清空）——就是侧边栏那个 |
| 权威源 | 后端 `/api/agent/v1/sessions`（引擎持有 transcript）+ localStorage 索引/缓存 |

### 18.2 改动

- `useWorkspaceAgent` 新增 `conversationId?: string`：会话型 surface 传入自己的 `activeSessionId`，**引擎线程（= transcript 的键）因此跨刷新稳定**。
- `KernelHomePage`：
  - 本地 `messages` state → `useChatSessions()`；
  - `useWorkspaceAgent({ conversationId: activeSessionId, … })`；
  - 顶部加 `<ChatHeader>`（切换/新建/删除/清空），加载态用 `loadingTranscript`；
  - `abandoningRef` 守卫：被放弃的一轮**不允许**被快照进切换后的会话（与 dock 同一套逻辑）。

### 18.3 语义：与侧边 dock 共用同一份会话

首页与 dock 使用**同一个会话列表和同一份 transcript**（同一个 AI）。localStorage 键相同，元数据写入幂等；后端以 sessionId 为准。
好处：在 dock 聊到一半，打开 `/ai` 能继续同一段对话；刷新后由后端 transcript 恢复。

### 18.4 验证

`tsc -p`：`@kn/common` exit 0；`@kn/plugin-ai` 自身源码 0 错；`check:plugin-agent` passed。

### 18.5 边界

- 两处**同时挂载**时，各自的 `activeSessionId` 状态不互相实时同步（在 A 处切换后，B 需重新挂载才跟随）。需要严格隔离时，给 `chat-sessions.ts` 的存储键加 namespace 参数即可（当前刻意共用）。
- 若后端 `/sessions` 不可用，仍可退回 localStorage 的单机缓存。

---

## 19. agent 主动在侧边分栏打开页面（plugin-main 配置）

> 需求：不是等用户点卡片，而是 **agent 自己决定**「在旁边把某个页面展示给用户」。

### 19.1 内核：命令式呼出桥（工具不在 React 树里）

- `agent-pane.tsx` 新增：
  - `setAgentPaneOpener(opener)`：provider 挂载时注册、卸载时清除；
  - `openAgentArtifact(artifact): boolean`：给非 React 调用方（工具执行器）用的命令式入口，返回是否成功——**没有 surface 挂载分栏时返回 false**，工具可据此报明确错误。

### 19.2 core：新工具 `openPageSide`

- `workspace-tools.ts` 新增 editor-free 工具 `openPageSide({ pageId, title?, spaceId? })`（`scope: 'any'`, `readOnly`）；
- 实现调用 `openAgentArtifact({ kind:'page', … })`；带 `artifactFromResult`，因此打开后对话里还会留一张页面卡片（可「打开页面」去编辑）。

### 19.3 plugin-main：声明即可

```ts
agent: {
  include: [ …, 'openPage', 'openPageSide' ],
  toolRenderers: [
    { tool: 'createPage',    render: PageArtifactCard },
    { tool: 'openPageSide',  render: PageArtifactCard },   // 打开后留卡片
  ],
  artifactRenderers: [{ kind: 'page', render: PagePreviewPane }],
}
```

遵循既定分工：**core 实现 / plugin-main 声明**——不声明就进不了 catalog。

### 19.4 行为

- agent 调研完或建完页 → 调 `openPageSide` → 右侧分栏滑出预览（带过渡动画、可拖拽调宽）；
- 同时对话里出现页面卡片，用户可「打开页面」跳去编辑；
- 若当前 surface（如侧边 dock）没有挂载分栏，工具返回 `{ success:false, error:'当前界面没有可用的侧边预览' }`，而不是静默失败。

### 19.5 验证

`tsc -p`：`@kn/common` exit 0；`@kn/core` / `@kn/plugin-main` / `@kn/plugin-ai` 自身源码 0 错；`check:plugin-agent` passed。

---

## 20. 侧边分栏：完整功能的页面编辑器 + agent 改动实时可见

> 反馈：plugin-main 打开的侧边栏要有**完整功能**，而且 **agent 对该页面的改动要实时看到**。
> 之前的分栏是只读 `EditorRender` + 一次性 `getPageDocument`：既不能编辑，也不会实时更新。

### 20.1 关键洞察

`PageEditWindowImpl`（浮动页面窗）与 `OffscreenEditorHost`（agent 的离屏编辑器）**用的是同一个 `CollaborationEditor`，绑定同一个 Y.Doc 房间** `page:{pageId}`。
所以只要分栏里挂同一个编辑器，**agent 的编辑会通过 CRDT 实时广播到分栏**，无需轮询/重取——而且天然可编辑。

### 20.2 实现：给 `PageEditWindow` 加 `embedded` 模式

- `PageEditWindowProps.embedded?: boolean`（`@kn/common` 桥）。
- `PageEditWindowImpl` 在 embedded 下：**不 portal 到 body**、不 `fixed` 定位、不进窗口堆栈、隐藏窗口自带的 header、跳过 resize handle，只渲染全高可编辑编辑器；悬浮形态完全不变。
- 分栏宿主（`AgentPaneHostImpl`）提供标题 / 打开页面 / 关闭的 chrome。

### 20.3 plugin-main：删掉只读预览

- `PagePreviewPane` 从「`getPageDocument` + 只读 `EditorRender`」改为：
  ```tsx
  <PageEditWindow pageId={artifact.id} embedded onClose={close} />
  ```
- 因此分栏里是**完整的页面编辑器**（标题、斜杠菜单、气泡菜单、TOC、自动保存、协作光标……），与浮动窗一致。

### 20.4 实时性的来源

```
agent 工具编辑页面 → session-page-binding 路由到该页的编辑器（离屏或主编辑器）
        → 同一个 Y.Doc 房间 page:{pageId}
        → 分栏里的 CollaborationEditor 收到 CRDT 更新 → 立即渲染
```
用户在分栏里的编辑同样会流回 agent 的编辑器，双向实时。

### 20.5 验证

`tsc -p`：`@kn/common` exit 0；`@kn/core` / `@kn/plugin-main` / `@kn/plugin-ai` 自身源码 0 错；`check:plugin-agent` passed。

### 20.6 边界

- 同一标签页会因此为该页多开一个协作客户端（与浮动窗一致）；CRDT 会合并，但**同一用户同时编辑两处**时会出现两套光标——正常现象。
- 分栏编辑器目前没有「最小化/浮动」能力（那是浮动窗的形态）；需要时用 chrome 的「打开页面」跳整页，或在分栏里再开浮动窗。

---

## 21. 代码审查与清理（本次改动）

### 21.1 删除的过时 / 死代码

| 项 | 原因 |
|---|---|
| `kernel/agent-sheet.tsx`、`AgentSheetProvider`、`core/components/AgentSheetHostImpl.tsx` | side **sheet**（浮层）已被 side **peek**（内联分栏）取代（§16） |
| `AgentPaneRequest` 的 `{ kind:'view' }` 变体 + `openView()` | 没有任何贡献点会产出「命名视图」，是投机设计；pane API 简化为只处理 artifact |
| `AgentToolResultCard.artifactOf` | 无调用方；工具实现的 `artifactFromResult`（内核 mapper）已是权威数据通路 |
| `getAgentPaneHostImpl()` | 无调用方 |
| `PluginManager` 的 5 个 `reslove*` 拼写别名 | 全仓 0 调用方的遗留兼容壳 |
| `openPageSide` 内联的 `artifactFromResult` | 与 `pageArtifactFromResult` 重复，合并为一处 |

### 21.2 顺手修正

- `PluginManager.resolveTools()` 标注 `@deprecated`：权威路径是 `resolvePluginToolGroups()`（保留 provenance）。
- `ToolProvider.updateEditor` 注释里的 `resolveTools` 改为 `resolvePluginToolGroups`（避免误导）。
- `KernelHomePage` 的 `sessionError` 之前**设了不读**，现已渲染进错误条。

### 21.3 分层审查结论

| 层 | 位置 | 允许依赖 | 结论 |
|---|---|---|---|
| 契约 + 内核 | `common/src/ai/plugin-agent`、`common/src/ai/kernel` | 仅 common 内部 + react | ✅ 无 `@kn/core` / `@kn/ui` / 插件 |
| 插件系统聚合 | `common/src/core/PluginManager` | 契约类型 + 组件引用 | ✅ 与既有 `dockPanels` 同模式 |
| 实现 + 宿主 | `core/src/ai/tools`、`core/src/components` | common + ui + editor | ✅ |
| 插件 UI | `plugin-ai`、`plugin-main` | common + ui + icon(+editor) | ✅ 无 `@kn/core`（grep 命中的只是文案字符串） |

- 插件间**无横向依赖**（plugin-main ↮ plugin-ai）。
- 一条刻意的解耦：`filter-catalog.ts` 从 `capabilities/payload-types` 取类型而非 `capabilities`，因为后者读 `import.meta`，在 check 的 commonjs 编译下会失败。已用注释说明。
- `@kn/common` 现在包含 React 组件（结果卡片、pane 桥），但**不依赖 `@kn/ui`**；视觉外壳由 core 通过桥注册——与 `PageEditWindow` / offscreen 既有模式一致。

### 21.4 保留但尚未接线（有意）

- `agent.context` / `agent.actions` / `agent.agents`：契约 + 聚合已就绪，UI 消费留到 M2/M5（`actions` 的首页快捷动作在改用 `ChatEmptyState` 后暂时没有入口）。
- dock 尚未渲染 `<AgentPaneHost/>`（provider 在根部，能力已具备）。

### 21.5 验证

`tsc -p`：`@kn/common` exit 0；`@kn/core` / `@kn/plugin-main` / `@kn/plugin-ai` 自身源码 0 错；`check:plugin-agent` passed；`AgentSheet` / `openView` / `artifactOf` / `reslove*` 全仓 0 残留。

---

## 22. 聊天框自动跟随（auto-follow）

**问题**：KernelHome 的对话不会自动滚到底。


---

## 23. 产物架（Artifacts shelf）

> 需求：agent 在同一个会话里可能操作**多个目标**，需要一个类似 Notion「Artifacts」的存放地点。

### 23.1 设计：派生，不另存


---




---

## 33. 回归修复：skill 未与工具对账 → TOOL_NOT_FOUND

**现象**：`§32` 之后改报 `TOOL_NOT_FOUND: 工具未注册`（同一个 logicflow 调用）。

**根因**：§32 把 legacy 文档工具移出 workspace scope 是对的，但 **skill 没有被一起对账**。
`collectCapabilityCatalog` 会把**所有已注册 skill** 的 `systemPromptFragment` 发给模型，只是把找不到的工具从 `skill.tools` 里剔除——于是 **skill 的提示词仍在宣传那些工具**，模型照调，后端自然 `TOOL_NOT_FOUND`。
（首页的 `filterAgentCatalog` 只能救首页；dock / 编辑器面板压根没这层过滤。）

**修法**：把对账收敛到 **catalog 生成层**（`CapabilityCatalog.ts`），所有 surface 一致受益：

- 新增 `skillSurvives(skill)`：**无 requiredTools**（纯提示词技能）或有**至少一个可执行**的 required tool 才存活；
- 存活的 skill 其 `requiredTools` / `optionalTools` / `tools` 只保留**本会话真正注册**的；
- `claimedByASkill`（决定哪些工具走 deferred 通道）只统计**会存活的 skill**，且只统计可执行名字——否则被丢弃 skill 的 optional tool 会既不在 `tools[]`、又无人携带，变成不可达。

**效果**：

- 没有编辑器（workspace / dock 未绑定编辑器）时，依赖编辑器的插件 skill **不发送** → 模型不会调用不存在的工具；
- 编辑器就绪后，工具注册 + skill 恢复 → 正常可用；
- 这是「**skill 与工具集合同源**」的契约，与 §14 的「能力随插件/作用域变化」一致。

**验证**：`pnpm -F @kn/common check:plugin-agent` passed；`tsc -p` 四包自身源码 0 错。