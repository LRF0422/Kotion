# Agent 内核规范（Kernel Spec）

> 版本：v1（2026-09）。实现位于 `@kn/common/src/ai/plugin-agent` 与 `@kn/common/src/ai/kernel`。
> 本文是**规范**：不变量与 API 形状是契约，实现必须满足；标注「边界」的部分是已知取舍。

---

## 1. 目标

内核把「AI 能力」抽象为一组与业务无关的概念，使：

- **能力由插件声明**：内核不认识页面、表格、图表；它只认识 artifact 与 renderer。
- **agent 始终知道自己在操作什么**：会话有且仅有一个**工作目标**，每轮被告知。
- **agent 能自由切换目标**，且 UI（分栏高亮、产物架）与模型视图**永不发散**。

---

## 2. 概念模型

| 概念 | 定义 | 归属 |
|---|---|---|
| **Conversation** | 一次跨轮对话，transcript 由引擎持久化（`/api/agent/v1/sessions`） | 引擎 |
| **Run** | 一次 `用户输入 → think/act/observe → 终态`；`conversationId` 关联会话 | 引擎 |
| **Scope** | run 的作用域：`workspace` / `space` / `page`（决定挂哪些工具） | 内核 |
| **Artifact** | 一次操作产出的**可展示对象**：`{ kind, id, title?, spaceId?, data? }` | 契约（插件声明类型） |
| **Working Target** | 会话内 agent 当前聚焦的那**一个** artifact（或 null） | 内核持有 |
| **Pane** | side peek：并排展示 target 的内联分栏（**不是浮层**） | 内核状态 + core 外壳 |
| **Shelf** | 会话产物架：`collectAgentArtifacts` 从 transcript 推导出的去重列表 | 内核派生 + surface 渲染 |
| **Renderer** | 插件提供的 UI：`toolRenderers[tool]`（对话卡片）、`artifactRenderers[kind]`（分栏内容） | 插件 |
| **Mapper** | 插件提供的 `artifactFromResult(result, args) → AgentArtifact\|null` | 插件/工具实现 |

---

## 3. 不变量（契约保证，测试固化）

| # | 不变量 |
|---|---|
| **I1** | 一个会话**至多一个** working target；无则为 null。 |
| **I2** | target 必然是 artifact（或 null），内核不引入第二套目标表示。 |
| **I3** | target 变化**只影响 contextNote**，绝不改写 system 前缀（`message index 0`）；因此切换目标不会击穿 provider 提示缓存。 |
| **I4** | **每轮 turn** 都注入当前 target 描述（含「当前没有聚焦产物」的情况），模型视图始终是最新的。 |
| **I5** | 所有设置入口收敛到 `openArtifact`：卡片「在侧边查看」、产物架点击、agent 工具（`openAgentArtifact`）。UI 高亮与模型视图因此不可能不一致。 |
| **I6** | **关闭 pane ≠ 清除 target**：`close()` 只隐藏分栏，agent 仍在操作同一对象；`clearTarget()` 才丢弃。 |
| **I7** | **会话切换/清空必须清除 target**（target 属于会话），由 surface 在 `abandonAgent` 中调用 `clearTarget()`。 |
| **I8** | 插件**不得直接写** target 状态；只能通过 `openAgentArtifact` 或 renderer props 的回调。 |
| **I9** | 未知 artifact 类型必须**优雅降级**：卡片/分栏缺失时回退到通用展示，shelf 的 kind 标签回退为原始 kind 字符串。 |
| **I10** | **一个页面同时只有一个 writer。** 当分栏/浮窗等**可见编辑器**展示某页时，它通过 `claimEditor(pageId, editor)` **认领**该页：该页的隐藏离屏会话被**立即销毁**，agent 的文档工具与 conversation target 一律解析到该编辑器。可见编辑器关闭时 `releaseEditor`，下次按需惰性重建离屏会话。 |
| **I11** | 认领是**按页**、**幂等**的；同一页的多个可见编辑器之间由服务端写租约选举，落败方不写（并由 §29 的 reconcile 自愈兜底）。 |

---

## 4. 内核 API 面

### 4.1 契约（插件声明）

```ts
// plugin-agent/types.ts
interface AgentArtifact { kind: string; id: string; title?: string; spaceId?: string; subtitle?: string; data?: unknown }

interface AgentToolDefinition {
  artifactFromResult?: (result: unknown, args: unknown) => AgentArtifact | null
  // …create / scope / readOnly
}

interface AgentContribution {
  tools?: AgentToolDefinition[]
  include?: AgentToolInclude[]                    // core 实现，插件按名声明
  toolRenderers?: { tool: string; render: …; artifactFromResult?: … }[]
  artifactRenderers?: { kind: string; render: … }[]
}
```

### 4.2 状态（工作目标）

```ts
// kernel/agent-pane.tsx
interface AgentPaneApi {
  target: AgentArtifact | null
  open: boolean                                   // 分栏是否可见
  openArtifact(artifact): void                    // 设目标 + 展示（规范入口）
  openInPage(artifact): void                      // 离开会话去整页编辑（清目标）
  close(): void                                   // 隐藏分栏，保留目标
  clearTarget(): void                             // 丢弃目标
}
useAgentPane(): AgentPaneApi                      // provider 外安全降级为 no-op
openAgentArtifact(artifact): boolean              // 非 React 调用方（工具）
```

### 4.3 派生与描述

```ts
agentArtifactKey(a): string                       // kind:id
agentTargetKey(target): string | null
collectAgentArtifacts(invocations, mappers)       // 纯函数，去重、最新在前
useAgentArtifacts(invocations) → { artifacts, activeKey, open }
describeAgentTarget(target): string | undefined   // 每轮 contextNote
```

### 4.4 宿主桥

```ts
setAgentPaneHostImpl(Component)                   // core 注册一次（拥有 @kn/ui 外壳）
<AgentPaneHost artifact onClose onOpenInPage/>    // surface 放进自己的分栏
<AgentPaneProvider>                               // App 根部，持有 target 状态

// 页面作者权（I10）：可见编辑器认领页面，隐藏会话让位
claimEditor(pageId, editor) / releaseEditor(pageId, editor)   // SessionPageBinding
destroyIdle(pageId)                                            // OffscreenEditorBridge
```

---

## 5. 一轮 turn 的时序

```
用户点卡片 / agent 调聚焦工具
   → openAgentArtifact(artifact)
   → AgentPaneApi.openArtifact：target = artifact，open = true
   → surface 重渲染：分栏展开 + 产物架高亮（activeKey === agentTargetKey(target)）
   → surface 组装 describeAgentTarget(target) 作为 contextNote
   → useWorkspaceAgent.send(text, { contextNote }) → 引擎
   → 后端把 contextNote 追加为 <context> 段（在可缓存前缀之后）
   → 模型据此判断「我在操作哪个产物」，需要时再调聚焦工具切换：
       · openPageSide({ pageId })        —— 页面专用简写（含空间兜底）
       · focusArtifact({ kind, id })     —— 任意 artifact，用于混合产物间切换
```

---

## 6. 分层职责

| 层 | 职责 | 禁止 |
|---|---|---|
| **契约** `plugin-agent/` | 类型、命名空间、注册表、适配器、scope 过滤 | 依赖 `@kn/ui` / `@kn/core` |
| **内核** `kernel/` | target/pane 状态、产物集合推导、renderer 解析、桥 | 认识任何业务 kind；依赖 `@kn/ui` |
| **宿主** `@kn/core` | 分栏外壳（`@kn/ui`）、Sheet→pane 的 chrome、bridge 注册 | 业务 UI |
| **插件** | `artifactFromResult` / `toolRenderers` / `artifactRenderers`；卡片与分栏内容 | 直接写内核状态 |
| **surface** | 布局（分栏动画/宽度）、把 steps→invocations、注入 contextNote | 重新实现推导/去重/路由 |

---

## 7. 扩展指引：新增一种产物类型

1. 工具实现里声明 `artifactFromResult`（若工具非本插件所有，则在 `toolRenderers[]` 上声明）；
2. 声明 `toolRenderers[{ tool, render }]`（对话卡片，可选）；
3. 声明 `artifactRenderers[{ kind, render }]`（分栏内容，可选但建议）；
4. 在插件 locales 里补 `kind.<kind>` 标签；
5. **不需要改内核** —— shelf、分栏、目标跟踪自动生效。

---

## 8. 边界与非目标

- **target 是内存态**：当前不跨刷新恢复（transcript 会恢复，但「聚焦哪个」会重置）。若需要，按 conversationId 持久化到 session 元数据即可，不改变本节其余规范。
- **pane 是 side peek**：不做浮层；需要浮动编辑用 `PageEditWindow`。
- **dock 尚未接 `<AgentPaneHost/>`**：provider 在根部，能力已具备；接入后规范自动适用。
- **不做自动切换**：target 只由显式动作设置，避免 agent 静默改变用户视野。
