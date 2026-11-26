# 插件后台任务（Plugin Studio 接入指南）

> **状态：设计稿。** 文中的 `defineTaskTool` / `runAsTask` / `watchTask` 是目标 API，
> 尚未实现；实现顺序见 [AGENT_TASK_FRAMEWORK.md](AGENT_TASK_FRAMEWORK.md) 的迁移路径。
>
> 目标读者：用 Plugin Studio 写插件的作者，以及替他们写代码的 agent。
> 这套 API 解决的是：插件里"要跑一会儿"或"要一直跑"的活，怎么登记成**服务端持久化**的任务，
> 让用户看得见、停得掉，让 agent 能等结果、能在有新输出时被叫醒。
>
> **存算分离：客户端执行，服务端存储。** 插件在渲染进程干活；任务记录、日志、订阅、
> 待投递通知都在服务端 MySQL。刷新、关窗、换设备后仍能查到状态；执行者不在了就是
> `disconnected`，有 `resume` 的插件可以重新接管。

## 1. 三种典型任务

| 场景 | 形态 | 什么时候结束 | 用户/agent 关心什么 |
| --- | --- | --- | --- |
| Jenkins 构建 | `job` | 构建结束（成功/失败） | 进度、日志、构建号、结果 |
| SSH 监控 Docker 日志 | `watch` | 用户/agent 停止，或 SSH 流断开 | 新日志、错误、变更摘要 |
| 起个后台任务抓数据 | `job`（批量） | 抓完 | 进度、条数、结果 |

两种形态共用一套 SDK；区别只在 `mode` 和默认的"结束/通知"策略。

## 2. 30 秒接入

```ts
import { defineTaskTool } from '@kn/common'

export const crawlSite = defineTaskTool({
    name: 'crawlSite',
    description: '抓取一个站点并返回结构化结果；页数多时在后台跑。',
    inputSchema: {
        type: 'object',
        properties: {
            url: { type: 'string' },
            maxPages: { type: 'number' },
        },
        required: ['url'],
    },
    scope: ['any'],
    task: {
        kind: 'scrape',
        mode: 'job',
        title: args => `抓取 ${args.url}`,
        // 默认后台；传 false 可让工具阻塞到结果（适合几秒就完的活）
        background: args => args.background !== false,
    },
    async run(args, task, ctx) {
        const pages = await discover(args.url, args.maxPages ?? 20)
        task.progress({ current: 0, total: pages.length, message: '开始抓取' })

        const rows = []
        for (const [index, page] of pages.entries()) {
            if (task.signal.aborted) break
            const batch = await scrape(page)
            rows.push(...batch)
            task.log('info', `第 ${index + 1}/${pages.length} 页：${batch.length} 条`)
            task.progress({ current: index + 1, total: pages.length })
        }
        return { count: rows.length, sample: rows.slice(0, 20) }
    },
})
```

`defineTaskTool` 返回一个普通的 `AgentToolDefinition`，直接放进 `KPlugin.tools` 即可。
它会自动：

- 给 `job` 工具补一个 `background` 参数（作者不用自己写）；
- 调服务端 `POST /bg-tasks` 登记任务；进度/日志/心跳/结果都通过 API 上报并持久化；
- 把 `taskId` / `watchId` 和一段 `hint` 返回给模型；
- 在结束时把结果挂到任务上，服务端生成完成 note（agent 没 getTask 过就通知）；
- 刷新/换设备后 UI 仍能查到；执行者掉线后是 `disconnected`，不是立刻 failed。

## 3. `job` 与 `watch`

```ts
task: {
    kind: 'ssh-docker-logs',
    mode: 'watch',
    title: args => `监控 ${args.container} 日志`,
    updates: args => ({
        level: args.level ?? 'warn',      // 只推 warn/error
        match: args.match ? [args.match] : undefined,
        minIntervalMs: 120_000,           // 至少 2 分钟合并一次
        maxNotes: 30,                     // 最多推 30 条
        maxDurationMs: 2 * 60 * 60_000,   // 最多盯 2 小时
    }),
}
```

- `job`：`run` 正常返回 → `succeeded`；抛错 → `failed`。框架默认**阻塞**；作者可以设
  `background: args => args.background !== false` 让默认后台（本文的例子都这么做），
  模型传 `background: false` 就能等结果。
- `watch`：**永远后台**，`run` 通常是一个 `for await` 循环，直到 `task.signal` 被 abort。
  - 用户/agent 停止 → `cancelled`（不是失败）；
  - 流自然结束（SSH 断开）→ `succeeded`，结果里写原因；
  - 窗口被关/刷新 → 心跳停止、租约过期 → 服务端置 `disconnected`；
    有 `resume` 的插件可以重新接管，否则宽限期后置 `failed`。

`watch` 不是"无限跑"的借口：插件必须监听 `task.signal`，在 abort 时关闭 SSH 流、HTTP 请求、
文件句柄；否则任务会停在 `cancelling`，直到服务端的取消宽限期把它收敛。

### 3.1 掉线恢复（可选，但外部任务很值得做）

客户端刷新/崩溃后，租约过期，服务端把任务置 `disconnected`。如果这个任务对外部系统是
"可重连"的（Jenkins build 还在跑、Docker 容器还在输出），给它一个 `resume`：

```ts
task: {
    kind: 'jenkins-build',
    mode: 'job',
    resumable: true,
    resumePolicy: 'auto',      // auto | manual | never
    title: args => `Jenkins ${args.job}`,
},
async run(args, task, ctx) { /* 首次执行 */ },
async resume(task, ctx) {
    // task.meta / task.checkpoint / task.lastSeq 都在
    const build = await jenkins.getBuild(task.meta.job, task.checkpoint.buildNumber)
    for await (const update of jenkins.watch(build, { signal: task.signal })) {
        task.log(update.level ?? 'info', update.line)
    }
    return { job: task.meta.job, buildNumber: build.number, status: build.result }
},
```

- `auto`：安全的外部轮询/重连，客户端启动时自动接管；
- `manual`：看板显示"恢复"，用户点了才跑；
- `never`：抓取/有副作用的 job，掉线即 `failed`，不自动重跑。

恢复时 `attempt` 会 +1，日志 `seq` 不会回退；作者在运行中用 `task.setCheckpoint(...)`
持久化断点（例如最后一条日志的时间戳、Jenkins build 号），`resume` 里从 `task.checkpoint` 读。

## 4. `TaskContext`：作者能用的东西

```ts
export interface TaskContext {
    readonly id: string
    readonly ref: TaskRef
    readonly signal: AbortSignal
    readonly cancelled: boolean

    /** 结构化进度：百分比 / 当前-总数 / 一句话。 */
    progress(progress: TaskProgress): void
    /** 一行日志：进任务的 seq 日志环，UI 可实时看，agent 可按增量读。 */
    log(level: TaskLogLevel, message: string): void
    /** 一条"值得告诉用户"的摘要：被更新订阅合并后推给 agent。 */
    notify(summary: string, options?: { level?: TaskLogLevel; data?: unknown }): void
    /** 持久化断点（Jenkins build 号、日志时间戳…）；resume 时读回。 */
    setCheckpoint(value: unknown): void
    readonly checkpoint: unknown
}
```

三个通道的分工：

| 通道 | 去哪 | 谁看 | 频率 |
| --- | --- | --- | --- |
| `progress` | 任务快照 | 看板一行、agent 的 `getTask` | 变化时 |
| `log` | 任务日志环（seq） | 看板实时日志、`getTaskLogs` | 可以很密（SDK 批量） |
| `notify` | 更新订阅的摘要 | agent 的更新通知 | 应该很稀（阶段变化/错误） |

`log` 不是 transcript：它不会进对话历史，也不该被用来"跟模型说话"。
要模型知道的，用 `notify`；要用户自己看的，`log` 就够。

## 5. "每当有更新就告诉我更新了啥"

### 5.1 自动订阅

`watch` 任务在启动时，如果 `updates` 不是 `false`，框架会自动为**发起它的会话**建一个
`TaskSubscription`。省略 `updates` 时用默认策略：`level: 'info'`、`minIntervalMs: 120_000`、
`maxNotes: 30`、`maxDurationMs: 2h`；`updates: false` 完全关闭自动订阅。

```jsonc
{
  "background": true,
  "taskId": "task_abc",
  "mode": "watch",
  "status": "running",
  "watch": {
    "id": "watch_1",
    "level": "warn",
    "everyMs": 120000,
    "maxNotes": 30,
    "maxDurationMs": 7200000
  },
  "hint": "已在后台监控。有新的 warn/error 时会按策略通知你，不要反复轮询；用 getTaskLogs 看完整增量，用 cancelTask 停止。"
}
```

模型拿到 `watch.id` 后可以：

- `watchTask({ taskId, level, match, minIntervalMs, maxNotes })`：改策略（新建/替换订阅）；
- `stopWatch({ watchId })`：停止通知（任务继续跑）；
- `cancelTask({ taskId })`：停止任务本身（协作式）。

### 5.2 通知长什么样

按 `minIntervalMs` 合并后，注入一条（不是每行一条）：

```
【任务更新】监控 api 日志 (task_abc)
过去 2 分钟新增 42 行（seq 880–921），其中 error 3 行、warn 6 行。
关键行：
[error] 2026-11-26 14:31:02 connection refused ...
[warn]  2026-11-26 14:31:05 retry 3/5 ...
[info]  2026-11-26 14:31:07 reconnected
（完整增量：getTaskLogs({ taskId: "task_abc", sinceSeq: 880 })）
```

规则：

- **只在会话空闲（`phase === 'idle'`）时注入**；忙的时候待发，继续合并，不丢。
- **不重复**：一条订阅的每条 note 只投递一次；任务结束时补一条完成/失败通知（可关）。
- **有预算**：`maxNotes`（默认 30，上限 100）、`maxDurationMs`（默认 2h，0 = 到任务结束）。
  到顶后推一条"通知已停止，任务仍在运行"，订阅结束，任务不受影响。
- **不刷屏**：`minIntervalMs` 最小 10s；默认 120s。错误类可以更短（30s），由插件/agent 决定。
- **面板关着不轮询**：客户端只在会话空闲时取 note；面板关着时 note 留在服务端，
  打开后合并成一条，不会像本地内存那样丢掉。
- **note 是 user 角色消息**：当前协议只能这样。prefix `【任务更新】` 让用户/模型能区分；
  以后若要"系统事件"样式，需要后端 transcript 支持，不在本期。

### 5.3 和"输出监控"不是一回事

- **更新订阅**（本文）：任务 → agent，按策略唤醒模型，进对话。是任务交付的一部分。
- **TaskMonitorEngine**（另一条线）：任务日志 → 看板行内实时日志，规则/告警，**不建 run、不进对话**。

两者都读 `logsSince`，但生命周期、预算、UI 都独立。不要把监控的 cursor/规则塞进任务框架，
也不要用更新订阅去实现"看板实时日志"。

## 6. 三个完整例子

### 6.1 Jenkins 构建（job）

```ts
export const triggerJenkinsJob = defineTaskTool({
    name: 'triggerJenkinsJob',
    description: '触发 Jenkins 构建；构建较久时在后台跑，完成后返回构建号和结果。',
    inputSchema: {
        type: 'object',
        properties: {
            job: { type: 'string' },
            params: { type: 'object' },
        },
        required: ['job'],
    },
    scope: ['any'],
    task: {
        kind: 'jenkins-build',
        mode: 'job',
        title: args => `Jenkins ${args.job}`,
        background: args => args.background !== false,
        artifact: (state, args) => state.result
            ? {
                kind: 'jenkins-build',
                id: `${args.job}#${(state.result as any).buildNumber}`,
                title: `${args.job} #${(state.result as any).buildNumber}`,
                data: { status: (state.result as any).status },
            }
            : null,
    },
    async run(args, task, ctx) {
        const jenkins = ctx.resolveService('jenkinsService')
        const build = await jenkins.build(args.job, args.params, { signal: task.signal })
        task.progress({ message: `#${build.number} 已排队` })

        for await (const update of jenkins.watch(build, { signal: task.signal })) {
            task.log(update.level ?? 'info', update.line)
            task.progress({ percent: update.percent, message: update.stage })
            if (update.stageChanged) task.notify(`#${build.number} 进入 ${update.stage}`)
        }
        return {
            job: args.job,
            buildNumber: build.number,
            status: build.result,
            url: build.url,
        }
    },
})
```

### 6.2 SSH 监控 Docker 日志（watch）

```ts
export const watchContainerLogs = defineTaskTool({
    name: 'watchContainerLogs',
    description: '持续监控某个 Docker 容器的日志；有新错误/关键字时按策略通知。',
    inputSchema: {
        type: 'object',
        properties: {
            host: { type: 'string' },
            container: { type: 'string' },
            level: { type: 'string', enum: ['info', 'warn', 'error'] },
            match: { type: 'string' },
        },
        required: ['host', 'container'],
    },
    scope: ['any'],
    task: {
        kind: 'ssh-docker-logs',
        mode: 'watch',
        title: args => `监控 ${args.container} 日志`,
        updates: args => ({
            level: args.level ?? 'warn',
            match: args.match ? [args.match] : undefined,
            minIntervalMs: 120_000,
            maxNotes: 30,
            maxDurationMs: 2 * 60 * 60_000,
        }),
    },
    async run(args, task, ctx) {
        const ssh = ctx.resolveService('desktop').ssh
        const shell = await ssh.shell({ host: args.host })
        const close = () => { void ssh.shellClose({ sessionId: shell.sessionId }) }
        task.signal.addEventListener('abort', close)

        let buffer = ''
        const off = ssh.onShell(event => {
            if (event.sessionId !== shell.sessionId) return
            if (event.type === 'shell-exit') { task.notify('SSH 会话已退出'); close(); return }
            if (event.type !== 'shell-data') return
            buffer += event.data
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) {
                if (!line.trim()) continue
                task.log(levelOf(line), line)
                if (/\b(error|exception|fatal)\b/i.test(line)) {
                    task.notify(`错误: ${line.slice(0, 160)}`, { level: 'error' })
                }
            }
        })

        try {
            await ssh.shellWrite({
                sessionId: shell.sessionId,
                data: `docker logs -f --tail 0 ${args.container}\n`,
            })
            // watch 任务：一直跑，直到被 abort 或 SSH 退出
            await new Promise<void>(resolve => {
                task.signal.addEventListener('abort', () => resolve())
                ssh.onShell(event => {
                    if (event.sessionId === shell.sessionId && event.type === 'shell-exit') resolve()
                })
            })
            return { reason: 'stopped' }
        } finally {
            off()
            close()
        }
    },
})
```

> SSH 的 `exec` 是缓冲到结束才返回的，**不适合** `docker logs -f`；用 pty（`ssh.shell` + `onShell`）
> 或插件自己的流式实现。上面是示意，真实代码要处理分块、ANSI、断线重连和命令注入转义。

### 6.3 抓数据（job / batch）

```ts
export const crawlSite = defineTaskTool({
    name: 'crawlSite',
    // ... 同 §2
    async run(args, task) {
        const pages = await discover(args.url)
        const rows = []
        for (const [index, page] of pages.entries()) {
            if (task.signal.aborted) break
            rows.push(...await scrape(page))
            task.progress({ current: index + 1, total: pages.length })
            if ((index + 1) % 10 === 0) task.notify(`已抓 ${index + 1}/${pages.length} 页`)
        }
        return { count: rows.length, rows: rows.slice(0, 500) }
    },
})
```

## 7. 取消、心跳与生命周期

- **取消是协作式的**：`cancelTask` / 看板"停止" → 服务端置 `cancel_requested` →
  客户端心跳响应带回 → SDK abort `signal`。插件必须让 `run` 退出；服务端不会杀客户端进程。
- **宽限期**：插件不响应时，任务停在 `cancelling`；服务端在 `cancel_deadline`（默认 60s）
  到期后置 `cancelled`，避免永久占位。
- **心跳**：SDK 默认 15s 一次，服务端租约 = 3×心跳；`run` 卡在事件循环里也能发（定时器独立）。
  窗口被系统节流时可能漏拍，长 watch 建议 `heartbeatMs: 30_000` 或在循环里 `task.touch()`。
- **刷新/关窗**：任务工作随渲染进程消失；租约过期后服务端置 `disconnected`。
  状态和日志仍在，插件有 `resume` 时可以恢复；没有就按 `resume_policy` 置 `failed`。
- **跨应用重启**：任务**状态**持久化，**工作**不持久化（客户端进程没了）。
  外部任务（Jenkins build）可以靠 `resume` 重新接上；纯本地抓取一般只能重跑。

## 8. 测试

不启动 Electron 也能测：

```ts
import { createFakeBgTaskServer, runAsTask } from '@kn/common/testing'

const server = createFakeBgTaskServer()
const ctx = server.taskContext({ conversationId: 'c1' })

const ack = await runAsTask(ctx, { conversationId: 'c1' }, { url: 'https://example.com' }, spec, async task => {
    task.log('info', 'hello')
    return { ok: true }
})

assert.equal(ack.background, true)
assert.equal(server.tasks()[0].state, 'succeeded')
assert.deepEqual(server.logs(server.tasks()[0].id).map(l => l.message), ['hello'])
```

假服务端实现同一套 HTTP 契约：create 幂等、日志 seq、心跳/取消、finish、attach。
也可以把它换成真实后端的本地实例做集成测试。

建议补的用例：

- job 前台返回结果；job 后台返回 ack；
- watch 启动即后台，服务端建了订阅；
- `cancelTask` → 心跳返回 cancelRequested → signal abort → `cancelled`；
- 日志批量/seq/`dropped`/重复 batch 幂等；
- 订阅合并窗口、`maxNotes`、会话忙时不丢、任务结束补一条；
- 结果超 16KB 时服务端拒绝，SDK 降级为 `message` 再 finish，不能变成 running 幽灵；
- 客户端被 kill → 租约过期 → `disconnected` → `attach` 后 `attempt+1`、seq 继续。

## 9. Plugin Studio 集成清单

SDK 落地后要同步：

1. **导出**：`@kn/common` 导出 `defineTaskTool` / `runAsTask` / `TaskContext` /
   `TaskUpdatePolicy` / `TaskAck`；`@kn/plugin-api` 重新导出类型。
2. **Agent 技能**：`packages/plugin-plugin-studio/src/skills/plugin-authoring.ts` 增加
   「后台任务」一节（job/watch、三个例子、取消契约、测试）。Plugin Studio 的 agent 就是靠
   这份 skill 学会写插件的。
3. **模板**：`createPluginProject({ template: 'task' })` 生成一个能直接构建的示例
   （一个 job + 一个 watch），比让 agent 从零拼更稳。
4. **文档**：本文 + `LONG_TASKS.md` 的分工；`PLUGIN_STUDIO.md` 加一段入口。
5. **UI**：看板行显示 `mode`、订阅状态（"通知中 / 已暂停 / 已停止"）、note 计数、
   "停止监控"；插件任务行已有的实时日志继续用 `TaskMonitorEngine`。
6. **权限/网络**：SDK 内部用现有 `AgentClient`（JWT + API base）调 `/api/agent/v1/bg-tasks`，
   插件作者不直接拼 HTTP；服务端按 owner/conversation 校验。后端未部署该接口时，
   `defineTaskTool` 要给出明确错误（或显式 `LocalTaskStore` 并标注不持久化），
   watch 任务不能静默阻塞。
7. **CI**：SDK 契约测试 + 模板构建测试 + 一个假的 SSH 流测试。

## 10. 边界

- **不是调度器**：定时执行用 `background.*`；任务是"这一次执行/这一段监控"。
- **不是监控引擎**：看板实时日志/告警规则是 `TaskMonitorEngine`，独立。
- **不是进程管理器**：取消是协作式的，插件不响应就不会被强杀。
- **工作不是跨重启持久化**：状态和日志在服务端；执行者没了工作就停了，恢复要靠 `resume`。
- **不是服务端执行**：服务端没有 SSH/文件/浏览器能力；它只存状态，不跑插件代码。
- **不要把大日志塞进结果**：结果走 16KB 限制；日志走 `task.log` + `getTaskLogs`。
- **抓取结果大时不要全塞进 result**：写文件/空间存储，任务只返回路径、条数和少量样例；
  否则 16KB 上限会让成功变成"结果被截断/拒绝"。
- **不要把密钥写进标题/日志**：任务板、日志、通知都会展示；密钥用 `storage.secret*`。