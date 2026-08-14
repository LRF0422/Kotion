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
AgentJobService（后台任务编排，脱离 HTTP 线程）
   ├─ 状态机: QUEUED→RUNNING→SUSPENDED/WAITING_TOOLS→COMPLETED/FAILED/CANCELLED
   ├─ 事件回放: 每任务 Sinks.replay().limit(10k) + AgentJobStore(Redis+JDBC)
   └─ 可取消（Disposable）
        │
        ▼
AgentEngine（保留：状态机 + 拦截器链）
   ├─ INIT 前注入: 系统提示词 + 用户画像 + 相关记忆（AgentSessionFactory）
   ├─ 工具路由: 后端 / 前端（保留）
   └─ 会话级 scratchpad（保留）
        │
        ├──▶ MemoryStore（新增，跨会话）     remember/recall_memory/forget_memory
        ├──▶ UserProfileStore（新增，画像）   自动记录 + 注入
        └──▶ SnapshotStore（保留）
```

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
GET  /api/v2/agent/tasks/{id}/events     → SSE（回放 + 实时）
POST /api/v2/agent/tasks/{id}/resume     → SSE（前端工具结果 / action=continue）
POST /api/v2/agent/tasks/{id}/cancel     → R<Void>
```

SSE 事件协议与旧 `/chat` 一致（`session.created`/`think.delta`/`tool.dispatched`/
`session.completed`…），新增 `taskId` 字段贯穿每个事件载荷。

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

## 8. 后续可做（未在本次落地）

- `AgentEventStore.replayAfter`（Redis 事件回放）接到任务事件流，支持跨进程重启后回放。
- 记忆检索引入 embedding/向量库（`MemoryStore` 已预留接口）。
- 画像的 LLM 蒸馏合并（当前为确定性规则统计）。
- `/chat` 同步兼容入口改为内部转发到任务模型（当前保留旧逻辑）。
