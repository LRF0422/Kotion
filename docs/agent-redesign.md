# Agent 全新设计 —— AgentCore（从 0 重写）

> 决策记录：2026-08。彻底舍弃现有 agent 代码（后端 v1/v2/v3、前端 harness/chat-client/v3/system-agent），
> 以 **editor 为主要服务对象** 重新设计。运行时留在 Java 后端（复用网关/认证/Redis/MySQL 基础设施），
> 前端交付全新 AgentClient SDK + 重做的 editor 面板。editor 工具资产（`packages/core/src/ai/tools` +
> offscreen 宿主）保留并接入新执行器接口。

## 1. 设计原则

1. **小核心**：核心只包含 任务生命周期 + 事件溯源 + 一个同步驱动的最小 agent loop。
   记忆、子 agent、计划、上下文压缩、工具路由都是挂在 loop 上的独立模块。
2. **单一职责**：Supervisor（生命周期/租约/配额）、Loop（执行）、EventLog（事件溯源）、
   Checkpoint（断点）、Memory（记忆）、Delegator（子 agent）、ToolGateway（工具）、ContextManager（上下文）。
3. **事件先落盘，后推送**：所有事件带全局单调 seq，先写 Redis ZSET + MySQL 冷层，再推给订阅者。
4. **快照只存可序列化状态**：运行时句柄不入快照；安全边界 = 每轮推理前 / 挂起时 / 结束时。
5. **单 conversation 单 active run**：新 create 自动取消旧 run；前端只持有 `runId + lastSeq + pendingTools`。
6. **同步核心**：loop 用阻塞式代码跑在独立执行线程（每 run 一个），LLM 流式由客户端内部消化；
   不再使用 Reactor `windowUntil/collectList` 之类的响应式编排（v3 复盘已确认这是复杂度来源）。
   传输层用 SseEmitter（回放 + 实时 + 心跳注释帧）。

## 2. 核心概念模型

| 概念 | 说明 |
|---|---|
| **Conversation（会话）** | 跨轮对话上下文。后端落 `agent_thread` 表（摘要/标题/active run 指针）。JSON 契约沿用 `conversationId`。 |
| **Run（一次运行）** | 一个 agent 执行单元 = 一次「用户输入 → 多轮 think/act/observe → 终态」。字段：runId(UUID)、conversationId、parentRunId、userId、tenantId、model、mode、status、finishReason、usage、lastSeq、checkpointSeq、时间戳。 |
| **Step（一轮）** | think（LLM 推理出文本增量 + 工具调用）→ act（路由执行）→ observe（观察结果写回）。 |
| **Checkpoint（断点）** | 可序列化执行状态：消息历史（含压缩后形态）、pending 前端工具调用、累计文本、工作记忆、迭代计数、token 用量、委派深度。崩溃恢复 = 快照 + 事件日志续接。 |
| **Event（事件）** | 只追加事件日志，seq 单调。断点恢复/前端重连/子任务审计都走同一日志。 |
| **Memory（记忆）** | 三层：工作记忆（run 内 scratchpad）、会话记忆（thread 摘要 + 最近轮次）、长期记忆（user/space/page 分级）。 |
| **Sub-run（子 agent）** | 普通 Run + parentRunId 关联；独立 checkpoint/预算/事件日志；结果聚合为父 loop 的工具结果。 |

Run 状态机：

```
QUEUED → RUNNING ⇄ WAITING_TOOLS   （等待前端/编辑器工具结果）
              ⇄ SUSPENDED          （plan_approval 计划审批 / budget 预算耗尽）
        → COMPLETED | FAILED | CANCELLED
```

## 3. 后端模块（knowledge-agent-skills 内新包 `com.knowledge.agent.core.*`，位于应用扫描基包内）

```
agentcore/
├── run/          AgentRun, RunStatus, RunView, RunStore(Redis热+MySQL冷), RunEvent, RunEventLog, RunEventSink
├── loop/         AgentLoop（同步驱动）, LoopContext, StepResult
├── checkpoint/   Checkpoint, CheckpointCodec(Jackson), CheckpointStore
├── memory/       MemoryEntry, LongMemoryStore, MemoryRetriever(接口,预留embedding), WorkingMemory, ThreadMemory
├── delegate/     Delegator, DelegateSpec
├── tool/         ToolSpec, ToolKind(BACKEND|FRONTEND), ToolExecutor, ToolGateway, ToolCatalog, builtin/*
├── context/      ContextManager, ContextPlan, ContextCompactor（三级压缩）
├── llm/          LlmGateway（包装 LlmClientFactory，OpenAI 兼容流式）, InferenceRequest/Response, ToolCallAccumulator
├── skill/        RemoteSkillRegistry（重写 v1 远程技能消费端）
├── supervisor/   RunSupervisor, RunQuota, RunLease
├── web/          EditorAgentController + dto
├── entity/ + mapper/   MyBatis-Plus 实体与 Mapper
└── config/       AgentCoreProperties(prefix: agent), AgentCoreAutoConfiguration
```

### 3.1 执行模型（AgentLoop）

```
loop(run):
  1. 恢复 checkpoint（或新建）
  2. ContextManager 组装消息：
     system 提示 + skills 片段 + 用户偏好 + 召回长期记忆 + thread 摘要 + 历史 + 工作记忆
  3. LlmGateway 流式推理 → text.delta / reasoning.delta 事件；累积工具调用
  4. 无工具调用 → 完成（或迭代预算耗尽 → suspend:budget）
  5. 有工具调用 → ToolGateway 路由：
     - 后端工具：并行执行（上限 maxParallel）→ tool.completed 事件 → 结果写回 observe
     - 前端工具：checkpoint 记录 pendingToolCalls → status=WAITING_TOOLS，等待 resume
     - delegate 工具：Delegator 创建子 run（阻塞等待终态，超时控制）→ sub.* 事件 → 结果作为工具结果
  6. present_plan（plan 模式）→ suspend:plan_approval
  7. 观察结果 → 回到 2（写 checkpoint 于每轮推理前）
```

### 3.2 断点恢复的四项保证

1. **事件日志先行**：`agent:run:events:{runId}` Redis ZSET(score=seq, TTL 24h) + MySQL `agent_run_event`
   冷层（永久镜像）；回放按 `(runId, seq)` 索引，与进程内存无关。
2. **全量快照**：快照包含 pendingToolCalls（重启后「在等什么」不丢失）；每轮推理前 + 挂起 + 结束时落盘；
   Redis 存最新，MySQL 按 seq upsert 保留最新一份（可选保留每第 5 步一份）。
3. **可重建执行器**：租约过期且状态为 RUNNING/WAITING_TOOLS 时 reconcile：加载快照 + 续接 seq，
   从断点继续（不重复推理、不重复执行已完成工具）。
4. **幂等 resume**：按 callId 去重；重试提交不破坏工具消息配对；WAITING_TOOLS 超时（默认 10 分钟）→ FAILED(tool_timeout)。

### 3.3 租约 / 配额

- 租约：Redis `agent:run:lease:{runId}` SET NX EX（默认 30s），loop 定期续租；崩溃后租约过期，
  reconcile 可被任意实例接管（多实例安全）。
- 配额：每租户并发 run 上限（默认 5）+ 创建速率（默认 30/分钟，滑动窗口）。

## 4. 记忆系统（三层）

| 层 | 存储 | 生命周期 | 注入方式 |
|---|---|---|---|
| 工作记忆 | checkpoint 内 scratchpad | 随 run 结束归档为摘要 | `update_scratchpad`/`get_scratchpad` 工具 + 每轮组装注入 |
| 会话记忆 | `agent_thread`（summary/title + 最近轮次） | 跨轮持久 | run 开始时注入 summary |
| 长期记忆 | `agent_long_memory`（Redis 热 + MySQL 冷） | 用户级持久 | `remember`/`recall_memory`/`forget_memory` 工具 + run 开始自动召回 top-k 注入 |

- 长期记忆字段：memoryId、scope（`u:{userId}` / `u:{userId}:s:{spaceId}` / `u:{userId}:s:{spaceId}:p:{pageId}`）、
  type（fact | preference | note | episode）、content、importance(0-100)、tags、embeddingRef(预留)、时间戳。
- 召回打分：`importance × 0.7 + recency 衰减 × 0.3 + 关键词/tag 命中加成`；top-k（默认 5）注入。
- `MemoryRetriever` 接口预留：未来 `EmbeddingMemoryRetriever` 只需替换实现，接口签名不变。
- 用户画像 = preference/fact 类长期记忆的聚合注入，不单独建表（削减概念）。
- 会话结束：后台任务用 LLM 生成 1~2 句摘要 + 标题写入 `agent_thread`。

## 5. 子 agent（Delegator）

- 工具：`delegate`，参数 `{ task, tools?(客户端工具子集), mode?, maxSteps?, timeoutSec? }`。
- 实现：子 run = 普通 Run（parentRunId 关联、继承用户/租户/会话、独立预算与事件日志）。
  父 loop 阻塞等待子 run 终态（CompletableFuture 注册到 Supervisor，超时默认 600s）。
- 事件：父日志追加 `sub.spawned` / `sub.completed(result)` / `sub.failed(error)`；
  子 run 的完整事件日志通过 `GET /runs/{subRunId}/events` 按需下钻（UI 子任务树点开查看）。
- 并发：一轮内多个 delegate 调用并行执行（受 maxParallel 限制）。
- 深度：maxDelegateDepth（默认 3），超出拒绝。取消级联：父 cancel → 子递归 cancel。

## 6. 工具网关（ToolGateway）

- `ToolSpec`：name、description、inputSchema(JSON Schema)、kind(BACKEND|FRONTEND)、readOnly、source(builtin|skill|client)。
- 来源：
  1. **内置后端工具**：`web_search`、`web_fetch`、`remember`、`recall_memory`、`forget_memory`、
     `update_scratchpad`、`get_scratchpad`、`delegate`、`present_plan`、`get_run_state`。
  2. **远程技能**：其他微服务 `@AgentSkill` 注册（保留 knowledge-core-agent SDK 不动，重写消费端 RemoteSkillRegistry）。
  3. **前端声明目录**：create 请求携带编辑器工具目录（`packages/core/src/ai/tools` 16 个工厂收集）。
- plan 模式门禁：只允许 readOnly 工具 + present_plan；计划批准后开放全量。
- 前端工具流程：`tool.requested`（含 callId+spec+args）→ 挂起 WAITING_TOOLS → 前端执行 →
  `POST /resume {action:tool_results}` → callId 校验 → observe 写回 → 继续。

## 7. 上下文管理（ContextManager）

- 预算：maxContextTokens（按模型配置），组装后估算 token（字符/4 启发式 + 工具 schema 开销）。
- 三级压缩：L1 淘汰超龄工具结果（默认 3 轮，替换为占位说明）→ L2 摘要中段轮次（独立模型调用）→ L3 硬截断。
- 稳定前缀：system + tools schema + 记忆注入保持不变，只压缩中段（命中 provider 缓存）。

## 8. API 契约（全新，旧端点删除）

```
POST   /api/agent/v1/runs                       创建并启动 run → { runId, conversationId, status }
GET    /api/agent/v1/runs/{runId}               状态视图 { status, finishReason, lastSeq, usage, pendingTools }
GET    /api/agent/v1/runs/{runId}/events?afterSeq=N   SSE（回放 + 实时 + 心跳注释帧）
POST   /api/agent/v1/runs/{runId}/resume        SSE；{ action: tool_results|approve_plan|continue, ... }
POST   /api/agent/v1/runs/{runId}/cancel        → { status: CANCELLED }
DELETE /api/agent/v1/threads/{threadId}/active-run    取消会话活跃 run
GET    /api/agent/v1/threads/{threadId}         会话摘要/标题/活跃 run（前端恢复用）
GET    /api/agent/v1/memory?scope=&query=&limit=  记忆浏览（UI）
DELETE /api/agent/v1/memory/{memoryId}          删除记忆（UI）
```

事件协议（SSE `data:` JSON，全局 seq）：

```json
{"seq":1,"type":"run.created","runId":"…","conversationId":"…","model":"…","mode":"execute"}
{"seq":2,"type":"step.started","step":1}
{"seq":3,"type":"text.delta","content":"我"}
{"seq":4,"type":"reasoning.delta","content":"…"}
{"seq":5,"type":"tool.requested","callId":"c1","tool":"editor.insert","args":{}}          // 前端工具
{"seq":6,"type":"tool.completed","callId":"c2","tool":"web_search","ok":true,"result":{}} // 后端工具
{"seq":7,"type":"sub.spawned","callId":"c3","subRunId":"…","task":"…"}
{"seq":8,"type":"sub.completed","callId":"c3","subRunId":"…","ok":true,"result":"…"}
{"seq":9,"type":"plan.proposed","callId":"c4","plan":{…}}
{"seq":10,"type":"run.suspended","reason":"plan_approval|budget","pendingCallIds":["c1"]}
{"seq":11,"type":"run.completed","finishReason":"stop","usage":{…}}
{"seq":12,"type":"run.failed","code":"tool_timeout","error":"…"}
{"seq":13,"type":"run.cancelled"}
```

## 9. 数据库迁移（V7__agentcore.sql，旧表保留数据不删）

```sql
agent_run            -- run 主体：run_id(uk), conversation_id, parent_run_id, user_id, tenant_id,
                     --   model, mode, status, finish_reason, last_seq, prompt_tokens,
                     --   completion_tokens, error_message, create_time, update_time
agent_run_event      -- 事件冷层：run_id, seq, event_type, payload, create_time; uk(run_id, seq)
agent_run_checkpoint -- 断点：run_id, seq, state_json, create_time; uk(run_id, seq)
agent_long_memory    -- 长期记忆：memory_id(uk), scope, user_id, tenant_id, space_id, page_id,
                     --   type, content, importance, tags, embedding_ref, create/update/last_access_time
agent_thread         -- 会话：thread_id(uk), user_id, tenant_id, title, summary, active_run_id, create/update_time
```

Redis 键：

```
agent:run:hot:{runId}            -- 热状态 JSON（status/lastSeq/累计文本/pendingTools）
agent:run:events:{runId}         -- ZSET seq→事件 JSON（TTL 24h）
agent:run:checkpoint:{runId}     -- 最新断点 JSON
agent:run:lease:{runId}          -- 租约 SET NX EX
agent:memory:list:{scope}        -- ZSET memoryId→(importance+recency 分数)，TTL 7d
agent:memory:entry:{memoryId}    -- 记忆详情 hash，TTL 7d
agent:thread:{threadId}          -- 会话热缓存
```

## 10. 前端 SDK（packages/common/src/ai/agent —— 全新）

```
agent/
├── client.ts          AgentClient：createRun/attachRun/resume/cancel/events（自动重连、lastSeq 持久化）
├── events.ts          事件解析器 + 类型化 AgentEvent（替代 v2-sse-parser）
├── run-store.ts       本地会话存储：{conversationId, runId, lastSeq, ttl} + 多标签页锁（BroadcastChannel）
├── tool-executor.ts   EditorToolExecutor：前端工具执行、callId 幂等缓存、编辑器操作带 AI 事务 meta
├── use-editor-agent.ts  editor 绑定 hook：run 生命周期/事件流/工具执行/计划审批/断点恢复 UI 状态
├── types.ts           ToolSpec/AgentEvent/RunView/ResumePayload…
└── index.ts
```

- UI 状态机：streaming / executing-tools / waiting-tools / waiting-approval / suspended-budget / completed / failed。
- 断点恢复：刷新后从 RunStore 读 `runId`（TTL 内）→ `GET /runs/{id}` → 按状态分派
  （RUNNING→attach 收增量；WAITING_TOOLS→执行 pendingTools 后 resume；SUSPENDED→展示「继续」）。
- 工具执行与 UI 解耦；结果缓存保证事件重放不重复执行编辑器操作。

## 11. Editor 面板（core 重做）

- 新 `AgentPanel`（editor 侧边面板，替代 AIAssistantPanel 内部实现）：
  会话历史、流式文本、步骤列表、工具执行条目、子任务树（可下钻子 run 事件）、计划审批卡片、
  「继续执行」断点恢复、记忆管理入口。视觉语言保留，内部全部切新 SDK。
- AIAssistantPage / 快捷键触发保留。

## 12. 删除清单

**后端**（同一次改造内删除）：
- `com.knowledge.agent.core.*`（v1 引擎/渠道/远程工具注册旧实现）
- `com.knowledge.agent.v2.*`（状态机引擎/任务服务/记忆/画像/委派/事件）
- `com.knowledge.agent.v3.*`（任务监督器）
- 旧 controller：AgentV2Controller / AgentJobController / AgentTaskController / AdminAgentTaskController
- 旧 store 实体/Mapper（旧表保留数据；新的 entity/mapper 只面向新表）
- 保留不动：`knowledge-core-agent` SDK（其他服务 @AgentSkill 注册依赖）、`LlmClientFactory`
  （模型端点/密钥基础设施）、ModelController（模型管理 UI）、旧表（数据备查）。

**前端**：
- 删除：`harness/*`、`chat-client/*`、`v3/*`、`system-agent/*`、`use-agent-optimized.tsx`、
  `use-capability-providers.tsx`（并入新 SDK）、`discovery/` 中仅服务旧 harness 的代码、
  `ai-utils` 旧 stream 函数（在新 SDK 上重写）
- 保留：`packages/core/src/ai/tools`（16 个编辑器工具工厂）、`offscreen`（离屏编辑器宿主）、
  `skills` 系统、`capabilities` 目录收集、locales。

## 13. 实施里程碑

| 阶段 | 内容 | 验证 |
|---|---|---|
| M1 | 后端最小闭环：run 状态机 + 事件溯源 + checkpoint + 断点恢复 + REST/SSE API | mvn 编译 + 单测（事件日志/快照/恢复） |
| M2 | 记忆三层 + 工具网关（前端工具路由 + 内置工具 + 远程技能消费端） | 单测（记忆召回/路由/幂等） |
| M3 | 子 agent + plan 模式 + 上下文压缩 + 租约/配额 + **删除旧后端代码** + 迁移 V7 | 全量 mvn 编译 + 测试 |
| M4 | 前端 SDK（client/events/run-store/tool-executor/use-editor-agent） | tsc |
| M5 | editor 面板重做 + plugin-ai 适配 + **删除旧前端代码** + 文档 | pnpm 全量 tsc + build |
```

> 兼容性说明：新 API 不复用旧语义；前端切换是一次性动作（SDK + UI 同步上线）。
> 旧表（agent_task/agent_task_event/agent_memory…）保留数据不删除，新系统使用全新表名避免冲突。

## 14. 实现记录（2026-08 落地）

### 14.1 后端（knowledge-agent-skills，包 `com.knowledge.agent.core.*`，155 个旧类已删除）

| 包 | 内容 | 状态 |
|---|---|---|
| `run/` | AgentRun/RunStatus/PendingToolCall/RunView + RunStore（Redis 热 + MySQL 冷） | ✅ |
| `event/` | RunEvent/RunEvents/RunEventLog（ZSET 热 + 异步 MySQL 镜像 + 内存订阅扇出）+ EventSubscription | ✅ |
| `checkpoint/` | Checkpoint/CheckpointCodec/CheckpointStore（每轮推理前落盘，恢复 = 快照 + 事件续接） | ✅ |
| `llm/` | LlmGateway（同步驱动 LlmClientFactory + ToolCallAccumulator 流式工具调用合并 + 一次重试） | ✅ |
| `tool/` | ToolSpec/BackendTool/ToolGateway（静态内置 + 动态远程技能）+ builtin 8 个工具 | ✅ |
| `loop/` | AgentLoop（同步循环：推理→路由→后端并行/前端挂起/委派/计划审批→观察→预算）+ ResumeGate | ✅ |
| `supervisor/` | DefaultRunSupervisor（create/cancel/resume/reconcile/租约续期）+ RunLease + RunQuota + ThreadStore | ✅ |
| `memory/` | MemoryEntry/MemoryScope/MemoryStore/MemoryRetriever/KeywordMemoryRetriever/MemoryInjector/ThreadSummarizer | ✅ |
| `delegate/` | Delegator/Delegation（子 run 创建、事件订阅、结果路由、超时取消） | ✅ |
| `skill/` | RemoteSkillRegistry/RemoteSkillTool/RemoteSkillController（SDK 契约不变，消费端重写） | ✅ |
| `web/` | EditorAgentController（/api/agent/v1/**）+ RunStreamer（SSE 回放+实时+心跳+去重）+ AdminAiUsageController（用量改读 agent_run）+ ModelController | ✅ |
| `config/` | AgentCoreProperties（prefix: agent）+ AgentCoreAutoConfiguration（双执行器） | ✅ |

- 内置工具：web_search、web_fetch、remember、recall_memory、forget_memory、update_scratchpad、
  get_scratchpad、get_run_state、present_plan、delegate。
- 测试：15/15 通过（ToolCallAccumulator/CheckpointCodec/KeywordMemoryRetriever/MemoryScope/ResumeGate）。
- 迁移：`backend/knowledgecloud/script/migration/V7__agentcore.sql`（agent_run/agent_run_event/
  agent_run_checkpoint/agent_long_memory/agent_thread）。
- 保留：`com.knowledge.agent.llm.*`（LlmClientFactory）、knowledge-core-agent SDK、
  agent_model_price 表（实体迁至 agent.core）、旧数据表。

### 14.2 前端（packages/common/src/ai/agent/）

- `client.ts` AgentClient：createRun/getRun/cancelRun/streamEvents（自动重连 + seq 去重）/resume/
  getThread/listMemory/deleteMemory/deleteActiveRun。
- `events.ts`：SSE 帧解析（data 行、keepalive 注释、CR/LF）。
- `run-store.ts`：RunStore（本地 {conversationId,runId,lastSeq} 持久化 + TTL）+ RunLock（多标签页心跳锁）。
- `tool-executor.ts`：EditorToolExecutor（callId 幂等缓存 + 超时 + 执行回调）。
- `use-editor-agent.ts`：useEditorAgent（run 生命周期 + 事件归约 + 工具自动执行/恢复/审批/续批）。
- `ai-utils.ts`：streamKnowledgeText/streamKnowledgeChat 已在新 SDK 上重写（noTools 纯文本模式），签名不变。
- editor 面板 `AIAssistantPanel.tsx` 已重做（新 SDK + 断点恢复 + 计划/执行模式切换 + 工具/子任务/计划卡片）；
  ui 的 SubAgentTree/PlanApprovalCard 已换新 props。
- M5 扫尾（删除 harness/chat-client/v3/system-agent/use-agent-optimized 等旧模块 + plugin-ai Chat/
  ChatComposer/AiInlineMenu/AIAssistantPage 适配）由独立子任务执行，验收 = 各包 tsc 通过。

### 14.3 与设计稿的偏差（有意简化/增强）

1. **会话表更名 agent_thread**（旧 agent_conversation 表名被 V1 占用），JSON 契约仍用 conversationId。
2. **子任务工具协议**：child 的 tool.requested 由父 loop 转发到父事件日志（附 subRunId），
   客户端一次 resume 同时携带父子工具结果，loop 按 PendingToolCall.subRunId 路由回子 run；
   checkpoint 中 PendingToolCall 增加 subRunId/delegateCallId 字段支撑崩溃恢复。
3. **checkpoint 只保留最新一份**（uk(run_id) 而非 (run_id,seq) 多版本）——恢复只需要最新快照。
4. **noTools 纯文本模式**：create 请求可传 noTools=true，模型不挂任何工具（供 inline 文本流使用）。
5. **present_plan 仅在 mode=plan 时拦截**；execute 模式下它作为普通后端工具返回。
6. **run 增加 space_id/page_id 列**（编辑器作用域，记忆分级用）；JWT token 只存热状态与快照，不落 MySQL。
7. 管理端用量聚合改读 agent_run（agent_usage_record 表废弃）；custom agent 定义（agent_definition）整体移除，
   自定义 agent 能力由 skills 系统承接。
8. 上下文压缩（L1 淘汰/L2 摘要/L3 截断）接口已就位（ContextManager），具体压缩策略留待下一步迭代。

### 14.4 验证

- 后端：`mvn -pl knowledge-service/knowledge-agent-skills -am test` → BUILD SUCCESS，19/19 测试通过
  （含 EditorAgentControllerMappingTest 回归守卫：URL 契约 + spring.factories 注册）。
- 前端：common/ui/plugin-ai tsc 通过；core 中旧栈消费方（AiInlineMenu/AIAssistantPage 等）由 M5 扫尾清理。

### 14.5 修复记录：组件扫描与包结构（最终方案）

**原则：agent 代码全部放在 agent 模块的包命名空间内（`com.knowledge.agent.core.*`，应用扫描基包
`com.knowledge.agent` 的子包），由应用自带组件扫描注册；不使用 spring.factories、不加额外
@ComponentScan、不修改 knowledge-core-* 基础架构模块。**

过程中的两次教训（均已按上述原则收敛）：
1. 早期曾把包放在 `com.knowledge.agentcore`（扫描基包之外）→ 新端点全部 404；
   曾用 spring.factories + @ComponentScan 修补，后废弃。
2. 曾误改 knowledge-core-secure（加 @ComponentScan）试图补齐 JwtTokenProvider → 影响所有服务，已回滚。

对平台安全栈的唯一依赖：`AgentCoreAutoConfiguration` 中一个 `@ConditionalOnMissingBean` 的
`JwtTokenProvider` 兜底 @Bean —— 平台已注册时绝不生效，平台缺失时才兜底，不改动平台任何文件。

守卫测试：`AgentCoreScanTest`（运行时类必须在 `com.knowledge.agent.*` 内、自动装配不得声明
@ComponentScan、兜底 Bean 存在且带 @ConditionalOnMissingBean）+ `EditorAgentControllerMappingTest`
（URL 契约 + 包位置）。

