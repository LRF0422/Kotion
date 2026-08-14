# Agent Harness 架构改造（V2 + 长任务 / 记忆 / 用户画像）

## 1. 背景与审计结论

后端 `knowledge-agent-skills` 已有一套接近现代 harness 的 V2 引擎骨架，改造不是推倒重来，而是补齐三类缺失能力并接通前端 skills/tools 契约的剩余连线。

**已有且保留**（`com.knowledge.agent.v2.*`）：
- 响应式状态机 `AgentEngine`（INIT → THINK → ACT → OBSERVE → DONE/SUSPENDED/ERROR）+ 拦截器链 `InterceptorPipeline`。
- 上下文压缩 `ContextCompactor`（L1 工具结果淘汰 + L2 LLM 摘要）、快照 `SessionSnapshotCodec` + `JdbcAgentStateStore`。
- 子 agent 委派 `DelegateTaskTool` + `OrchestratorV2`/`DAGScheduler`。
- 会话级 scratchpad `update_task_state` / `get_task_state`。

**缺口（本次补齐）**：
1. **长任务**：执行绑定在单次 HTTP SSE 上（5 分钟超时、内存 `suspendedSessions`、无后台任务/回放/取消）。
2. **记忆**：只有会话级 scratchpad，无跨会话长期记忆；`agent_conversation`/`agent_message` 表 V2 从不写入。
3. **用户画像**：无画像存储与注入，仅记录 token 用量。
4. **前端 skills/tools 契约**：V2 只取 `skills[].tools[]`，丢弃 `systemPromptFragment`/`domain`/`tags`；`ProgressiveDiscovery` 仅 V1 使用。

## 2. 目标架构

```
前端 V2AgentRuntime
   │ (1) POST /agent/tasks → 返回 taskId（立即返回）
   ▼
AgentJobService（事件溯源 + 可重建执行器）
   ├─ 每个事件: seq++ → 先落 AgentTaskEventStore(Redis ZSET + MySQL 镜像) → 再实时推送
   ├─ 状态机: QUEUED→RUNNING→SUSPENDED/WAITING_TOOLS→COMPLETED/FAILED/CANCELLED
   ├─ 检查点: 每次挂起/结束同步快照（含 pendingToolCalls）
   ├─ ensureLive: 进程重启后从「job + 快照 + 事件日志」重建会话并重启引擎
   └─ 可取消（Disposable）
        │
        ▼
AgentEngine（保留：状态机 + 拦截器链）
   ├─ INIT 前注入: 系统提示词 + 用户画像 + 相关记忆（AgentSessionFactory）
   ├─ 工具路由: 后端 / 前端（保留）
   └─ 会话级 scratchpad（保留）
        │
        ├──▶ MemoryStore（跨会话长期记忆）
        ├──▶ UserProfileStore（画像记录 + 注入）
        ├──▶ AgentTaskEventStore（新增，事件日志，回放权威）
        └──▶ SnapshotStore（保留，挂起/边界检查点）
```

## 2.1 断点续传的四个架构保证

1. **事件日志先行**：每个事件（带单调 seq）先写入 `agent:taskevents:<taskId>`
   （Redis ZSET，score=seq）+ MySQL `agent_task_event` 镜像，再推给客户端。
   回放（`GET /events?afterSeq=N`）从存储读取，与进程内存无关；实时尾部用
   replay sink + seq 过滤去重，既不丢也不重。
2. **全量检查点**：会话快照补齐 `pendingToolCalls`（此前缺失，重启后前端工具
   待执行状态会丢失）；每次挂起/结束时立即落盘，重启后可恢复"在等什么"。
3. **可重建执行器**：`ensureLive` 在任务应为 RUNNING 但订阅已死时，从
   `agent_task` + `agent_state_snapshot` + 事件日志重建会话、续接 seq 与累计
   文本，并把「THINK + 待执行工具」的检查点映射为 ACT（不重复推理）后
   `engine.resume` 续跑。
4. **幂等 resume**：按 toolCallId 去重，重试提交不会破坏工具消息配对。

## 3. 新增后端组件

| 包 | 文件 | 职责 |
|---|---|---|
| `v2.job` | `AgentJob` / `AgentJobStatus` | 任务模型 + 生命周期 |
| `v2.job` | `AgentJobStore` / `DefaultAgentJobStore` | Redis 主 + JDBC 兜底 |
| `v2.job` | `AgentJobService` | 创建/启动/恢复/取消/事件流 |
| `v2.job` | `AgentJobController` | `/api/v2/agent/tasks/**` REST |
| `v2.session` | `AgentSessionFactory` | 统一会话装配（tools/skills/画像/记忆注入） |
| `v2.memory` | `MemoryStore` / `DefaultMemoryStore` + 3 工具 | 跨会话长期记忆 |
| `v2.profile` | `UserProfileStore` / `DefaultUserProfileStore` + `ProfileRecorder` | 画像记录与注入 |
| `store.entity` / `store.mapper` | 3 张新表实体 + Mapper | 任务/记忆/画像 JDBC 镜像 |

## 4. 任务 API 契约

```
POST /api/v2/agent/tasks                 → R<JobView>{ taskId, sessionId, status }
GET  /api/v2/agent/tasks/{id}            → R<JobView>（轮询状态）
GET  /api/v2/agent/tasks/{id}/state      → R<StateView>（status + assistantText + lastSeq + pendingTools）
GET  /api/v2/agent/tasks/{id}/events?afterSeq=N → SSE（回放 + 实时，仅 seq > N）
POST /api/v2/agent/tasks/{id}/resume     → SSE（前端工具结果 / action=continue）
POST /api/v2/agent/tasks/{id}/cancel     → R<Void>
```

SSE 事件协议与旧 `/chat` 一致（`session.created`/`think.delta`/`tool.dispatched`/
`session.completed`…），每个事件载荷携带全局 `seq` 与 `taskId`。

## 4.1 中断续接（刷新/断连后让 agent 续上）

任务在服务端后台持续运行（与连接解耦）。刷新后前端从 `ChatSessionMeta.backendTaskId`
读取仍在有效期内的任务句柄，走 `V2AgentRuntime.attach(taskId)` 续接：

1. `GET /tasks/{id}/state` 取 `status` + `assistantText`（累计文本）+ `lastSeq` + `pendingTools`。
2. 按 `status` 分派：
   - `COMPLETED/FAILED/CANCELLED` → 补写最终结果/错误；
   - `RUNNING` → 以 `assistantText` 重建进行中文本，再 `GET /events?afterSeq=lastSeq` 只收新事件（避免重放导致前端工具重复执行与文本重复）；
   - `WAITING_TOOLS` → 执行 `pendingTools` 里的前端工具后 `POST /resume`；
   - `SUSPENDED` → 展示「继续执行」。
3. 正常完成一轮时前端清除 `backendTaskId`，预算挂起时保留，从而避免下次刷新重接已结束的旧任务。

## 5. 记忆与画像

- **记忆**：`MemoryStore.remember/recall/forget`，作用域 `u:<userId>:t:<tenantId>`；
  Redis 热缓存（`agent:memory:list:*`，TTL 7 天）+ JDBC 冷兜底（`agent_memory`）。
  三个内置工具 `remember` / `recall_memory` / `forget_memory` 由 agent 调用；
  INIT 前自动召回 top-k 相关记忆注入为 `system` 上下文。
- **画像**：`UserProfileStore`（Redis `agent:profile:*` + JDBC `agent_user_profile`）。
  `ProfileRecorder` 在会话结束时自动记录：交互次数、token、最常用模型、语言、
  工具/技能使用计数；显式事实/偏好经 `remember` 工具进入 `facts`/`preferences`。

## 6. 前端改造

`packages/common/src/ai/harness/v2-agent-runtime.ts` 由「单条 SSE 阻塞」切换为
「创建任务 + 事件流 + resume」，`HarnessEvent` 的 `session` 事件新增 `taskId`；
`use-agent-optimized.tsx` / `system-agent/context.tsx` / `Chat.tsx` /
`useSessionManager.ts` 同步贯穿 `taskId`（预算耗尽「继续执行」与前端工具 resume
均通过 taskId 恢复）。

## 7. 数据库迁移

`backend/knowledgecloud/script/migration/V4__agent_harness.sql`：
- `agent_task` — 长任务 JDBC 镜像
- `agent_memory` — 长期记忆
- `agent_user_profile` — 用户画像

时间戳统一为 epoch millis（BIGINT），与 Redis 表示对称。

## 8. P0 修复记录（正确性/安全）

- **resume 重入守卫**：`TaskRun.executionActive` 原子标志 + `synchronized(run)`，
  重试/双击 resume 不再二次订阅引擎（返回 live 尾部幂等续流）；
  `ensureLive`/`reconcile` 的判断改用同一标志（completed 而非 disposed 的订阅
  不再被误判为活跃）。`ensureLive`/`restorePaused` 用 `putIfAbsent` 防并发重建。
- **混合工具调用**：`ActHandler` 按路由位置拆分一轮工具调用——前端工具挂起前
  先执行后端工具并写入结果（消除孤儿 tool_calls 导致的 DeepSeek 400），
  挂起检查点只保留未执行的前端工具（重启后可正确恢复）。
- **任务属主校验**：`AgentJobController` 所有任务端点先做 tenant+user 校验
  （`requireOwnedJob`），拒绝时与"不存在"不可区分，不泄露任务存在性；
  SSE 端点返回 `session.failed(FORBIDDEN)`。
- **单测**：新增 `ResumeApplierTest`（resume 幂等/截断/continue）、
  `ActHandlerMixedToolsTest`（混合路由/顺序/pending 保留）、
  `AgentJobServiceResumeGuardTest`（重试不双订阅）、快照 pendingToolCalls 往返；
  全部 46 个测试通过（33 既有 + 13 新增）。
- resume 结果应用抽取为 `ResumeApplier`（可独立测试的纯逻辑）。

## 9. P1 稳定性加固记录

- **SSE 心跳**：任务事件流每 15s 发一次 SSE comment 帧（`keepalive`），长工具
  执行（最长 600s）期间不再触发代理/网关空闲断连；客户端解析器天然忽略。
- **assistantText 热存节流**：每 token 整段序列化是 O(n²)，改为每任务每秒至多
  一次 + 非文本（状态相关）事件即时保存；重启恢复时从事件日志回填节流窗口内
  缺失的文本增量（`backfillAssistantText`），续接文本仍完整。
- **检查点加密**：`agent.state.snapshot-interval` 调为 1——每个 THINK 后落快照，
  崩溃后至多重跑一个工具轮。
- **任务创建配额**：每租户创建限流（`task-create-per-minute`，滑动窗口）+
  并发任务上限（`max-concurrent-sessions`，活跃数取内存运行集与
  `agent_task` 表计数的较大者，跨重启有效）；超限在 `POST /tasks` 返回失败。
- **事件日志保留**：`agent_task_event` 冷层每 6 小时清理一次
  （`event-retention-days`，默认 30 天）。
- **stop→cancel**：前端 stop/新回合自动 `POST /tasks/{id}/cancel` 取消旧任务，
  被放弃的运行不再在服务端空烧 token。
- **测试**：新增租户并发上限用例；全量 47 个测试通过，前端两包 tsc 通过。

## 10. P2 前端体验记录

- **流中断自动重连**：`V2AgentRuntime` 的 consumeStream 跟踪 `sawCompletion`
  与 `lastSeq`；流在没有终态事件时断开（刷新以外的瞬时断网），driveLoop 自动
  从 `lastSeq` 以指数退避重连（上限 5 次），既不丢文本也不重复。
- **system-agent 面板续接**：`SystemAgentProvider` 将 taskId 持久化到
  localStorage（TTL 30min，终态后清除），新增 `attach(taskId)` 方法；
  `AIAssistantPanel` 挂载时检测未过期的 taskId 自动续接（重建占位气泡 +
  服务端检查点文本）。
- **多标签页协调**：新增 `agent-tab-lock.ts`（BroadcastChannel + localStorage
  心跳认领），同一任务同时只有一个标签页持有流；双标签页刷新互踩消除。
- **内联工具迁移**：`ai-utils.ts`（`streamKnowledgeText`/`streamKnowledgeChat`）
  从旧 `/chat` 同步路径迁移到任务 API（POST /tasks → GET /events），复用
  `parseV2SSEStream`；前端不再有走旧同步端点的调用。
- 验证：`@kn/common` / `@kn/plugin-ai` / `@kn/core` 三包 tsc 全部通过。

## 11. P3 清理与可观测记录

- **旧 /chat 委托任务模型**：`AgentV2Controller`（/chat + /chat/resume）重写为
  薄适配层——创建任务后直接流式任务事件日志（回放+实时+心跳），resume 按
  sessionId 解析 taskId（内存索引 + `agent_task` 表最近任务兜底）并做属主校验。
  删除重复的 buildSession/applyAgentDefinition/extractFrontendTools 与
  `suspendedSessions` 内存表，统一复用 `AgentEventSerializer`。
- **画像上限**：`facts`/`preferences` 各上限 20 条，超出淘汰最旧（注入提示词有界）。
- **工具 schema 缓存**：`ChatCompletionRequest` 补 `capabilitiesVersion` 字段 →
  `AgentSession`/`AgentSessionFactory` 透传 → `ToolRegistry.buildToolsJsonCached`
  （版本+工具集 有界缓存，128 条满则清空；空版本绕过缓存）→ `ThinkHandler` 使用。
- **任务指标**：新增 `AgentJobMetrics`（created/completed/failed/cancelled/
  suspended/revived 计数器），`AgentJobService` 全生命周期埋点；新增管理端
  `GET /admin/ai/tasks/metrics`（计数器 + 活跃任务数 + 内存运行集大小，
  复用 /admin/ai 网关保护面）。
- **死代码清理**：删除 `AgentEventStore`（会话级 Redis 事件日志，已被任务事件
  日志取代）与 `useSessionManager.ts`（多会话存储已统一）；`V2ChatClient` 标记
  `@deprecated`（保留导出兼容）。
- **测试**：新增 `ToolRegistryCacheTest`；全量 51 个测试通过，前端两包 tsc 通过。

### 11.1 V1 遗留表评估（暂保留，不删除）

| 表 | 现状 | 建议 |
|---|---|---|
| `agent_skill` / `agent_plugin` / `agent_remote_skill` | 仅 V1 技能注册/远程技能使用；V2 技能目录由前端每次随请求传入 | 保留（V1 兼容/历史数据），观察后按需下线 |
| `agent_conversation` / `agent_message` / `agent_session` | V2 从不写入（对话历史由前端持有、快照在 `agent_state_snapshot`） | 保留备查；若需要服务端对话审计可改为任务完成时归档写入 |
| `agent_state_snapshot` / `agent_definition` / `agent_usage_record` | V2 活跃使用 | 保留 |
| `agent_task` / `agent_task_event` / `agent_memory` / `agent_user_profile` | 本次改造新增，活跃使用 | 保留 |

## 12. 后续可做（未在本次落地）

- 事件日志冷热归档策略（当前 Redis TTL 24h + MySQL 永久镜像已可跨 TTL 回放）。
- 记忆检索引入 embedding/向量库（`MemoryStore` 已预留接口）。
- 画像的 LLM 蒸馏合并（当前为确定性规则统计）。
- `/chat` 同步兼容入口改为内部转发到任务模型（当前保留旧逻辑）。
- 如需更严格的崩溃恢复（减少至多一次重放的工具轮），可把
  `agent.state.snapshot-interval` 调为 1（每个 THINK 后都检查点，代价是更频繁的快照写）。
