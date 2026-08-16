# Agent Framework V3 — 重新设计

## 0. 为什么必须重做

现有 V2 的问题不是单点 bug，而是职责耦合：

- `AgentJobService` 同时承担任务存储、配额、租约、事件分发、快照恢复、子任务调度。
- `DelegateTaskTool` 同时承担子任务创建、事件转发、结果评估。
- `ThinkHandler` 同时承担上下文续写、工具路由、错误分类。
- 前端 `V2AgentRuntime` 手写 SSE parser、重连、工具执行和 UI 生命周期。

继续打补丁会让每轮修改都产生新的边界问题。因此 V3 采用**小核心、显式状态、单一职责**。

## 1. 目标架构

```
Frontend
  UI Layer (Chat / Panel / Inline)
       │ 只消费 AgentClientEvent
       ▼
  @kn/agent-sdk
    AgentClient
    TaskSessionStore
    ToolExecutor
    EventParser / Reconnect
       │
Backend
  Agent V3 Transport  (/api/v3/agent)
    TaskController (REST/SSE)
       │
  AgentTaskSupervisor
    create / attach / resume / cancel / reconcile
    LeaseManager
    QuotaManager
       │
  AgentLoop (one per task)
    LoopStateMachine
    TurnPlanner
    ContextManager
    ToolGateway
       │
  Durable stores
    AgentTaskStore
    AgentEventStore
    AgentSnapshotStore
    ConversationStore
```

## 2. 核心不变量

1. **一个 task 只有一个 owner lease**。
2. **事件先落盘，后推送**。
3. **快照只保存可序列化状态，运行时句柄不入快照**。
4. **上下文压缩只改变中段，不改变稳定前缀**。
5. **同一 conversation 同时只允许一个 active task**；新 create 自动取消旧 task。
6. **前端只持有 taskId + lastSeq + pendingTools**，不从 UI 反推任务状态。

## 3. 后端模块

### 3.1 AgentTaskSupervisor
统一入口，不再散落在 Service/Controller：

- `create`：先清理同 conversation 旧任务，再检查配额，再抢 lease。
- `attach`：只读快照 + 事件日志。
- `resume`：仅接受 pending tool result / approval / continue。
- `cancel`：幂等，级联子任务。
- `reconcile`：续租、清理 stale、恢复可恢复任务。

### 3.2 AgentLoop
每个 task 一个 loop，不直接依赖 Spring MVC：

- `LoopStateMachine`：INIT → THINK → ACT → OBSERVE → terminal。
- 不使用 `windowUntil + collectList`，事件边产生边发射。
- `TurnPlanner` 决定 tool 调用与终止，不把 `length` 当 DONE。
- `ContinuationPolicy`：
  - `length` → 合并到同一 assistant message，继续；
  - 重复输出 → 熔断；
  - 自动续写不消耗用户可见迭代预算。

### 3.3 ContextManager
- 纯 token 预算管理，不混入 LLM handler。
- 三级策略：tool result eviction → summary → hard truncate。
- summary 使用独立模型配置与输入/输出上限。
- 所有压缩保持 system/tool prefix 稳定，尽量命中 provider cache。

### 3.4 ToolGateway
统一后端工具与前端工具：

- 所有工具统一为 `ToolSpec + ToolExecutor`。
- 前端工具暂停任务，等待 pending tool result。
- 后端工具超时可取消。
- 子任务通过 Supervisor 创建，不直接 `engine.run`。

### 3.5 Durable stores
- `AgentTaskStore`：任务状态与 owner lease 分离。
- `AgentEventStore`：只追加、按 seq 重放。
- `AgentSnapshotStore`：同步 checkpoint + 异步镜像。
- `ConversationStore`：跨 turn 的稳定 conversation。

## 4. API 契约

```
POST   /api/v3/agent/conversations
POST   /api/v3/agent/tasks
GET    /api/v3/agent/tasks/{id}
GET    /api/v3/agent/tasks/{id}/events?afterSeq=N
POST   /api/v3/agent/tasks/{id}/resume
POST   /api/v3/agent/tasks/{id}/cancel
DELETE  /api/v3/agent/conversations/{id}/active-task
```

事件协议统一为：

```json
{ "seq": 1, "type": "task.event", "event": { ... } }
```

不再有 legacy `/chat` 和 task API 两套语义。

## 5. 前端模块

### 5.1 AgentClient
唯一入口：

```ts
const task = await client.create({ conversationId, messages, tools })
for await (const event of client.events(task.id, { afterSeq })) { ... }
await client.resume(task.id, { toolResults })
await client.cancel(task.id)
```

- 不暴露 fetch/SSE parser 给 UI。
- 自动重连。
- `lastSeq` 持久化由 client 管理。

### 5.2 TaskSessionStore
- 每个本地 session 保存 `conversationId + taskId + lastSeq`。
- 清空聊天 = `cancel(activeTask)`，并且等待 cancel 成功后再创建新 task。
- 不再依赖 `isLoading` 判断是否要取消任务。

### 5.3 ToolExecutor
- 工具执行与 UI 解耦。
- 执行结果缓存，重放事件不会重复执行。
- 所有编辑器操作带 AI transaction meta。

## 6. 迁移计划

| 阶段 | 内容 | 风险 |
|---|---|---|
| P0 | 新建 `agent-v3-api` / `agent-v3-core` / `agent-v3-transport`，V2 继续运行 | 低 |
| P1 | `AgentTaskSupervisor` + 稳定 conversation + 单 active task | 低 |
| P2 | `AgentLoop` + `ToolGateway` + `ContextManager` | 中 |
| P3 | 前端 `@kn/agent-sdk` + Chat UI 切换 | 中 |
| P4 | 子任务接入 Supervisor，删除 V2 legacy 入口 | 高 |

## 7. 现阶段决策

- 不在旧 `AgentJobService` 上继续叠加状态。
- V3 先完成 P0/P1，跑通“创建-流式-取消-恢复”最小闭环。
- UI 和旧 V2 双轨运行，切换通过 feature flag。

