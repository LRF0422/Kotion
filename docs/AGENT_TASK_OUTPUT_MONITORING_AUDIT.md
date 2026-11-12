# 后台长任务 · 输出持续监控可行性审计

> 问题：现在的 agent 后台长任务（`background: true` 的构建 / 装依赖 / 发布），
> 能不能对**某个任务的输出**（比如构建日志）做**持续监控**，并**根据监控到的内容持续输出给用户**？
>
> 结论：**能，但"持续"分三档，成本与体验差一个数量级。**
> 现在的瓶颈不是"拿不到日志"，而是三件事：**没有增量游标、没有运行期注入通道、没有任何节流/预算**。
> 另外审计中发现一个 **P0 缺陷**：`getBackgroundTask` 声明可以等 300s，但真实死线是 90s，
> 而且超过 90s 被掐掉之后会把任务的完成通知**永久吞掉**（详见 §5）。
>
> 审计范围：`packages/common/src/ai/**`、`packages/core/src/ai/**`、`packages/plugin-ai`、
> `packages/plugin-plugin-studio`、`apps/desktop/src/main/plugin-dev/**`、`apps/desktop/src/main/ssh/**`、
> `backend/.../knowledge-agent-skills`。只读审计，未改任何代码。

> **实施状态（2026-11-11）**：P0（`wait` 吞通知、超时收敛、投递顺序）与 P1（`dev.logsSince` 增量游标、
> `@kn/common` 监控引擎、后台任务面板实时日志）已落地，见 [AGENT_TASK_MONITORING_DESIGN.md](AGENT_TASK_MONITORING_DESIGN.md) §0.0。

---

## 0. 一句话答案

| 你想要的 | 今天能不能 | 怎么做 | 主要代价 |
| --- | --- | --- | --- |
| **看到**某个任务在打什么日志（用户在界面上盯着看） | **不能**（只有一行 progress） | 需要日志缓冲 + 看板行内实时日志 | 0 模型成本，纯 UI 改动 |
| agent **每隔一阵**汇报一次进展（≈1 次/分钟） | **能，零改动**（靠模型自己轮询） | `getBackgroundTask({wait:true})` + `pluginProjectLogs({root})` 循环 | 每轮一次完整模型调用；只覆盖 build/run/publish；无增量，每次重读尾巴 |
| agent **日志一有异常就主动说**（事件驱动推送） | **不能** | 需要新事件通道 + 空闲注入 + 节流 | 最贵：重复注入、上下文膨胀、刷屏风险 |
| 刷新页面/重启后**接着监控** | **不能** | 游标落 storage + 宿主持久化日志 | 两处都要改 |

**推荐的第一步不是"让 agent 持续说话"，而是"把日志变增量 + 让界面实时可见"**（见 §6 的 MVP）：
用户能秒级看到真实日志，模型只在需要时按增量汇报。这是"持续输出给用户"里最便宜、最稳的形态；
纯推送式（每有新日志就唤醒模型）建议放到第二期，并且必须带节流契约。

---

## 1. 现状全貌（这条链路现在是怎么运转的）

```
长工具传 background: true
   └─ backgroundToolRunner.start()                    ← background-tasks.ts:750-752
        ├─ registry.start()  立即返回 ack{taskId}      ← background-tasks.ts:306-359
        │     └─ run() 真活继续跑，progress()/settle()  ← :334-356
        └─ 工具结果 = 一个 taskId 句柄（transcript 里只有它）
任务结束
   ├─ 路径 A：agent 自己 wait/get 到终态 → markDelivered，不再打扰   ← :412-455
   └─ 路径 B：agent 没等 → 会话 idle 时注入一条通知 + 起新一轮         ← :712-725
                （只订阅 settled，一次性 takeUndelivered）
```

| 层 | 载体 | 关键事实 |
| --- | --- | --- |
| 任务注册表 | `background-tasks.ts` | 视图只有 `progress?: string`（单行）与终态 `result`；事件只有 `started/progress/settled`；**内存态**，`MAX_TASKS=100`（`:72-73,133-138,157-158,291-303`） |
| 工具面 | `background-tools.ts` | 三个工具（list/get/cancel），都是 `readOnly: true`；结果 clip 到 20k；**没有"取输出"的工具**（`:43-58,150,185-190`） |
| 投递 | `use-background-task-notifications.ts` | 只认 `settled`；只在 `phase === 'idle'` 注入；每任务一生一次（`deliveredAt`）（`:82-86`） |
| 宿主落点 | `AIAssistantPanel` / `ChatConversation` / `KernelConversation` | 通知 = 本地追加一条 `role: 'user'` 消息 + `start()` 新一轮（`AIAssistantPanel.tsx:225-241`、`ChatConversation.tsx:683-700`、`KernelConversation.tsx:125-135`） |
| 看板 UI | `BackgroundTasksPanel.tsx` | 订阅任务板，展示 title/tool/会话/`progress`/耗时；**只有那一行 progress**（`:163-172`） |
| 长工具 | `studio-tools.ts`（4 个） | 只在**开始前**写一次 progress：install `:1696`、publish `:1823`、run `:2000`、build `:2124`——都是"正在…"，之后不再更新 |

---

## 2. 运行期输出到底存在哪（数据源现状）

| 任务/能力 | 运行期输出载体 | 可流式 | 可增量 | 持久 |
| --- | --- | --- | --- | --- |
| build / run / publish（dev 日志） | 宿主主进程 `DevSession.logs` 环形缓冲，**400 条**，条目 `{level,message,at}` | 是（宿主侧可轮询） | **否**（只有 `at` 弱游标，无 seq） | 否（`stop()` 即 `sessions.delete`） |
| installPluginDependencies | 一个不断累加的字符串（尾 20k），**结束才 resolve** | 否 | 否 | 否 |
| `ssh.exec` | stdout/stderr 缓冲到结束（1MiB 截断） | 否 | 否 | 否 |
| `ssh.*` 交互式 pty | 真流式 chunk 广播，**零缓冲/无回放** | 是 | 否 | 否 |
| 后台任务视图 | `progress` 单行 + 终态 `result` | 否 | 否 | 否（renderer 内存 100 条） |

依据：`manager.mjs:133,205-208,546-550`（400 条 ring、`slice(-limit)`）、`dev.ts:94-104`（参数只有 `{root,limit}`，条目带 `at`）、
`plugin-dev/index.ts:124-128`（宿主再 clamp）、`package-install.mjs:128-167`（累加字符串，`close` 才 resolve）、
`ssh-client.mjs:231-279`（不流式）、`ssh/index.ts:544,225`（pty 广播但不留 scrollback）、
`studio-tools.ts:2316-2335`（`pluginProjectLogs` 只支持 `limit`，且把 `at` 也丢了）。

结论：**唯一像"日志"的数据源是 dev 日志**，但它是"按工程 root 的环形快照"，不是"按任务的增量流"。

---

## 3. 模型侧拿输出的真实能力边界

1. **工具结果是一次性的**：`execute()` 返回一个值，之后再无更新（`tool-executor.ts` 没有 partial 通道）。
2. **协议没有 tool 进度事件**：`AgentEvent` 只有 `tool.requested` / `tool.completed`，
   没有任何 `tool.progress` / `tool.output`（`types.ts:377-403`）。所以工具在跑的时候，
   聊天里只能显示"执行中"卡片，模型也不能边跑边说（`ExecutionStepsDisplay.tsx:259-281`）。
3. **"边监控边说话"= 多轮**：模型只能"等一轮 → 看到结果 → 说一段 → 再等一轮"。
   每一轮之间用户能看到 `text.delta` 流式文字，这是唯一可复用的"持续输出"通道。
4. **会话历史是后端拥有的**：注入的通知靠下一轮 `createRun` 的 `prepareHistory` 落库
   （`SessionTranscriptProjector.java:121-151`、`DefaultRunSupervisor.java:195-208`），
   所以每条注入都会变成一条**用户气泡**——每分钟一条 user 消息的观感必须先想清楚。

---

## 4. 四处超时互相矛盾（这是"能不能持续等"的天花板）

| 位置 | 数值 | 出处 | 后果 |
| --- | --- | --- | --- |
| 客户端读工具 deadline | **90s** | `tool-executor.ts:70,303-307` | `wait` 超过 90s 直接给模型报"工具执行超时" |
| 客户端声明 wait 上限 | 300s | `background-tasks.ts:154-155` | **用不到**，90s 就先死了 |
| 服务端等前端工具结果 | **180s** | `application.yml:55`、`AgentLoop.java:1739,1770-1773` | 超时 `fail("tool_timeout")`，**整个 run 被杀** |
| 文档写的工具超时 | 600s | `docs/AGENT_BACKGROUND_TASKS.md:128` | 已过时，会误导实现者 |

再加上两个硬天花板：

- **单 run `max-steps: 100`**（`application.yml:48`、`AgentCoreProperties.java:94`、`AgentLoop.java:920-925`）——
  超了 `run.suspended(reason='budget')`，**要用户点"继续执行"**；注意这约束的是"单 run"，不是"监控总时长"，
  因为每次注入都是新 run，所以客户端其实**没有任何总预算**。
- **上下文 60k**（`AgentCoreProperties.java:156`）——轮询几十轮后历史膨胀，早晚触发压缩/截断。

所以用"轮询"实现持续监控，现实粒度是 **≈60s/次**（默认值刚好卡在 90s 内），
一次 run 最多几十轮，想要"跑一晚上"必须靠"每轮新 run + 节流"，而不是一个长 run 里死等。

---

## 5. P0 缺陷：wait 超时被掐会**吞掉完成通知**

链路（全部可复现）：

1. 模型调 `getBackgroundTask({taskId, wait:true, timeoutMs:300000})`；
2. `registry.wait()` 挂上监听，task 仍在跑（`background-tasks.ts:412-455`）；
3. 90s 到，`raceToolDeadline` reject，模型收到"工具执行超时"（`tool-executor.ts:83-100`）——**但 promise 没被取消**；
4. 任务在 120s 完成，那个"已经没人要"的 `wait` 继续跑完，走到 `markDelivered(task)`（`background-tasks.ts:450-452`）；
5. `deliveredAt` 被写上 → 完成通知**永远不会注入**，agent 也不再被叫醒。

即：**超时参数写得越大，越容易漏掉"任务已完成"这件事**，而且现场只有一条"工具超时"错误，
看起来像工具坏了。修法很小：`wait` 被外部放弃时（或 deadline 命中时）不应 `markDelivered`；
更稳的是让 `getBackgroundTask` 的 readOnly deadline 与 `MAX_BACKGROUND_WAIT_MS` 对齐（三选一，别三套数字）。

**同族缺陷（P1）：先认领、后投递**。`flushBackgroundTaskNotes` 先 `takeUndelivered`（标已投递）再 `onNotify`
（`background-tasks.ts:721-723`），而 `AIAssistantPanel` / `KernelConversation` 都用 `.catch(() => undefined)`
（`AIAssistantPanel.tsx:239`、`KernelConversation.tsx:133`）——投递失败 = 该通知永久丢失，没有任何补偿。

---

## 6. 能不能做：三档方案（推荐顺序）

### 档 A｜零改动：agent 自主轮询（今天就能用）

```
循环：getBackgroundTask({ wait:true, timeoutMs:60000 })
      → 拿到 progress（"正在构建 …"）
      → pluginProjectLogs({ root, limit: 60 }) 取日志尾
      → 对比自己上一轮看到的内容，写一段话给用户
```

- 优点：0 代码；有 `progress` 和日志尾，够"每隔一分钟说一句"。
- 缺点：**日志是全量重读**（接口没有 `since`），模型得自己 diff；只覆盖 build/run/publish；
  受 90s/180s/100 步/60k 上下文约束；install 期间完全没输出；`wait` 一超时就有 §5 的丢通知风险。
- 适合：验证产品形态、给个 demo。

### 档 B｜MVP（推荐，≈3 人日）：增量日志 + UI 实时 + 模型按需汇报

| 改动 | 内容 | 位置 |
| --- | --- | --- |
| B1 数据层 | dev 日志条目加**单调 `seq`**；`dev.logs({root, sinceSeq, limit})` 返回 `{entries, nextSeq, dropped}`；install 的 stdout/stderr 也 `pushLog` | `manager.mjs:205-208,546-550`、`dev.ts:94-104`、`plugin-dev/index.ts:124-128`、`package-install.mjs:128-167` |
| B2 任务层 | 任务启动时注入 `readOutput(cursor)`；视图加 `output?: {cursor, lines}`（环形，如 200 行）；新增事件 `{type:'output'}` | `background-tasks.ts:106-131,133-138,334-356` |
| B3 工具层 | 新工具 `getBackgroundTaskOutput({taskId, cursor?, limit?, level?, grep?})` → `{lines, nextCursor, truncated}`；`taskId ↔ root` 用已有的 `meta.root` | `background-tools.ts`、`studio-tools.ts:1722,1926,2067,2196` |
| B4 UI | 看板行展开 = 实时日志（订阅 `output` 事件/IPC，纯前端，**0 模型成本**）；构建卡同理 | `BackgroundTasksPanel.tsx:163-172`、`plugin-studio/src/artifacts/cards.tsx:50-98` |
| B5 提示词 | 告诉模型"监控模式"：先 `getBackgroundTaskOutput` 拿增量 → 有变化才说 → 用 `wait` 做节拍；不要每轮全量重读 | 工具 description + 相关 skill |

B 的效果：**用户秒级看到真实日志**（B4）+ **模型按增量说话**（B3/B5），成本可控，不引入"推送"的所有风险。

### 档 C｜v2（≈1 周）：事件驱动推送（agent 主动开口）

新增 `watchBackgroundTask({ taskId, level?, intervalMs?, maxNotesPerMinute? })`，宿主侧定时读增量 → 命中 → **合并窗口** →
空闲时注入一条 `【后台任务监控】` 通知 + 新 run。必须同时交付的契约（缺一不可）：

- **不是 user 消息**：现在注入只能是 `role:'user'`（三宿主都是追加本地 user 消息），推送场景需要新的消息种类，
  否则用户会看到"自己"在每分钟自言自语；
- **节流**：最小间隔（≥30s）+ 合并窗口（同一批日志合成一条）+ 条数/总时长硬上限（如 20 条 / 30 分钟）+ 自动停止；
- **门禁**：沿用"面板关着不推进"（`AIAssistantPanel.tsx:225` 的 `open ?` 分支）与 idle-only；
  `suspended`（budget / connection-stopped）**永远不到 idle**，监控必须显式停掉，否则静默卡死；
- **游标可恢复**：`deliveredAt` 之外再加"已消费到 seq"，刷新后从 storage 续（现在注册表刷新即空）；
- **可关闭**：用户一键停止（等价于 `cancelBackgroundTask` 的"不再等"语义）。

---

## 7. 风险清单

**P0**
1. §5 的 wait 吞通知 —— 改 `markDelivered` 的时机或统一超时数字。
2. 四处超时不一致（90/180/300/600）—— 收敛成一套，且在工具 description 里写真实的那个。

**P1**
3. `flush` 先认领后投递，两宿主 `.catch(() => undefined)` 吞错 → 通知永久丢失（改成失败回滚 `deliveredAt`）。
4. dev 日志 ring 400 条会**跳行**、`stop()` 即清空 → 增量游标必须能表达 `dropped`（否则模型会以为"没日志"）。
5. 同一条日志出现两次：dev-server 的 `log()` 既写 stderr 又走 NDJSON 事件，而 stderr 一律记 `error`
   （`manager.mjs:383-390`）—— 监控"error 行"会被自己的重复放大。
6. 刷新/重启丢任务板与游标；跨会话不可见（注册表按 `conversationId` 隔离，`background-tasks.ts:366-379`）。
7. 多标签并行：每个 tab 都可能注入（`ChatConversation` 后台标签也会推进），同一任务可能被两个面板处理 →
   已有 `deliveredAt` 兜底，但新增"增量消费"必须也做单点认领。

**P2**
8. 取消 ≠ 杀进程（`cancelBackgroundTask` 只是不再等），监控里要写清楚。
9. `progress` 只是"开始"文案（四类工具各写一次），别把它当日志用。
10. 成本无上限：注入 = 新 run；`max-steps` 只管单 run。生产上必须有"监控总时长/总条数"上限。

---

## 8. 建议的自测 / 验收

- 扩展 `pnpm --filter @kn/common check:background-tasks`：
  - `output` 游标单调、环形溢出返回 `dropped`、重复消费不重复投递、`readOutput` 抛错不影响任务结算；
  - `wait` 被外部放弃时**不** `markDelivered`（§5 回归）；
  - 注入节流：合并窗口、最小间隔、上限（档 C）。
- 新增 `check:dev-log-cursor`（Node 里直接跑 `manager.mjs`）：seq 单调、`sinceSeq` 只返回新增、`stop()` 后语义、ring 溢出。
- 手测：`buildPluginProject({ background: true })` 跑一个会报错的项目 →
  看板展开能看到实时错误日志；让 agent 汇报一次增量；故意 `wait` 超时验证不吞通知。

---

## 9. 附：相关文档与索引

- **配套设计（无风险实施）**：[`AGENT_TASK_MONITORING_DESIGN.md`](AGENT_TASK_MONITORING_DESIGN.md)
- 机制与边界：[`AGENT_BACKGROUND_TASKS.md`](AGENT_BACKGROUND_TASKS.md)
- 动态表单（同构的"空闲注入"先例，`MAX_FORM_WAIT_MS = 600_000`）：[`AGENT_FORM_REQUESTS.md`](AGENT_FORM_REQUESTS.md)
- 会话任务清单持久化（类似"跨会话找回"的产品形态）：[`AGENT_SESSION_TASKS.md`](AGENT_SESSION_TASKS.md)
- 桌面端能力目录（`dev.*` / `ssh.*` 的真实契约）：[`DESKTOP_CAPABILITIES.md`](DESKTOP_CAPABILITIES.md)