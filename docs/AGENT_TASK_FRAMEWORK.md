# Agent 任务框架（存算分离：客户端执行，服务端存储）

> **产品目标**：让用户通过 Plugin Studio 给插件加"要跑一会儿"或"要一直跑"的活——
> SSH 监控 Docker 日志、Jenkins 构建、后台抓数据——并且任务状态**持久化在服务端**，
> 刷新、关窗、换设备、重启应用后都能查到；agent 能等结果、能在有更新时被叫醒。
>
> **架构原则**：
>
> - **算在客户端**：插件/工具在渲染进程执行，持有 `AbortSignal`，上报进度/日志/结果。
> - **存在服务端**：任务记录、日志、订阅、待投递通知都在 MySQL；UI/agent 从服务端读。
> - **控制面在 HTTP**：租约 + 心跳 + 取消置位；客户端下一次心跳响应里看到取消。
> - **恢复是显式的**：客户端掉线 → `disconnected`；插件有 `resume` 才能接管，否则按策略失败。
>
> 本文是总览；后端表/API/调度见 [AGENT_TASK_SERVER.md](AGENT_TASK_SERVER.md)，
> 插件作者 API 与三个例子见 [PLUGIN_TASKS.md](PLUGIN_TASKS.md)。
>
> **范围之外**：`TaskMonitorEngine`（看板实时日志/规则，纯 UI 观测，不建 run、不进对话）、
> `background.*`（定时调度）、服务端托管执行（服务端不跑插件代码，也不拉起客户端进程）。

## 1. 三个场景，两种形态

| 场景 | 形态 | 结束 | 关键点 |
| --- | --- | --- | --- |
| SSH 盯 Docker 日志 | `watch` | 用户/agent 停止，或流断开 | 增量日志 + 按策略把"更新了啥"推给 agent |
| Jenkins 构建 | `job` | 构建结束 | 进度/日志/构建号/结果；掉线可轮询恢复 |
| 后台抓数据 | `job`（批量） | 抓完 | 进度/条数/结果；掉线一般不恢复，明确失败 |

`job` 和 `watch` 共用同一套 SDK 与存储；差异只在结束语义和默认通知策略。

## 2. 全景

```
┌────────────────────────── 客户端（渲染进程 / 插件） ──────────────────────────┐
│  defineTaskTool / runAsTask                                                  │
│    ├─ ClientExecutor：work(task)  →  task.progress / log / notify / signal    │
│    └─ ServerTaskStore：create / logs / heartbeat / finish / attach            │
│                                                                              │
│  UI：useTasks ── GET /bg-tasks（轮询/SSE）+ GET /logs                          │
│  Notes：useTaskNotes ── GET /notes/pending → 起新一轮 → ack                    │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ HTTPS（JWT）
┌───────────────────────────────────▼──────────────────────────────────────────┐
│ 服务端（knowledge-agent-skills）                                              │
│   BgTaskController ── BgTaskStore（MySQL：task / log / watch / note）          │
│   BgTaskLeaseSweeper（租约过期 → disconnected / cancelling → cancelled）        │
│   BgTaskWatchScheduler（订阅 → 合并 → note outbox）                            │
│   BackendTools：listTasks / getTask / getTaskLogs / cancelTask / watchTask…   │
└──────────────────────────────────────────────────────────────────────────────┘
```

关键：**服务端不执行任务**。它只接收客户端上报的状态/日志，按租约判断"还活着吗"，
按订阅生成待投递通知；agent 的查询工具直接读库，所以客户端断线也能看到 `disconnected`。

## 3. 统一模型

```ts
export type TaskState =
    | 'running'        // 租约有效，客户端在执行
    | 'cancelling'     // 已请求取消，等客户端确认
    | 'disconnected'   // 租约过期：工作可能还在外部跑（Jenkins），也可能已经没了
    | 'succeeded'
    | 'failed'
    | 'cancelled'

export interface TaskSnapshot {
    store: 'server' | 'local'      // server = 持久化；local = 明确的不持久化回退
    id: string
    kind: string
    title: string
    mode: 'job' | 'watch'
    state: TaskState
    owner: TaskOwner               // conversation / plugin / system
    progress: TaskProgress
    createdAt: number
    updatedAt: number
    finishedAt?: number
    error?: string
    result?: unknown
    resultTruncated?: boolean
    /** 当前仍保留的最小日志 seq；用于告诉调用方 dropped。 */
    logFirstSeq?: number
    logSeq?: number
    /** 掉线后可恢复？以及第几次执行。 */
    resumable: boolean
    attempt: number
    lastSeq?: number
    meta?: Record<string, unknown>
    /** 服务端算出的、给 UI 的提示（可恢复/已断开/无客户端）。 */
    hint?: string
}
```

```ts
export interface TaskProgress {
    percent?: number
    current?: number
    total?: number
    message?: string
}

export type TaskOwner =
    | { kind: 'conversation'; conversationId: string | null; runId?: string | null }
    | { kind: 'plugin'; pluginKey?: string; clientId?: string }
    | { kind: 'system' }

export interface TaskRef {
    store: 'server' | 'local'
    id: string
}
```

`server` 任务在服务端有唯一 `task_id`，`local` 只用于离线回退/单测。
`TaskOwner` 与原来一致（conversation / plugin / system），服务端据此做可见性。

## 4. 分层

### 4.1 客户端执行器

- `runAsTask` / `startTask`：登记任务，执行 `work(handle)`；`job` 可阻塞或后台，`watch` 永远后台。
- `TaskHandle`：`progress` / `log` / `notify` / `signal` / `cancelled` / `finish`。
- `runTask` 的终结逻辑统一：`work` 正常返回 → `finish('succeeded')`；抛错 → `finish('failed')`；
  `signal` 被 abort → `finish('cancelled')`。
- `finish` 被服务端拒绝（结果超 16KB、租约失效）必须让调用方看见；不能本地先 `finished=true`。

### 4.2 `ServerTaskStore`（主路径）

实现统一 `TaskStore`，但读写都走 HTTP：

| 方法 | 后端 |
| --- | --- |
| `start` | `POST /bg-tasks`（`clientTaskId` 幂等） |
| `progress` | `PATCH /bg-tasks/{id}`（500ms 节流） |
| `log` | 缓冲 → `POST /logs`（100ms/200 行） |
| `heartbeat` | `POST /heartbeat`；响应带 `cancelRequested` |
| `finish` | `POST /finish`；终态幂等 |
| `cancel` | `POST /cancel` + 本地 abort |
| `get/list` | `GET` + 本地缓存；面板打开时轮询/SSE |
| `attach` | `POST /attach`（恢复） |

### 4.3 `LocalTaskStore`（回退，不是主路径）

- 内存，刷新即丢；没有日志/心跳/跨设备。
- 只在服务端不可用且调用方显式允许时使用；UI 必须标"未持久化"。
- 单测/Web 预览可以用；生产默认不静默降级。

### 4.4 服务端存储与调度

- 四张表：`agent_bg_task` / `_log` / `_watch` / `_note`（见服务端文档）。
- 租约：create/attach 发 token，心跳续租；过期 → `disconnected`，不是立刻 failed。
- 取消：`cancel` 置位；客户端心跳看到后 abort；`cancel_deadline` 到期强制收敛。
- 订阅调度：`BgTaskWatchScheduler` 按 policy 合并日志/摘要，写 note outbox。
- 保留：每任务 5000 行日志、终态任务 7 天；清理是后台 job。

### 4.5 Agent 工具（服务端内置）

`listTasks` / `getTask` / `getTaskLogs` / `cancelTask` / `watchTask` / `stopWatch`
是 BackendTool，直接查库：

- 不再受客户端 90s 读工具死线约束，`getTask({wait:true})` 可以真的等 60s；
- 客户端刷新/断开后仍能查；
- `getTask` 拿到终态写 `consumed_at`，不再补完成 note；
- 旧工具名保留为别名（`listBackgroundTasks` / `getBackgroundTask` / `listLongTask`…），内部转调。

### 4.6 通知：服务端 outbox + 客户端投递

- 服务端只**生成** note（update / completion / ended），不直接起 run。
- 客户端在会话空闲时 `GET /notes/pending`，把 `text` 当一条用户消息发一轮，然后 `ack`。
- **积压要合并**：一次取一批（如 20 条），按会话/任务合并成一条（完成优先于更新），
  起一轮后 ack 全部；不要让面板关了两小时后一次冒出 30 轮。
- `ack` 前崩溃 → note 还在，下次重投（至少一次）；`noteId` 可去重。
- 面板关着不轮询 → note 留在服务端，不会像现在这样"关着就永远丢"。
- 后续可升级为服务端直接起 run（更接近 exactly-once），但第一版先走客户端投递。

### 4.7 产物

`TaskArtifacts` 仍在客户端：任务的 `artifact` 回调按 `running/succeeded/failed/cancelled`
各返回一次，合并进会话产物架。服务端只存任务状态/结果，不存产物的渲染数据。

## 5. 关键流程

### 5.1 job

```
tool → runAsTask(spec, work)
  → POST /bg-tasks            {taskId, leaseToken}
  → work(task)                 progress/log → PATCH /logs
  → finish(succeeded, result)  → 服务端入队 completion note
  → agent 若 getTask 过 → consumed_at 置位，不再重复通知
```

### 5.2 watch

```
tool → runAsTask({mode:'watch', updates:{level:'warn',…}}, work)
  → POST /bg-tasks + POST /{id}/watch
  → work 循环：task.log / task.notify
  → 心跳每 15s；服务端 scheduler 每 10s 合并 → note outbox
  → 客户端空闲时取 note → 起一轮 → ack
  → 用户/agent cancel → 服务端 cancelling → 心跳返回 cancelRequested
  → work 退出 → finish(cancelled)
```

### 5.3 掉线与恢复

```
客户端崩溃/刷新
  → 心跳停止 → 租约过期 → state=disconnected + 一条 state 日志
  → 客户端重启：GET /?clientId=…&state=disconnected
  → 插件有 resume：
       POST /{id}/attach → 新 leaseToken、attempt+1、lastSeq
       resume(task) 继续（Jenkins 重新 poll；Docker logs --since checkpoint）
    没有 resume / policy=never：
       UI 显示"已断开"；宽限期后 state=failed
```

`disconnected` 不是失败：它表示"执行者没了，但外部工作可能还在跑"。
是否恢复由插件声明（`resume_policy: auto|manual|never`），不能由框架替它猜。

## 6. 与旧系统的关系

| 旧 | 新 |
| --- | --- |
| renderer `BackgroundTaskRegistry`（`background: true`） | `ServerTaskStore` + `runAsTask`；A 也走服务端 |
| 主进程 `task.*`（插件长任务） | 保留为 legacy/offline；新插件用 `defineTaskTool` |
| `backgroundToolRunner` | `runAsTask` 的薄封装 |
| `useBackgroundTaskNotifications`（本地账本） | `useTaskNotes`（服务端 outbox） |
| `TaskMonitorEngine` | **不变**：看板实时日志/规则，独立观测，不参与任务存储 |

最终 A 和 B 都变成"客户端执行 + 服务端存储"的同一类任务，只是 `owner`（会话/插件）和
`capabilities`（有无日志、能否恢复）不同。

## 7. 迁移路径

| 阶段 | 内容 | 结果 |
| --- | --- | --- |
| **P1** | V47 建表；`BgTaskStore` + Controller；`create/logs/heartbeat/finish/list/get`；租约/sweeper | 服务端能存、能查，客户端可接 |
| **P2** | 客户端 `ServerTaskStore` + `runAsTask`/`defineTaskTool`（job）；插件作者可用 | Jenkins/抓取先跑通 |
| **P3** | `watch` + `_watch` + `WatchScheduler` + `notes` + `useTaskNotes`；`watchTask`/`stopWatch` | SSH 日志监控跑通 |
| **P4** | `attach`/`resume` + `disconnected` + 看板服务端列表/恢复按钮 | 刷新/重启可恢复 |
| **P5** | Plugin Studio：`plugin-authoring` skill、`task` 模板、文档、测试工具 | 用户一句话生成插件 |
| **P6** | 旧 `desktop.tasks`/`backgroundTasks` 降级/删除；`TaskMonitorEngine` 保持独立 | 清理 |

P1/P2 必须先有**契约测试**：客户端用假 HTTP 服务跑 store 契约；后端测租约/幂等/seq/取消。
P3 必须有**订阅去重/预算/多实例**测试；P4 必须有**kill 客户端 → 恢复**的 E2E。

## 8. 取舍与风险

1. **服务端是必需依赖**：持久化任务不能在离线时静默启动；离线只能显式 `LocalTaskStore`。
2. **日志量**：只保留最近 5000 行；高频 watch 应只 `notify` 关键行，`log` 用于详细展开。
3. **通知是至少一次**：客户端 ack 前崩溃会重投；用 `noteId` 去重。要做 exactly-once 需要
   服务端直接起 run 或 run 创建带幂等键，放到后续。
4. **恢复不是魔法**：没有 `resume` 的插件，掉线就是 failed；不要假装能恢复。
5. **不要服务端执行**：服务端没有 SSH/文件/浏览器能力；把执行搬过去会变成另一套插件运行时。
6. **不要吞掉 `finish` 失败**：结果超限、租约失效必须回给调用方，否则就是幽灵 `running`。
7. **不要把监控塞进来**：`TaskMonitorEngine` 继续直接读 `task.logsSince`/`dev.logsSince`，
   不经过任务存储；更新订阅是"agent 被叫醒"，两套预算/生命周期独立。

## 9. 验证

- 后端：`mvn -pl knowledge-service/knowledge-agent-skills -am test`（新增 store/controller/
  sweeper/scheduler 测试）。
- 客户端：`pnpm --filter @kn/common check:task-framework`（新增 ServerTaskStore 契约、
  日志批量/重试、取消、attach/resume）。
- 插件示例：一个假的 SSH 日志流 + 一个 Jenkins mock，跑通 job/watch/resume/note。
- 手工：启动 watch → 杀渲染进程 → 服务端 `disconnected` → 重开恢复 → note 到达；
  服务端关掉 → 客户端明确报错，不静默跑未持久化任务。