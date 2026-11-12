# 任务输出持续监控 · 无风险实施设计

> 前置：[AGENT_TASK_OUTPUT_MONITORING_AUDIT.md](AGENT_TASK_OUTPUT_MONITORING_AUDIT.md)（现状与风险清单）。
> 约束：**允许打破原有设计**；目标是"无风险实施"——不改变现有对话行为、可灰度、可一键关、可回滚，
> 且任何新组件坏掉的最坏结果都只是"监控不工作"，而不是"对话坏了/用户 run 被杀/额度被吃/历史被污染"。

---

## 0.0 实现状态（P0 + P1 + 监控源打通 已落地）

| 层 | 实现 | 校验 |
| --- | --- | --- |
| P0 投递语义 | `wait` 不再消费、改由工具 `consume`；`flush` 先投递后认领；取消任务不再入待投递队列；wait 上限 80s（低于客户端 90s 读工具死线） | `pnpm --filter @kn/common check:background-tasks`（含"被放弃的 wait 不吞通知"回归） |
| 日志源 | `dev.logsSince({root, sinceSeq, limit})` → `{entries, nextSeq, dropped, total, sessionId}`；条目带单调 `seq`；ring 400→1000；1s 内重复行去重；`dev.logs` 行为不变 | `node apps/desktop/src/main/plugin-dev/manager.test.mjs`（49 项）；`check:desktop-capabilities` |
| 监控引擎 | `packages/common/src/ai/tasks/task-monitor.ts`（订阅/增量拉取/规则/合并/预算/持久化/自动接入 `backgroundTasks`）+ `use-task-monitor.ts` | `pnpm --filter @kn/common check:task-monitor` |
| 监控源泛化 | `MonitorSource = dev(root) \| task(taskId)` + `monitorSourceKey` + `createMonitorReader`（`monitor-readers.ts` 把 `dev.logsSince` 与 `task.logsSince` 合成一个 reader）；持久化 v2（兼容 v1 root 键迁移） | `check:task-monitor`（引擎 + reader 两个 check） |
| 插件任务接入 | 宿主接线在任务板首次打开时自动为运行中的插件任务建监控（上限 8 并发），`started`/`finished` 事件驱动；任务行显示「N 条告警」chip | `tsc -p packages/plugin-ai` / `pnpm --filter @kn/plugin-ai build` |
| 宿主接线 | `packages/plugin-ai/src/ai/tasks/task-monitor-host.ts`（capability 探测 + StorageService 持久化 + 开关） | `tsc -p packages/plugin-ai` 无新增错误 |
| UI | `TaskLogSection`（实时日志/仅错误/丢弃行提示/自动滚底）+ 后台任务面板行内接入 + 「监控中」分区（刷新后仍在） | `pnpm --filter @kn/plugin-ai build` 通过 |

**未实现（按 §7 留给 P2/P3）**：系统通知/角标推送、AI 摘要端点、单写者选举、install 日志。
（规则命中的「N 条告警」chip 已落地——它只是读事件，不做推送。）

> 实现取舍：开关默认**开**（仅当宿主有 `dev.logsSince` 时），因为该表面是纯增量的（任务行展开才出现、不创建 run、不写 history）；
> `localStorage['kn:task-monitor'] = 'off'` 可免构建关闭。原设计写的是"默认关"，按"无风险但可见"调整，见 §6。

---

## 0. 一句话

**不做 run、不进 transcript、不碰引擎**：把"监控"降级成一个**宿主观测子系统**
（增量日志 + 规则 + 独立持久化的监控车道），把"持续输出"拆成
**实时日志（用户看）+ 告警（推送）+ 可选 AI 摘要（单次有界调用，不是 run）**；
agent 真正"上手处理"由用户一键请入，不做无人值守的自主 run。

---

## 1. 为什么必须打破原设计：三个根因

原设计把「任务事件」寄生在「对话轮次」这条唯一通道上：

```
background: true 工具 → 客户端 park 等结果（占 run / 90s·180s 死线）
任务结束 → 假装用户发了一条消息 → 起一整轮 run（写进用户历史 / 吃配额 / 无节流）
```

这不是实现粗糙，是**通道错配**。证据（均为后端/前端实证）：

| 如果要"持续输出"就必须… | 现实代价 | 证据 |
| --- | --- | --- |
| 在会话里起 run | **单活跃 run**：建 run 时无条件 cancel 同会话旧 run → 监控 run 会**杀掉用户正在跑的 run** | `DefaultRunSupervisor.create:161`、`cancelActiveByConversation:623-650` |
| 起 run | 吃用户额度：根 run 计每日次数、active run 并发**不排除子 run** | `RunQuota:44,52-72`、`AgentRunMapper:55,67-71` |
| 让模型"说话" | 输出必然进规范日志 → 用户可见 AI 气泡、挤 60k 上下文、打断 provider prefix cache | `SessionTranscriptProjector.onRunTerminal:214-216`、`:59` |
| 把日志塞进 run 事件流 | Redis 每 run 上限 **2000** 条 + **严格连续 seq**（缺口即断流）→ 高频日志把历史事件挤掉、重连失败 | `DefaultRunEventLog:37,87-98,111-114` |
| 在 messages_json 里加旁注/卡片 | 投影每次重算，**加什么都被抹掉**；UI 模型 `sender` 只有 `user|ai` | `SessionTranscriptProjector:1019-1024,834-848`；`chat-types.ts:5-41` |
| 用子 run 承载监控 | 子 run 不能独立触发，必须依附活着的父 run，且父会被停轮/塞通知 | `AgentLoop:777-785,2115-2135` |

**结论：任何"让 agent 持续说话"的方案只要走 run，就一定与用户抢会话、吃额度、污染历史。**
想要无风险，只有一条路：**把监控移出对话通道**。

---

## 2. 目标 / 非目标

**目标**
1. 用户在界面上**实时看到**指定任务的日志（增量、自动滚底、错误高亮、刷新不丢）。
2. 命中规则时**推送**告警（角标 / 系统通知 / 活动条），不打断输入。
3. 可选：对事件批次生成**短摘要**（"agent 在汇报"的观感），单次调用、有界、可关。
4. 全程**零 transcript 写入、零 run 创建、零引擎改动**。

**非目标（明确不做）**
- 不建"监控 run"，不改单活跃 run 语义。
- 不改 `SessionTranscriptProjector` / `messages_json` / 三个宿主消息列表。
- 不把任务输出塞进 run 事件流，不加会话级事件表。
- 不做无人值守的"自动修复构建错误"（Phase 4 只做**用户一键请 agent 介入**）。

---

## 3. 架构

```
┌─ Electron 主进程 ────────────────────────────────────────────┐
│ DevSession.logs 环形缓冲（加 seq，去重，可选落盘）            │
└───────────────▲──────────────────────────────┬──────────────┘
                │ dev.logs({root,sinceSeq})     │ IPC
                │ (拉取，1s，≤1000 条/次)        │
┌─ 渲染进程 ────┴──────────────────────────────▼──────────────┐
│ TaskMonitorEngine（模块级单例，started at app boot）          │
│  ├ 订阅：root + label + taskId + 规则 + 节流预算              │
│  ├ 内存 ring（每监控 500 行）+ 规则匹配 + 事件去重            │
│  ├ 持久化：cursor / 订阅 / 最近事件（StorageService + CAS）   │
│  └ useSyncExternalStore 广播                                  │
│        ├─ 面板：实时日志 / 告警 / 停止（header 入口）          │
│        ├─ 角标 + 活动条 + 系统通知（notification.*）           │
│        └─（可选）叙述：模板 或 后端单次调用                    │
└──────────────────────────────┬──────────────────────────────┘
                               │ 可选
┌─ 后端（新增，默认关）────────▼──────────────────────────────┐
│ POST /task-monitor/narrate：单次 LLM 调用，不建 run、         │
│ 不写 transcript、不进 checkpoint、独立限流；失败→客户端兜底   │
└─────────────────────────────────────────────────────────────┘
```

**关键边界**：监控的事实来源是"工程 root 的日志"，**不是**任务对象。
后台任务注册表仍是内存态（旧设计不动），但它丢了监控照样能从持久化恢复——
这恰好把"刷新即丢任务"这个老问题在观测面上绕开了。

---

## 4. 契约

### 4.1 日志源：`dev.logsSince` 增量游标（唯一需要动的宿主契约）

> 实现注：为避免改动既有 `dev.logs` 的返回形状（StudioPage / plugin-studio / studio-tools 三处调用方），
> 实际落地为**新增** `dev.logsSince`，`dev.logs` 的签名与 clamp 行为完全不变（条目多了一个 `seq` 字段，纯增量）。
> 仓库里另有一套通用的 `task.*` 桌面能力（主进程持有任务状态与日志，见 `packages/common/src/core/desktop/tasks.ts`），
> 它与本设计互补：`dev.logsSince` 负责"工程构建日志"，`task.*` 负责"插件自己声明的长任务"。
> **已打通**：监控引擎的 reader 现在由 `createMonitorReader({ dev, tasks })` 路由（见 §4.2），两类日志走同一套规则/事件/持久化；
> 插件长任务的接入方式见 [LONG_TASKS.md](LONG_TASKS.md) §9。

```ts
// packages/common/src/core/desktop/dev.ts
export interface DevLogEntry {
    seq: number          // 新增：per-session 单调递增（从 1 开始），ring 淘汰不影响新序号
    level: 'info' | 'warn' | 'error'
    message: string
    at: number
}

export interface DevLogsOptions {
    root: string
    sinceSeq?: number    // 新增：只返回 seq > sinceSeq（增量）
    limit?: number       // 默认 200，上限 1000
}

export interface DevLogsResult {
    root: string
    entries: DevLogEntry[]
    nextSeq: number      // 下次传这个
    dropped: number      // sinceSeq 与 ring 起点之间被淘汰的条数（>0 时 UI 明示"已丢弃 N 行"）
    total: number        // 当前 ring 条数（诊断）
}
```

- 兼容做法：渲染端 `const r = await dev.logs(opts); if (Array.isArray(r)) 以旧形状兜底`（版本偏斜时不崩）。
- 同步改：`manager.mjs`（`pushLog` 加 seq、ring 400→1000、**同毫秒同文本去重**——现在 stderr + NDJSON 会写两条）、
  `plugin-dev/index.ts`、preload、`catalog.ts` 摘要、`docs/DESKTOP_CAPABILITIES.md`，
  并跑 `pnpm --filter @kn/common check:desktop-capabilities`。
- 顺带把 install 的 stdout/stderr 也 `pushLog`（`package-install.mjs:128-167` 已有累加器，接一行即可）——
  install 从"完全没有运行期输出"变成"有日志"，这是增益不是风险。

### 4.2 监控引擎（框架层，放 `packages/common/src/ai/tasks/`，与 `background-tasks` 同层）

```ts
export type MonitorTrigger =
    | { kind: 'level'; level: 'error' | 'warn' }
    | { kind: 'pattern'; pattern: string; ignoreCase?: boolean }
    | { kind: 'settled' }

export type MonitorSource =
    | { kind: 'dev'; root: string }        // 构建日志（dev.logsSince）
    | { kind: 'task'; taskId: string }     // 插件长任务日志（desktop.tasks.logsSince）

/** 订阅 id / 持久化 cursor 的键：`dev:<root>` / `task:<taskId>` */
export const monitorSourceKey = (source: MonitorSource): string

export interface MonitorSubscription {
    id: string                  // `monitorSourceKey(source)`，一个源一条（幂等）
    source: MonitorSource
    label: string
    taskIds: string[]           // 关联任务，仅用于展示/对账，可空
    triggers: MonitorTrigger[]
    cadence: {
        pollMs: number          // 1000，下限 500
        minGapMs: number         // 两次事件最小间隔，默认 10000
        maxEvents: number        // 默认 50
        maxDurationMs: number    // 默认 30min，到点自动停并留一条 ended
        maxLines: number         // 内存保留行数，默认 500
    }
    status: 'running' | 'stopped' | 'expired'
    createdAt: number
}

export interface MonitorEvent {
    id: string                  // `${monitorId}:${seqFrom}-${seqTo}:${ruleIdx}`（幂等键）
    monitorId: string
    kind: 'trigger' | 'note' | 'status' | 'ended'
    at: number
    seqFrom: number
    seqTo: number
    lines: { seq: number; level: string; text: string }[]   // ≤ 20 条
    matched?: { trigger: MonitorTrigger; text: string }
    note?: string               // 模板文本或 AI 摘要
    dropped?: number
}

/** 宿主注入：一个 reader 同时读两种源（dev / task），按 source 分派 */
export interface TaskMonitorReader {
    read(input: { source: MonitorSource; sinceSeq: number; limit?: number }): Promise<MonitorLogPage>
}

export interface TaskMonitorEngine {
    start(input: { source: MonitorSource; label: string; taskIds?: string[]; triggers?: MonitorTrigger[]; cadence?: Partial<MonitorSubscription['cadence']> }): MonitorSubscription
    notifySettled(source: MonitorSource): boolean   // 任务结束 → 停掉该源的监控
    stop(id: string): boolean
    list(): MonitorSubscription[]
    events(id: string): MonitorEvent[]
    subscribe(listener: () => void): () => void   // useSyncExternalStore
    getVersion(): number
}
```

- **自动登记（dev 源）**：开关开启时订阅 `backgroundTasks.on('started')`，任务带 `meta.root` 就
  `start({source:{kind:'dev',root}, label})`；`settled` → `notifySettled({kind:'dev',root})`。**四类长工具不用改一行**。
- **自动登记（task 源）**：宿主接线 `attachLongTaskMonitors(desktop)` 先订阅 `desktop.tasks.onEvent` 再枚举
  `list({state:'running'})`：`started` → `start({source:{kind:'task',taskId}, label: task.title})`；
  `finished` → `notifySettled`。**最多 8 个并发 task 监控**（超出静默跳过，任务仍在任务板可见，只是没有告警 chip）。
- **手动登记**：面板/命令「监控这个工程的日志」。
- **节流是硬约束，不是提示**：`minGapMs` 合并窗口（窗口内的事件合成一条）、`maxEvents`、`maxDurationMs`
  任一命中即停并落一条 `ended`；`pollMs` 下限 500ms，禁止忙轮询。
- **去重**：事件 id 由 `(monitorId, seq 区间, 规则序号)` 决定，重连/多窗口/刷新都不会重复告警。

### 4.3 持久化（刷新/多窗口恢复）

- 作用域：`pluginStorageNamespace('plugin-ai')` 下的单文档 `monitor`（约 1 个 KV，远低于单值 2MiB 上限）。
- 内容（v2）：`{ v: 2, subscriptions: [...含 source], cursors: Record<monitorSourceKey, nextSeq> }`；
  读取**兼容 v1**（`{v:1, subscriptions:[{root}], cursors:{'root:<root>':n}}` → 迁移成 dev 源）。
  写用 `ifRev` CAS，冲突时按 `id` 合并（订阅以新为准、cursor 取大值），**坏数据直接丢弃重建**，绝不影响任务本身。
- 跨窗口：照抄 `RunLock`（`browser-persistence.ts:228-300`，Web Locks + localStorage 心跳）做
  `task-monitor:<root>` 单写者；非写者只读存储快照并显示"另一窗口正在监控"。
- 恢复：app boot / 窗口 focus 时读存储 → 校验 root 仍存在 → 以 `nextSeq` 续拉；`dropped > 0` 就如实标注。

### 4.4 叙述（Phase 3，可选，默认关）

```
POST /api/agent/v1/task-monitor/narrate
Authorization: 现有 JWT（owner-scoped）
{
  "sessionId": "…",
  "label": "构建 my-plugin",
  "lines": [{ "level": "error", "text": "…" }],   // ≤ 40 条，总长 ≤ 8k 字符
  "previousNote": "上一句摘要（可选，保持连贯）"
}
→ 200 { "text": "…", "usage": { … } }   // text ≤ 200 字；失败 204，客户端落到模板
```

- 实现照 `ThreadSummarizer`（`memory/ThreadSummarizer.java`）的形态：`LlmGateway` 单次调用、
  固定 system prompt、`maxTokens` 硬顶、单线程池、异常只 log。**不建 run、不进 checkpoint、不写 transcript、不计 run 配额。**
- 独立限流：Redis `INCR/EXPIRE` 分钟窗（照 `RunQuota:52-72`），key 换成 `agent:monitor:{userId}`，默认 6 次/分钟。
- 服务端开关 `agent.monitor.narration-enabled: false`；模型可配 `agent.monitor.model`。
- 客户端模板兜底（零 LLM）：`构建失败 · 3 个错误 · 最近一条：TS2307 Cannot find module 'x'`。

---

## 5. UI 落点（按风险从低到高，逐级叠加）

| 步骤 | 落点 | 为什么安全 |
| --- | --- | --- |
| **S1（必做）** | `BackgroundTasksPanel` 行展开 = 实时日志 | 只改一个面板的内容区（`:340-395`），不碰三个宿主、不动布局 |
| **S2** | header 新入口「任务监控」+ 角标（进行中/未读告警） | 照 `ChatHeaderActions.tsx:101-106` 的既有面板注册方式；移动端复用同一 bottom sheet |
| **S3** | 活动提示条（composer 上方，**非持久化**） | 纯本地组件，不写消息、不进 transcript |
| **S4（可选）** | 右侧产物 pane（artifact kind → renderer） | 走既有 `use-agent-renderers` 机制，不碰宿主；移动端 pane 全宽，需 DeviceSwitch |
| ~~会话内独立第三列~~ | **放弃** | 与 `hidden md:flex` 布局、移动端全宽 pane、keep-alive 冲突 |

日志组件抽 `TaskLogList`：`ScrollArea` + `useAutoScroll`（`packages/ui/src/hooks/use-auto-scroll.ts` 已是成品）
+ level→className 映射（照 `StudioPage.tsx:1478-1502`）+ **增量 append（只渲染尾部 N 条，行级 memo）**。
注意 keep-alive：面板不可见时停止渲染但引擎继续跑（`useRouteCacheActive`），避免后台 setState 放大重渲。

---

## 6. 无风险保证（逐条对应审计风险）

| 审计风险 | 本设计如何消除 | 验证方式 |
| --- | --- | --- |
| 假 user 消息污染历史 / 刷屏 | 监控数据**不进 transcript**，独立存储与面板 | 跑一次完整监控后 `messages_json` 字节数不变 |
| 无节流、成本无界 | 不建 run；叙述单次调用 + 6 次/分钟 + 输出 ≤200 字 | 压测/日志计数 |
| run 预算 / step / 60k 上下文 | 完全不建 run | 无 run.created 事件 |
| idle 门禁 / reset 竞态 / suspended 卡死 | 完全绕开 phase 状态机；监控不订阅 `use-editor-agent` | 关面板/挂起/budget 场景下监控照常 |
| 90/180/300/600 超时矛盾 | 监控不占工具调用；`dev.logs` 是毫秒级 IPC | 无长等待 |
| 任务注册表刷新即空 | 监控状态独立持久化，root 为键 | 刷新后继续拉增量 |
| 多标签重复告警 | 单写者选举 + 事件幂等键 | 两窗口只出现一次 |
| ring 溢出丢行 | `seq` + `dropped`，UI 明示"已丢弃 N 行" | 造 2000 行日志 |
| 旧路径回归 | 旧代码零改动；新代码全在开关后；`background-tasks` 只**订阅**不改 | 现有 check 全绿 + 三宿主 diff=0 |
| 后端成本/滥用 | 新端点默认关、owner-scoped、独立限流、输入输出双截断、失败降级 | 关开关后 0 请求 |
| 桌面能力破坏 | `dev.logs` 是**扩参**不是新能力；渲染端兼容旧数组形状 | `check:desktop-capabilities` |

**灰度与回滚**
- Switch：`localStorage['kn:task-monitor']`，**实现为"能力存在即默认开"**（见 §0.0 的取舍说明）：
  `'off' = 强制关`，其它值（含 absent）= 开；开关由 `task-monitor-host.ts` 的 `setTaskMonitorDisabled` 写入。
- 能力探测：宿主没有 `dev.logsSince` → 引擎根本不 configure，不产生任何定时器/IPC/存储写入，
  日志区显示"需要更新桌面端"（照 `StudioPage.tsx:398-406` 的先例）。
- 服务端：`agent.monitor.narration-enabled` 独立开关。
- 数据：存储文档 `v:1` 版本化，格式不认识就丢弃重建；卸载 = 删 KV + 关开关。
- 代码：Phase 1–3 各自独立 PR，可单独 revert；**三宿主文件与 `use-editor-agent.ts` 全程零改动**。

---

## 7. 分阶段实施

| 阶段 | 内容 | 工作量 | 风险 | 独立价值 |
| --- | --- | --- | --- | --- |
| **P0** | 修 `wait` 吞通知（`markDelivered` 时机）；统一 90/180/300 与文案；`flush` 先投递后认领 | 0.5–1 人日 | 无（纯 bugfix） | 现有后台任务不再静默丢结果 |
| **P1** | `dev.logs` seq/since/dropped + ring 去重扩容 + install 日志；MonitorEngine + 持久化 + 选举 + 看板实时日志 + 开关 | 3–4 人日 | 低（全在开关后） | **用户在界面上实时看日志（核心价值已交付）** |
| **P2** | 规则触发（error/warn/pattern/settled）+ 模板叙述 + 角标/系统通知 + 硬上限 | 2 人日 | 低 | 被动告警 |
| **P3** | 后端单次叙述端点 + 限流 + 兜底 + 设置项 | 2–3 人日 | 中低（新端点默认关） | "像 agent 在汇报" |
| **P4**（可选） | 一键「请 agent 分析/修复」（用户发消息 + `getBackgroundTaskOutput({cursor})` 工具）+ 右侧 pane | 2–3 人日 | 中（新工具，需按可写工具审核） | agent 真正介入 |

合计 ≈ **10–12 人日**；P0+P1 约 4–5 人日即可看到主要体验提升。

---

## 8. 验收（"无风险"要能被证明）

**单元**
- `dev.logs`：seq 单调、`sinceSeq` 只回新增、`dropped` 语义、旧数组形状兜底。
- Engine：规则匹配 / `minGapMs` 合并 / `maxEvents` / `maxDurationMs` / 事件幂等 / 持久化往返 / 选举。
- 纯函数化（照 `background-tasks.check.ts` 的风格），不依赖 React。

**手工（必须逐条过）**
1. 跑一个会报错的 `buildPluginProject({ background: true })`：面板实时出现 error，**聊天消息数不变**。
2. 同一事件只告警一次；刷新后监控继续、`dropped` 如实显示。
3. 两个窗口同时开：只有一个在拉日志，另一个显示"另一窗口监控中"，不重复告警。
4. 监控到 `maxDurationMs` 自动停，落一条"已结束"。
5. `kn:task-monitor=off` 后：无轮询、无 IPC、无告警、无请求；旧后台任务通知行为与今天完全一致。
6. 服务端叙述开关关 / 超时 / 限流命中：客户端自动落模板，不弹错误。

**回归**
`pnpm --filter @kn/common check:background-tasks`、`pnpm --filter @kn/plugin-plugin-studio test`、
`pnpm --filter @kn/common check:desktop-capabilities`、聊天/路由缓存手测；三宿主与 `use-editor-agent.ts` diff 必须为 0。

---

## 9. 如果一定要"agent 在会话里主动说话"

那就不再是无风险：需要四项引擎能力同时落地，且必须重审「单活跃 run」语义。

1. 引擎侧发起 run 的内部入口（今天只有客户端 `POST /runs` 与 delegate 子 run 两条路）；
2. 单活跃 run 的例外/排队（否则监控 run 直接 cancel 用户 run，`DefaultRunSupervisor.create:161`）；
3. run 级"不投影到会话"标记（`onRunTerminal:214` 目前无条件投影）；
4. `ChatMessage.metadata` 透传（投影 + 前端类型，今天会被丢弃 `:1019-1035`），以及独立配额/优先级 gate。

**建议的替代**（同样满足"根据监控结果输出给用户"，风险差一个量级）：
- Phase 3 的 AI 摘要在监控车道里**以 agent 口吻呈现**（明确标注"监控摘要"），用户可一键「追问」把事件连同日志增量发进会话；
- Phase 4 的「请 agent 分析/修复」按钮 = 用户发起的普通消息 + `getBackgroundTaskOutput` 工具按游标读增量（一次工具调用、毫秒级返回、不 park），
  既让 agent 拿到真实日志，又不引入自主 run。

（若产品坚持要"无人值守自动处置"，建议单独立项、按上面的四项能力做架构评审，而不是复用本设计的开关。）

---

## 10. 与旧机制的共存关系

| 旧机制 | 本设计如何处理 |
| --- | --- |
| `background: true` 四工具 | 不动；`meta.root` 成为监控自动登记的钩子 |
| `listBackgroundTasks` / `getBackgroundTask` / `cancelBackgroundTask` | 不动；P4 只**新增** `getBackgroundTaskOutput` |
| 完成通知（假 user 消息 + 新 run） | 不动（保留给"任务结束"这一个低频事件）；监控事件**绝不**走这条路 |
| `BackgroundTasksPanel` 任务板 | 扩成"任务 + 监控日志"两个折叠区，注册表仍内存态 |
| 三个宿主消息列表 | 零改动 |

> 一句话总结：**旧路径继续负责"任务结束了"这一件事；新路径负责"任务在发生什么"。**
> 两者唯一共享的是 `meta.root`，因此可以独立上线、独立关闭、独立回滚。