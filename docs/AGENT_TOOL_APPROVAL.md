# 工具审批（agent tool approval）

> 让「会改文档 / 跑命令 / 有副作用」的工具在执行**之前**问用户一句，而不把审批逻辑
> 塞进每个工具或每个插件里。审批通道由宿主统一提供，插件只声明"这个调用需要确认"。

## 为什么需要

agent 的工具是前端直接执行的：后端进入 `WAITING_TOOLS`，客户端拿到调用后**立刻开始执行**。
对 `readDocument` 这是对的；对删除、覆盖、执行 shell、发布插件这类不可逆操作，
用户应该在副作用发生**之前**有一次明确的确认，而且：

- 工具和插件不应该知道审批卡怎么渲染（Web / 桌面 / 未来别的宿主可能不一样）；
- 审批不能挂在某个具体工具上，否则每加一个危险工具就要接一次 UI；
- 审批本身可能永远等不到人（用户关页、取消 run、切会话），**绝不能把工具 promise 挂死**。

所以拆成 6 层，插件只看到第 1 层。

## 分层

| 层 | 位置 | 职责 |
| --- | --- | --- |
| 1 契约 | `packages/common/src/ai/types.ts` | `ToolApprovalRequest` / `ToolApprovalDecision`；`ToolExecutionContext.requestApproval` |
| 2 执行器 | `packages/common/src/ai/agent/tool-executor.ts` | 唯一的执行点：把 `requestApproval(callId, req)` 注入每个工具的 context。没有通道 → 拒绝（fail closed） |
| 3 协调器 | `packages/common/src/ai/agent/tool-approval.ts` | 纯逻辑注册表：按 callId 幂等、超时自动拒绝、订阅、按会话取消 |
| 4 状态机 | `packages/common/src/ai/agent/editor-agent-state.ts` | `ToolCallRecord.approval` + `tool-approval-requested/resolved`；`waiting-approval` phase（`suspendReason: 'tool_approval'`） |
| 5 渲染 | `packages/ui/src/components/ai/ToolApprovalCard.tsx` + `packages/common/src/ai/kernel/agent-tool-result-card.tsx` | 宿主通用确认卡；插件可按 `request.kind` 注册自定义卡（复用 `toolRenderers`），否则用通用卡 |
| 6 接线 | `packages/common/src/ai/agent/use-editor-agent.ts` | 构造 `EditorToolExecutor` 时传入通道；取消 / 重置 / 切会话 / 卸载时 `cancelScope` |

依赖方向保持单向：`ui` 不依赖 `common`，`common` 不依赖 `ui`（第 5 层的宿主通用卡由
surface 通过 `ApprovalCard` prop 注入，kernel 只做渲染决策）。

## 契约

```ts
export interface ToolApprovalRequest {
  title: string                 // 卡片标题
  message: string               // 正文（命令、风险说明）
  reasons?: string[]            // 风险原因列表
  level?: 'confirm' | 'block'   // block = 工具应自行拒绝，宿主会立即拒绝且不弹卡
  meta?: Record<string, unknown>// 结构化数据，供自定义渲染器用
  kind?: string                 // 自定义审批卡 key（复用 toolRenderers）
  timeoutMs?: number            // 默认 5 分钟，超时自动拒绝
}

export type ToolApprovalDecision =
  | { allowed: true; note?: string }
  | { allowed: false; reason?: string }
```

工具在**执行期的 context**（executor 第三个参数）拿到 `requestApproval`：

```ts
// 插件工具（create(ctx) 返回的 executor）
create: () => async (params, callId, context) => {
  const decision = await context.requestApproval?.({
    title: '删除页面',
    message: `将删除页面「${params.title}」`,
    reasons: ['不可撤销'],
    meta: { pageId: params.pageId },
  })
  // 没有通道 / 被拒绝 / 超时 → allowed === false，工具必须像用户拒绝一样失败
  if (!decision || !decision.allowed) return { ok: false, error: '用户拒绝执行' }
  return doTheThing(params)
}
```

`AgentToolContext` 上也有同名可选字段，供工厂期**声明式引用**；权威的按调用绑定是
executor 传进来的运行期 context（它带着 callId，并发调用不会串）。

## 保证（第 3 层）

- **一个 callId 只有一张卡**：并发/重放的 `request()` 返回同一个 promise；已决的
  callId 重放拿到已记录的决定，不会再弹一次。
- **永不挂死**：`timeoutMs`（默认 5 分钟）到点自动拒绝；`cancelScope(conversationId)`
  在 run 取消 / 重置 / 切会话 / 卸载时把该会话所有待审批拒绝掉。
- **只会 fail closed**：没有通道、通道抛错、决定对象畸形，最终都只能是
  `{ allowed: false }`。
- **快照稳定**：`get()` / `snapshot()` 在变化之间保持引用稳定，供
  `useSyncExternalStore` 订阅（`kernel/use-tool-approval.ts`）。

## UI

- 工具卡仍在步骤流里渲染。当某次调用 `status === 'running'` 且存在待审批时：
  - `request.kind` 命中已注册的 `toolRenderers` → 渲染插件自定义审批卡；
  - 否则渲染宿主注入的 `ApprovalCard`（`@kn/ui` 的 `ToolApprovalCard`）；
  - 决策通过 `toolApprovals.decide(callId, decision)` 回到协调器。
- 插件的 `AgentToolResultProps` 新增 `status?` / `approval?` / `onDecide?`，自定义卡
  可以用它们画自己的确认界面。
- 待审批期间 run 处于 `waiting-approval`（与计划审批共用 phase），会话标签显示
  "需要处理"；决定后回到 `waiting-tools`（还欠工具结果）或 `streaming`。

## 自测

```bash
pnpm --filter @kn/common check:tool-approval
```

覆盖：幂等/并发、超时拒绝、按会话取消、block、快照稳定性、状态机 phase 迁移、
executor 注入与无通道/抛错时的 fail closed。
