# 插件长任务工具集（`task.*` + `@kn/common` SDK）

> **适用**：插件里任何"要跑一会儿"的活——同步、转码、下载、批量处理、装依赖、导出、索引重建……
> 需要向用户/agent 展示**状态、进度、增量日志**，并且能被**协作式取消**。
>
> **不适用**：定时调度（用 `background.*`）、构建日志（用 `dev.logsSince`）、
> AI 工具自己的 `background: true`（那是 agent 侧的任务通道，见 [AGENT_BACKGROUND_TASKS.md](AGENT_BACKGROUND_TASKS.md)）。

这套工具不是"给构建日志配一个 UI"，而是**一套完整的长任务基础设施**：

```
插件代码（渲染进程）
  ├─ @kn/common: runLongTask / startLongTask            ← 写侧：注册、进度、日志、取消、结果
  ├─ @kn/common: listLongTasks / getLongTask / hooks    ← 读侧：任意页面/监控/任务板
  └─ @kn/common: createInMemoryTaskBridge               ← 单测：不启动 Electron 也能测
        │  桌面桥 desktop.tasks（类型化 TaskBridge）
        ▼
Electron 主进程  task.*（9 条能力 + 事件）
  └─ 状态机 + 每任务 1000 行 seq 日志 + 心跳失联清扫 + 窗口归属
        │  广播 desktop:event:task
        ▼
消费方：后台任务面板「插件任务」 / agent 工具 / 你自己的 UI（hooks）
```

---

## 0. 30 秒接入

**最常见形态（跑完就结束）**

```ts
import { runLongTask } from '@kn/common'

const result = await runLongTask(desktop, {
    id: `my-plugin:sync:${spaceId}`,   // 稳定键（同 id 未跑完会被拒绝）
    kind: 'sync',
    title: `同步空间「${spaceName}」`,
}, async task => {
    task.progress({ percent: 10, message: '拉取列表' })
    task.info('connected')

    const pages = await fetchPages({ signal: task.signal })
    for (const [index, page] of pages.entries()) {
        task.progress({
            percent: Math.round(((index + 1) / pages.length) * 100),
            current: index + 1,
            total: pages.length,
        })
        task.info(`第 ${index + 1} 页`)
        await store(page)
    }
    return { pages: pages.length }        // ← 成为任务的 result，晚到的读者也能拿到
})
```

宿主/Web 端没有 `task.*` 时：**同一段代码照跑**，只是没有宿主状态（`available: false`），
不需要你自己 `if (desktop?.tasks)`。

**生命周期由你持有（流式/长连接）**

```ts
import { startLongTask } from '@kn/common'

const task = await startLongTask(desktop, { id: 'my-plugin:transcode:abc', title: '转码 视频.mp4' })
try {
    for await (const chunk of transcode(input, { signal: task.signal })) {
        task.log('info', `chunk ${chunk.index}`)
        task.progress({ current: chunk.index, total: chunk.count })
    }
    await task.finish('succeeded', { message: '完成', result: { bytes: output.size } })
} catch (error) {
    await task.finish('failed', { error: (error as Error).message })
    throw error
}
```

**在你自己页面里显示任务**

```tsx
import { useLongTasks } from '@kn/common'

const { tasks, loading, error, refresh } = useLongTasks({ kind: 'sync', limit: 20 })
```

**给任务写单测**

```ts
import { createInMemoryTaskBridge, runLongTask } from '@kn/common'

const host = createInMemoryTaskBridge()
await runLongTask(host.bridge, { title: 'demo' }, async task => { task.info('hi') })
assert.equal(host.tasks()[0].state, 'succeeded')
host.dispose()
```

---

## 1. 宿主能力 `desktop.tasks`（`TaskBridge`）

| 能力 | 方法 | 参数 | 返回 |
| --- | --- | --- | --- |
| `task.start` | `start` | `{ id?, kind?, title, root?, progress?, heartbeatMs? }` | `DesktopTaskSnapshot` |
| `task.report` | `report` | `{ taskId, progress?, logs? }`（`logs` ≤200 行/次） | `{ task, added }` |
| `task.logsSince` | `logsSince` | `{ taskId, sinceSeq?, limit? }` | `DesktopTaskLogsPage` |
| `task.list` | `list` | `{ state?, kind?, root?, limit? }`（默认 100，上限 500） | `DesktopTaskSnapshot[]` |
| `task.get` | `get` | `{ taskId }` | `DesktopTaskSnapshot \| null`（未知/淘汰返回 null，不抛） |
| `task.touch` | `touch` | `{ taskId }` | `DesktopTaskSnapshot`（心跳，SDK 自动调用） |
| `task.finish` | `finish` | `{ taskId, state?, message?, error?, result? }` | `DesktopTaskSnapshot`（终态幂等） |
| `task.cancel` | `cancel` | `{ taskId }` | `{ taskId, sessionId, state, cancelRequested }` |
| `task.remove` | `remove` | `{ taskId }` | `{ taskId, removed }`（仅终态） |

**事件** `desktop:event:task`（`desktop.tasks.onEvent(listener)` 订阅）：

| type | 何时 | 附带 |
| --- | --- | --- |
| `started` | 注册成功 | `task` |
| `progress` | `report` 有 `progress` | `task` |
| `log` | `report` 有新增日志行 | `task` + `lines` |
| `finished` | 进入终态（含心跳失联、窗口销毁） | `task` |
| `cancel-request` | 有人请求取消 | `task` |

> 事件可能丢：**日志的权威读取是 `logsSince` 游标**，事件只用来让 UI 及时刷新。

---

## 2. 数据模型

### `DesktopTaskSnapshot`

```ts
{
  id: string                 // 调用方的稳定键（或宿主随机）
  sessionId: string          // 本次 run 的 id：同 id 重跑会变，用于重置游标
  kind: string               // 插件自定义分类（"sync" / "transcode" / ...）
  title: string
  root?: string              // 可选：与工程关联（任务板/监控可用）
  state: 'running' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled'
  progress: { percent?: number; current?: number; total?: number; message?: string }
  createdAt: number
  updatedAt: number
  finishedAt?: number
  error?: string             // failed 时
  seq: number                // 最后一条日志的 seq（0 = 无）
  total: number              // ring 中当前保留行数
  result?: unknown           // 终态附带的 JSON 结果（≤16KB）
  heartbeatMs?: number       // 声明了心跳才有
  lastHeartbeatAt?: number
}
```

### 日志游标（与 `dev.logsSince` 同形）

- 每任务 ring **1000 行**，每条带**单调 `seq`**（从 1 开始，淘汰不回退）。
- 去重：与上一条 `(level, message)` 相同且间隔 <1000ms 的行会被丢弃（宿主自己打时间戳）。
- `dropped` = ring 淘汰数 + `limit` 截断数。**>0 时 UI 必须如实显示"已丢弃 N 行"**，不要当成完整历史。
- `sessionId` 变化 = 同 id 开了新一次 run：**重置游标从 0 开始**。
- 每次轮询把上次的 `nextSeq` 传回 `sinceSeq`；轮询间隔建议 ≥500ms，不要反复读全量。

---

## 3. SDK：写侧

### `startLongTask(desktop, options): Promise<LongTaskHandle>`

| 选项 | 说明 |
| --- | --- |
| `id` | 稳定键，建议带插件前缀；同 id 运行中再次 start 会被拒绝，已结束则开新 run |
| `kind` | 分类，默认 `plugin` |
| `title` | 一行标题（≤200 字） |
| `root` | 可选，关联工程 |
| `progress` | 初始进度（通常省略） |
| `flushIntervalMs` | 日志批量上报间隔，默认 100ms；`0` = 逐行（测试用） |
| `heartbeatMs` | 心跳间隔，默认 30000；`0` 关闭（关闭后宿主不再做失联清扫） |

句柄：

| 成员 | 说明 |
| --- | --- |
| `id` / `sessionId` / `available` / `snapshot` | 身份与最近快照；`available=false` 表示本地降级 |
| `signal` | 宿主 `cancel-request` 时 abort；**你的代码必须检查它** |
| `progress(p)` | 立即上报（合并语义） |
| `log(level, message)` / `info` / `warn` / `error` | 批量上报，永不抛出 |
| `flush()` | 立即发送队列（`finish` 会先 flush） |
| `logsSince({ sinceSeq?, limit? })` | 读自己的日志（一般给 UI 用） |
| `finish(state?, detail?)` | 终态；`detail` 可为字符串（message）或 `{ message?, error?, result? }`；幂等、永不抛 |

### `runLongTask(desktop, options, body): Promise<T>`

- 正常返回 → `finish('succeeded')`，body 的返回值（非 `undefined`）自动成为 `result`；
- 抛错 → `finish('failed', { error })` 并**原样抛出**；
- 取消 → `AbortSignal` abort，`finish('cancelled')`，抛 `AbortError`。

### 降级

| 宿主 | 行为 |
| --- | --- |
| 桌面 + `task.*` | 完整能力 |
| Web / 旧桌面（无 `desktop.tasks`） | 返回本地 no-op 句柄：`available:false`、`signal` 仍可用（只能手动 abort）、`finish` 返回 null；工作照跑 |
| 有 `tasks` 但无 `touch`（旧桌面） | 心跳静默跳过，不做失联判定 |

---

## 4. SDK：读侧

```ts
listLongTasks(desktop, options?): Promise<DesktopTaskSnapshot[]>       // 无宿主 → []
getLongTask(desktop, taskId): Promise<DesktopTaskSnapshot | null>      // 无宿主/未知 → null
cancelLongTask(desktop, taskId): Promise<DesktopTaskCancelResult | null>
onLongTaskEvent(desktop, listener): () => void                          // 无宿主 → noop
```

React hooks（事件驱动 + 首次拉取 + 卸载清理 + SSR 安全）：

```ts
useLongTasks({ state?, kind?, root?, limit?, enabled? }): {
    tasks: DesktopTaskSnapshot[]
    loading: boolean
    error: string | null
    refresh: () => void
}
useLongTask(taskId, { enabled? }): DesktopTaskSnapshot | null
```

`enabled: false` 时**不拉取、不订阅**、保留上次快照——面板/抽屉关着时必须传它，避免常驻组件空转。

> 设计约定：读侧 helper 与 hooks **永不抛错**（宿主缺失 → 空值；读失败 → 保留旧数据 + `error`）。
> 长任务的状态展示不该让页面挂掉。

---

## 5. 生命周期与失败语义

```
running ──cancel──▶ cancelling ──finish(cancelled)──▶ cancelled
   │                    ├──finish(succeeded)──────────▶ succeeded
   │                    └──finish(failed)─────────────▶ failed
   ├──finish(succeeded/failed)────────────────────────▶ 终态
   ├──心跳 3 次未到（heartbeatMs>0）──────────────────▶ failed（stale）
   └──拥有它的窗口销毁/刷新───────────────────────────▶ failed
```

- **终态幂等**：`finish` 重复调用不抛、不覆盖已存 `result`；插件 `finally` 里可以放心再调。
- **心跳失联**：声明了 `heartbeatMs` 的任务，宿主每 10s 清扫一次，静默 > 3×`heartbeatMs` → `failed`，
  `error = stale: no heartbeat for <ms>ms`。没声明心跳的任务**永不**被清扫。
- **窗口归属**：任务记录创建它的窗口；窗口销毁/刷新时其名下 running 任务置 `failed`
  （工作确实随模块消失，假装还在跑是撒谎）；已结束任务与日志保留。
- **容量**：全局最多保留 **200** 个任务；满了先淘汰最旧的**已结束**任务，绝不淘汰运行中的。
  每任务日志最多 **1000** 行。
- **同 id**：运行中重复 `start` 拒绝；上一个 run 已结束则开新 run（新 `sessionId`、`seq` 从 1 重来）。
- **不做**跨应用重启持久化（任务随 app run 结束；运行中的工作本来也会随进程结束）。
- **`remove`** 只删终态任务，用于"清理历史"；运行中的任务先 `cancel`/`finish`。

---

## 6. 进度与日志最佳实践

- **进度**：`percent` 夹在 0–100；`current`/`total` 由宿主原样保存（不推导百分比）。合并语义：
  一次只传变化的字段。高频进度（>2 次/秒）没有意义，UI 也不会更快。
- **日志**：写"人话"和关键事实（URL、页数、重试、用量），不要打完整 payload/二进制；
  SDK 默认 100ms 批量上报，一次最多 200 行。
- **不要**用日志当数据通道：需要给后续读者的结构化结果放 `result`。
- 日志里避免 token/密码等敏感信息：任务板、agent、监控都能读到它。
- 长任务期间请**定期 `progress`/`log`**（至少每 `heartbeatMs/3`），否则声明了心跳会被判失联。

---

## 7. 结果 `result`

- 只在 `finish` 时提交，落进快照，供任务板 / agent / 监控**事后**读取。
- 必须 `JSON.stringify` 可序列化，**UTF-8 序列化 ≤ 16KB**；超限报 `TASK_RESULT_TOO_LARGE`，
  不可序列化报 `TASK_RESULT_INVALID`。
- 适合放：`{ pages: 42, artifactId: 'art_123', warnings: 2 }`。
  不适合：二进制、base64 大文件、完整 HTML（用文件/产物能力存，`result` 只放引用）。

---

## 8. 取消（协作式，不是杀进程）

- `desktop.tasks.cancel({ taskId })` → 状态 `cancelling` + 广播 `cancel-request`；
- `runLongTask` / `startLongTask` 把它映射为 `AbortSignal`；
- **宿主不会杀渲染进程里的工作**。必须自己检查 `signal.aborted`（或把 signal 传给 fetch/stream），
  停下后 `finish('cancelled')`；
- 用户/agent 看到的文案会明确写"请求停止，不一定立刻停"——不要指望平台替你收尾。

---

## 9. 三处消费方（开箱即用）

| 消费方 | 位置 | 能做什么 |
| --- | --- | --- |
| **任务板** | 聊天头部 →「后台任务」→「插件任务」区 | 进度、耗时、实时日志（增量/丢弃提示）、结果/错误、请求取消；**页面刷新后仍在**（主进程持有） |
| **agent** | 4 个内置工具 | `listLongTasks`（列表）、`getLongTask`（可等 60s/上限 80s，超时不是失败）、`getLongTaskLogs`（按 `nextSeq` 增量 + level/grep）、`cancelLongTask`（协作式） |
| **你自己的 UI** | `useLongTasks` / `useLongTask` | 任意页面嵌任务列表/单任务进度；事件驱动，不用手写轮询 |
| **监控引擎** | `TaskMonitorEngine`（`packages/common/src/ai/tasks/`） | 任务板首次打开时自动为**运行中的插件任务**建监控（上限 8 并发）：默认规则 = error 日志，命中产 `trigger` 事件，任务行显示「N 条告警」；cursor 持久化，刷新后续读（`task.logsSince` 与构建日志共用同一个 reader 契约 `MonitorSource`） |

监控的接线是**自动的**（`task-monitor-host.ts` 的 `attachLongTaskMonitors`）：
`started` → 建监控，`finished` → `notifySettled` 停监控；超出 8 个并发时静默跳过（任务仍在任务板可见，只是没有告警角标）。
需要自定义规则/节流时直接调引擎：

```ts
import { taskMonitor, monitorSourceKey } from '@kn/common'

taskMonitor.start({
    source: { kind: 'task', taskId },
    label: task.title,
    triggers: [{ kind: 'level', level: 'warn' }, { kind: 'pattern', pattern: 'retrying' }],
})
// 任务结束时（否则只能等 cadence.maxDurationMs 自然过期）
taskMonitor.notifySettled({ kind: 'task', taskId })
```

agent 工具的价值：插件长任务跑起来后，用户可以问"刚才那个同步到哪了 / 卡在哪一步"，
模型能直接读状态和日志，而不是让用户复制粘贴。

---

## 10. 插件单测（不需要 Electron）

```ts
import { createInMemoryTaskBridge, runLongTask } from '@kn/common'

const host = createInMemoryTaskBridge({ now: () => clock })
const seen: string[] = []
host.bridge.onEvent(event => seen.push(event.type))

await runLongTask(host.bridge, { id: 't1', title: 'demo' }, async task => {
    task.progress({ percent: 50 })
    task.info('half')
    return { ok: true }
})

const [task] = host.tasks()
assert.equal(task.state, 'succeeded')
assert.deepEqual(task.result, { ok: true })
assert.equal(task.progress.percent, 50)
assert.deepEqual((await host.bridge.logsSince({ taskId: 't1' })).entries.map(e => e.message), ['half'])
host.dispose()
```

内存桥与宿主语义对齐（seq、ring、去重、同 id 新 run、终态幂等、result 校验、触摸/删除、事件），
可以直接当 fake 传给 `startLongTask` / `runLongTask` / agent 工具工厂。

---

## 11. 限制与错误

| 限制 | 值 |
| --- | --- |
| 保留任务数 | 200（满时淘汰最旧终态任务） |
| 每任务日志 | 1000 行；单次 `report` ≤200 行 |
| 日志去重窗口 | 同 `(level,message)` 1s |
| `result` | ≤16KB（UTF-8 序列化） |
| `heartbeatMs` | 1000–600000；失联阈值 3×；清扫周期 10s |
| `id` | `^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$` |
| `list` / `logsSince` 上限 | 500 / 1000（默认 100 / 200） |

错误码写在 message 里（IPC 只保留文本，不引入 Error 子类）：

| 场景 | message 片段 |
| --- | --- |
| 未知任务（`touch`/`remove`/`cancel`） | `TASK_NOT_FOUND` |
| 运行中任务被 `remove` | `TASK_RUNNING` |
| `result` 超限 / 不可序列化 | `TASK_RESULT_TOO_LARGE` / `TASK_RESULT_INVALID` |
| 同 id 正在运行 | `already running`（`task.start`） |
| 心跳失联（宿主写入 `error`） | `stale: no heartbeat for Nms` |

---

## 12. 非目标（有意不做）

- **不跨应用重启持久化**：任务随 app run 结束。需要跨重启的"结果"请落到业务数据/产物里。
- **不做调度**：周期执行用 `background.*`，长任务只描述"这次执行"。
- **不杀进程**：取消是协作式的。
- **不把任务日志塞进 AI 对话/transcript**：agent 通过工具按需读取；对话历史不被日志污染。
- **不做权限模型**：`task.*` 是宿主机能力，插件在渲染进程本就拥有同等代码权限；不要在任务标题/日志里放密钥。

---

## 13. 与既有机制的关系

| 机制 | 关系 |
| --- | --- |
| `background.*` | 负责"何时执行"（主进程定时器）；`task.*` 负责"执行时的状态/进度/日志/取消"。可组合：定时器触发后 `runLongTask`。 |
| `dev.logs` / `dev.logsSince` | dev-server 构建日志专用（`TaskMonitorEngine` 用它做构建日志监控）。 |
| AI `background: true` 工具 | agent 侧任务通道（renderer 注册表 + 完成通知）；插件若同时用 `task.*` 上报，用户与 agent 都能看见。 |
| 监控引擎 / 任务板 | `TaskMonitorEngine` 以 `MonitorSource` 同时支持 `dev`（构建日志）与 `task`（本工具集）两种源；插件任务默认按 error 规则监控（详见 §9）。 |
| `notification.*` | 任务完成想弹系统通知，自己调；`task.*` 不发通知。 |

---

## 14. 自测

```bash
# 主进程状态机（纯 Node，59 条）
node apps/desktop/src/main/capabilities/tasks.test.mjs

# SDK + hooks + 内存桥 + agent 工具（68 条）
pnpm --filter @kn/common check:long-tasks

# 能力四方对齐（union / contract / catalog / preload / handler）
pnpm --filter @kn/common check:desktop-capabilities
```

---

## 15. FAQ

**Q：任务在任务板里一直 running？**
A：没声明 `heartbeatMs`（SDK 默认 30s，除非你显式传 0）或插件崩溃。声明心跳后宿主 3× 未收到心跳会置 `failed`。

**Q：日志缺行 / `dropped > 0`？**
A：ring 1000 行被写满，或单次 `limit` 截断。按 `nextSeq` 增量读、提高轮询频率，别把 `dropped` 当 0。

**Q：同 id 再 start 报"already running"？**
A：上一次 run 还没结束。先 `cancel` 并等插件 `finish('cancelled')`，或换一个 id。

**Q：能传 `Date`/`Map`/类实例当 result 吗？**
A：不能，必须 JSON 可序列化（宿主会做 JSON 往返克隆）。用 `toISOString()`／普通对象。

**Q：Web 端能用吗？**
A：SDK 自动降级为本地 no-op；任务板与 agent 工具不显示。业务代码无需分支。