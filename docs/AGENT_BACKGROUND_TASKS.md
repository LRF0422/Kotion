# 长任务与后台执行（agent background tasks）

> 让「我让 agent 去 build 一个项目」这类几分钟的活不再占住整轮对话：
> 长工具可以 `background: true` 立即返回一个任务句柄，**要不要等它、什么时候等，由 agent 自己判断**。

## 为什么需要

前端工具调用和后端是**同步契约**：后端进入 `WAITING_TOOLS`，一直等到客户端回结果
（服务端工具超时 600s）。这对"改一行文档"是对的，对下面的活是错的：

- `installPluginDependencies` —— 走 npm/pnpm 联网装包，几十秒到几分钟；
- `buildPluginProject` / `runPluginProject` —— 冷启动、依赖多时要等；
- `publishPluginProject` —— 构建 + 上传产物 + 上传图标 + 提交审核。

干等的代价不只是"慢"：这期间模型不能做任何事，会话是一个转圈，
而且如果这次调用落在有文档的会话里，它还会占着**文档写锁**。

## 契约

### 1. 工具侧：`background: true`

长工具的参数里多一个可选布尔：

```jsonc
// buildPluginProject / runPluginProject / installPluginDependencies / publishPluginProject
{ "root": "/…/my-plugin", "background": true }
```

传了它，工具**立即**返回一个句柄，真正的活放到后台：

```json
{
  "background": true,
  "taskId": "bg-3",
  "tool": "buildPluginProject",
  "title": "构建 my-plugin",
  "status": "running",
  "startedAt": 1730000000000,
  "hint": "已在后台执行（taskId bg-3）。要继续等它跑完，调用 getBackgroundTask({ taskId: \"bg-3\", wait: true })…"
}
```

不传 = 原来的行为（阻塞到出结果）。同一条代码路径，只是"什么时候把答案给模型"不同。

### 2. Agent 侧：三个通用工具

| 工具 | 作用 |
| --- | --- |
| `listBackgroundTasks` | 列出**本会话**的后台任务：taskId / 工具 / 标题 / 状态 / 进度 / 是否已看过结果 |
| `getBackgroundTask` | 取状态与结果。`wait: true`（默认）会等到结束或超时；`timeoutMs` 默认 60s、上限 5 分钟。超时返回 `timedOut: true` + `status: "running"`，**不是失败** |
| `cancelBackgroundTask` | 停止等待：标记 cancelled、唤醒等待者、之后完成也不再通知。**不是杀掉后台动作**（见下） |

`taskId` 可以省略：本会话只有一个在跑的任务时就是它。

任务状态：`running` → `succeeded` | `failed` | `cancelled`。

### 3. 结果的两条投递路径（恰好一次）

任务结束时，结果只走其中一条：

1. **agent 自己等了**（`getBackgroundTask` 读到终态）→ 它已经拿到答案，不再打断它；
2. **agent 没有等** → 任务保持"待投递"，等这一轮 run 空闲下来后，
   宿主把结果作为一条通知推进对话（`takeUndelivered` 认领，只发一次）。

看一个 **还在跑** 的任务不算消费：`wait` 超时、或者 `wait: false` 只瞄一眼，结果仍然会投递。

### 任务的产物

后台任务不只带状态，还能带**它生产的产物**（artifact）——这是"长任务也能是产物"的关键，
因为一次 `background: true` 的工具结果只是一个句柄，transcript 里永远只有"它被要求做了"：

```
工具结果（transcript）  ──artifactFromResult──▶  占位产物（同一个 kind:id）
后台任务（任务板）      ──artifact 回调────────▶  运行中占位 → 结束换成真结果（bytes/modules/installed…）
产物架 = 会话派生的产物 ⊕ 任务的产物（同 kind:id，任务的更新）
```

- 注册表的 `artifact` 选项（`({ status, result, error }) => AgentArtifact | null`）在**启动**与**结束**各调一次；
  `backgroundToolRunner` 把这个通路暴露给插件工具。
- 运行期返回占位产物即可（`id` = 项目身份，如工程根目录）；结束时换成真结果。
- **失败/取消也要返回产物**：返回 null 只会把启动时那个占位留在架上，永远显示"还在构建"。
- 关卡由内核统一做：写坏的映射器只会少一件产物，不会影响任务本身。

## 实现位置（改这块要看哪）

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 框架 | [`packages/common/src/ai/agent/background-tasks.ts`](../packages/common/src/ai/agent/background-tasks.ts) | 任务注册表：`start` / `wait` / `cancel` / 订阅 / 待投递队列。进程内单例 `backgroundTasks` |
| 框架 | [`packages/common/src/ai/tools/background-tools.ts`](../packages/common/src/ai/tools/background-tools.ts) | 上表三个工具（按 `execCtx.conversationId` 限定在调用方会话） |
| 框架 | [`packages/common/src/ai/agent/use-background-task-notifications.ts`](../packages/common/src/ai/agent/use-background-task-notifications.ts) | 完成通知：run 忙时先攒着，空闲了再认领并交给宿主 |
| 框架 | [`use-editor-agent.ts`](../packages/common/src/ai/agent/use-editor-agent.ts) | 新增 `onBackgroundTaskSettled(tasks, note)` 选项；`useWorkspaceAgent` 透传 |
| 框架 | [`use-background-tasks.ts`](../packages/common/src/ai/agent/use-background-tasks.ts) | `useBackgroundTasks` / `useBackgroundTask`：订阅任务板（卡片、产物架据此实时更新） |
| 框架 | [`agent-artifacts.ts`](../packages/common/src/ai/kernel/agent-artifacts.ts) | 产物架把任务的产物合并到会话派生的产物之上（`mergeAgentArtifacts`，纯函数可测） |
| 工具注册 | [`packages/core/src/ai/tools/register.ts`](../packages/core/src/ai/tools/register.ts) | `createBackgroundTaskTools` 与 `load_skill` 并列注册 |
| 元数据 | [`discovery/tool-metadata.ts`](../packages/common/src/ai/discovery/tool-metadata.ts) | 三个工具 `scope: 'any'` + `requiresEditor: false`：工作台（没有文档）也要能等到、能查 |
| 首批接入 | [`packages/plugin-plugin-studio/src/studio-tools.ts`](../packages/plugin-plugin-studio/src/studio-tools.ts) | 四个长工具的 `background` 参数；`getBackgroundRunner` 注入 `backgroundToolRunner` |
| 通知落点 | `AIAssistantPanel` / `ChatConversation` / `KernelConversation` | 各自把通知变成一条消息 + 新一轮（历史由后端拥有，只发新增的那条） |

插件工具层刻意**不 import `@kn/common`**（它的测试直接在 Node 里跑），
所以后台能力是注入的：`StudioToolDeps.getBackgroundRunner` ← 插件入口传 `backgroundToolRunner`。
宿主不支持时传 `background: true` 会**报错说明**，而不是静默阻塞。

## 明确的边界（不要误解）

- **取消 ≠ 杀进程。** `dev.build` / npm 安装没有 abort 句柄，Promise 也不能"撤回"。
  `cancelBackgroundTask` 的语义是"不再等、不再通知"，迟到的结果会被丢弃。
  真要停开发会话，用 `stopPluginProject`。
- **注册表在内存里，随页面刷新消失。** 刷新后任务列表是空的；
  想知道宿主那边到底构建成没成，看 `dev.status` / `pluginProjectLogs`（开发台页面）。
  容量上限 100 条：**待投递的完成结果最后才被淘汰**（丢掉它就等于永远不告诉 agent）。
- **不做跨会话共享。** 一个会话看不到（也不会被通知）另一个会话的任务；
  显式传 `taskId` 能读，但列表与"省略 taskId"的解析只认自己的会话。
- **没有新增 UI 卡片。** 后台构建跑完仍会走原来的产物链路（`plugin-build` 产物、
  右侧预览、dev host 自动热更），会话里多的是那条通知消息。
- **面板关着（`AIAssistantPanel` 的 `open=false`）时不推进对话**：那会是一次用户看不见的
  模型调用；等用户打开面板再补上。会话标签页（`ChatConversation`）与之相反——多会话并行保活是
  它的既有语义，所以后台标签也会推进。
- **通知只在会话真正空闲（`phase === 'idle'`）时注入。** 三个面板都会在终态那一提交里
  `agent.reset()`，所以"完成即注入"会被那个 reset 掐掉；等 reset 完的 idle 提交再推。
  同一时刻完成的多件任务会合成一条通知；不同时刻完成的就是多次注入（各自一轮）。
- **预算/中断语义沿用既有机制。** 等 60s 的 `getBackgroundTask` 由服务端 600s 工具超时兜底；
  崩溃后续接遇到"已开始未完成"的工具调用仍是原有的 fail-closed（不会重复执行）。

## 自测

```bash
pnpm --filter @kn/common check:background-tasks   # 注册表 + 三个工具的行为契约
pnpm --filter @kn/plugin-plugin-studio test       # 开发台 4 个工具的 background 分支
```

`check:background-tasks` 覆盖：立即返回、等待消费结果、超时不消费、失败文案、
**任务的产物（运行/成功/失败/取消）与产物架的合并规则、`listSnapshot` 的引用稳定性**、
取消不复活（含"迟到成功不复活"）、会话隔离、进度/owner 标记、容量裁剪（待投递结果优先保留）、
"空闲才投递且只投一次"，以及工具层的 wait/超时/作用域/未知 id。此外它还**用真实的
`ToolProvider` + 真实的作用域规则**断言三件容易写错又看不见的事：工作台（无文档）也能拿到这三个
工具（元数据 `scope: 'any'`）、它们都带 schema、都不占文档写锁。`check` 总入口已包含它。
