# Agent Harness 实施计划（P0 → P7）

> 配套蓝图：[`AGENT_HARNESS_ARCHITECTURE.md`](./AGENT_HARNESS_ARCHITECTURE.md)。
> 本文把蓝图收敛为**可执行、分阶段、文件级**的实现计划。每个 Phase 独立可上线、独立可回滚、前端协议全程兼容。
>
> 约束（贯穿）：Java 1.8 / Spring Boot 2.7 / WebFlux+Reactor / Redis；保持现有 Maven 模块边界；前端 SSE / Data Stream 协议兼容。

---

## 实施状态（2026-06-13）

> ⚠️ 本会话中 Bash 沙箱安全分类器全程不可用，**所有 Java/前端改动尚未经过编译验证**（仅逐文件人工 review）。落地前必须先跑一次编译（命令见文末「验证」）。P0–P7 全部已实现（含两处决策已就地落定，见下）。

| Phase | 状态 | 说明 |
|---|---|---|
| **P0** 契约与埋点 | ✅ 已实现（待编译） | AgentError/AgentErrorCode、StreamEvent seq/ts、EventSequencer、DataStreamEncoder error 字段、ChatController traceId+seq+AgentMetrics、前端 ErrorEvent code/retriable |
| **P1** 真流式 | ✅ 已实现（待编译） | ResponseAccumulator + HarnessLoop 流式 runTurn/continueOrFinish，开关 `agent.harness.streaming.enabled`（旧路径保留） |
| **P2** 状态收敛（部分） | ✅ 已实现（待编译） | 标记分隔、可重渲染的动态技能 prompt 段（替换 `contains()` 字符串拼接）。**注**：不可变 LoopState / ConversationBuffer 全量改造未做（避免再次重写未验证的核心 loop），留作后续 |
| **P3** 持久化 | ✅ 已实现（待编译） | **决策：用 Redis 事件日志**（复用现有依赖，无 DDL）。`store/AgentEventStore`（append/replayAfter）+ ChatController write-through |
| **P4** 容错 | ✅ 已实现（待编译） | **决策：原生 Reactor，不引入 Resilience4j**。`llm/LlmResilience`（idle/首 token 超时）+ 同步工具 `timeout`→可恢复错误回喂。SubAgent 构造已同步修正 |
| **P5** 恢复/续传 | ✅ 已实现（待编译） | `GET /chat/resume`：按 `Last-Event-ID` 从事件日志 replay。**注**：mid-turn live attach（hot Flux）留作后续，当前为 replay-only |
| **P6** 子 agent 可视化 | ✅ 已实现（待编译） | SubAgentEvent parentAgentId/depth、ToolContext.agentId、DelegateTool 生命周期事件、DataStreamEncoder 路由到 `8:` 注解；前端 annotation 契约 + `subAgents` 树状态 |
| **P7** Plan Mode | ✅ 已实现（待编译） | AgentMode、ChatCompletionRequest.mode、ToolContext.mode、三层只读门控（catalog 过滤 / prompt / 硬拦截 PLAN_MODE_VIOLATION）、present_plan 拦截→plan_proposed+`plan-approval`、PresentPlanTool；前端 mode 全链路 + PlanArtifact/plan_proposed + `pendingPlan` 状态 |

**已改动 / 新增文件清单**
- 后端 `agent-api`：`error/AgentError.java`✚、`error/AgentErrorCode.java`✚、`dto/AgentMode.java`✚、`dto/ChatCompletionRequest.java`
- 后端 `agent-skills`：
  - `core/engine/`：`StreamEvent.java`、`EventSequencer.java`✚、`DataStreamEncoder.java`、`SubAgentEvent.java`
  - `harness/`：`ResponseAccumulator.java`✚、`HarnessLoop.java`、`SystemPromptBuilder.java`、`SubAgent.java`、`SubAgentFactory.java`
  - `llm/`：`LlmResilience.java`✚
  - `store/`：`AgentEventStore.java`✚
  - `observability/`：`AgentMetrics.java`✚
  - `tool/`：`ToolContext.java`、`tool/builtin/DelegateTool.java`、`tool/builtin/PresentPlanTool.java`✚
  - `controller/ChatController.java`
- 前端 `@kn/common`：`chat-client/types.ts`、`chat-client/sse-parser.ts`、`chat-client/index.ts`、`harness/types.ts`、`harness/agent-harness.ts`、`system-agent/context.tsx`

（✚ = 新增文件）

**仅剩的 UI 渲染件（未做，需各自 UI 框架）**：P6 子 agent 卡片树组件、P7 计划审批卡片组件 —— 状态/契约已就绪（`state.subAgents`、`state.pendingPlan`），由聊天 UI（`plugin-ai`）消费渲染即可。

---

## 总览

| Phase | 主题 | 主要交付 | 依赖 | 风险 | 粗估 |
|---|---|---|---|---|---|
| **P0** | 契约与埋点 | `AgentError`、事件 `seq`/SSE `id`、Micrometer、traceId | — | 极低 | 2–3 人天 |
| **P1** | 真流式 | `ResponseAccumulator` + 续传式递归取代 `collectList`/`expand` | P0 | 中 | 4–6 人天 |
| **P2** | 状态收敛 | 不可变 `LoopState`、`ConversationBuffer`、分层 prompt | P1 | 中 | 3–5 人天 |
| **P3** | 持久化 | 三实体落库 + `PersistenceInterceptor` 异步 write-through | P0(可并行 P1/P2) | 中 | 4–6 人天 |
| **P4** | 容错 | `LlmGateway`(重试/熔断/超时) + 单工具超时 + 取消贯穿 | P0,P1 | 中 | 4–5 人天 |
| **P5** | 恢复/续传 | hot Flux + `Last-Event-ID` replay + 幂等 | P3 | 高 | 5–8 人天 |
| **P6** | 多 agent + 子 agent 可视化 | `ToolDescriptor` 统一 + 并行执行 + `RunBudget` + 子 agent 树 | P1,P3 | 中 | 6–9 人天 |
| **P7** | Plan Mode | 只读三层门控 + `present_plan` + 批准回合 + 审计 | P3,P6 | 中 | 5–7 人天 |

**关键路径**：P0 → P1 → P2 → P6 → P7；P3 可在 P1/P2 旁并行启动，P4 紧跟 P1，P5 必须在 P3 之后。

**通用约定**
- **特性开关**：每个有行为变更的 Phase 挂 `agent.harness.<feature>.enabled`（默认 false → 灰度 → 默认 true → 移除旧路径）。
- **协议守门测试**：建立「SSE/Data Stream 帧 golden 测试」，断言旧帧格式不被破坏；任何新增字段都是 optional。
- **Mock LLM**：引入一个可编排 `StreamChunk` 序列的 `MockLlmClient`，让 loop 行为可单测、可复现（贯穿 P1+ 全程必备）。

后端根包：`backend/knowledgecloud/knowledge-service/knowledge-agent-skills/src/main/java/com/knowledge/agent/`（下文简称 `…/agent/`）。
契约模块：`…/knowledge-service-api/knowledge-agent-api/`（简称 `agent-api`）。
前端根：`packages/common/src/ai/`（简称 `fe:`）。

---

## P0 · 契约与埋点

**目标**：零行为变更，先把后续都要用的契约与可观测性铺好。低风险、可独立合并。

### 改动清单
| # | 文件/位置 | 改动 |
|---|---|---|
| 0.1 | `agent-api` 新增 `AgentError` / `AgentErrorCode` | 错误分类契约（`code`,`message`,`retriable`,`detail`）；`AgentErrorCode` 含 `LLM_*`/`TOOL_*`/`CONTEXT_OVERFLOW`/`BUDGET_EXCEEDED`/`PLAN_MODE_VIOLATION`/`CANCELLED`/`INTERNAL` |
| 0.2 | `…/agent/core/engine/StreamEvent.java` | 基类加 `long seq`、`long ts`（optional 输出）；`ErrorEvent` 加 `code`、`retriable` |
| 0.3 | 新增 `…/agent/core/EventSequencer.java` | per-turn 单调递增 seq 生成器 |
| 0.4 | `…/agent/core/engine/DataStreamEncoder.java` | SSE 输出带 `id:<seq>`；error 帧补 `code`/`retriable`（向后兼容） |
| 0.5 | `…/agent/controller/ChatController.java` | 每个 emit 盖 seq；建立请求级 traceId 写入 MDC |
| 0.6 | 新增 `…/agent/observability/AgentMetrics.java` | Micrometer：`agent.turn.duration`/`agent.iterations`/`agent.llm.latency`/`agent.tokens`/`agent.errors`，最小侵入埋进 `HarnessLoop` |
| 0.7 | `fe: chat-client/types.ts` | `ErrorEvent`/`Annotation` 加 optional `code`/`retriable`/`seq` |
| 0.8 | `fe: chat-client/sse-parser.ts` | 透传 `id`(seq) 与 error 的 `code`/`retriable`，不改现有分支行为 |

### 验收
- 旧前端、旧行为完全不变；新字段对旧端不可见。
- Grafana/Actuator 能看到 agent 指标；日志带 traceId。
- 协议守门测试全绿。

### 回滚
纯增量字段 + 新类，无行为切换；直接回退提交即可。

---

## P1 · 真流式（最高用户价值）

**目标**：消除 `streamChat(...).collectList().map(assembleResponse)` 的假流式，做到 token 级实时下发；工具进度实时透传。

### 改动清单
| # | 文件/位置 | 改动 |
|---|---|---|
| 1.1 | 新增 `…/agent/harness/ResponseAccumulator.java` | 把 `HarnessLoop.assembleResponse()` 的分片合并逻辑（content/reasoning/toolCall index→id 合并）抽成**增量 `feed(StreamChunk)` + `assemble()`** |
| 1.2 | `…/agent/harness/HarnessLoop.java` → 重构为 `TurnExecutor` 流式 | `runIteration` 改为：`client.streamChat(req).doOnNext(acc::feed).mapNotNull(this::toDeltaEvent).concatWith(Flux.defer(() -> continueOrFinish(acc.assemble(), state)))` |
| 1.3 | 同上 | 用 `concatWith(Flux.defer(runTurn(next)))` **续传式尾递归**取代 `expand()` + `IterationResult(List<events>)` + `flatMapIterable` |
| 1.4 | 同上 `processToolCallsSequentially` → `ToolExecutor`(流式) | `AsyncTool` 内部事件**实时透传**（去掉 `collectList`），sync 工具发 `tool_calling` 状态→结果事件 |
| 1.5 | 守门 | 保留旧 `HarnessLoop` 路径，开关 `agent.harness.streaming.enabled` 切换；两路径共用 `ResponseAccumulator` |

> 注意：P1 暂时**保留 `LoopState` 现有可变 `workingMessages`**（在 P2 才不可变化），但 `ResponseAccumulator` 必须是**每轮局部**对象，杜绝跨轮共享。

### 前端
- 大概率无需改动：`fe: utils/use-stream-buffer.ts` 的 RAF 缓冲已支持增量 `text-delta`。仅需验证多轮场景渲染正确。

### 验收
- UI 中文字逐 token 出现，而非整段；工具执行过程实时可见。
- 多 iteration（工具→再生成）顺序、内容与旧路径一致（用 `MockLlmClient` 对拍）。
- 取消/背压下不丢事件、不卡死。

### 风险与回滚
核心 loop 重写 → 中风险。缓解：特性开关 + `MockLlmClient` 集成测试覆盖「纯文本 / 单工具 / 多工具 / 多轮 / 错误」五类场景。回滚=关开关。

---

## P2 · 状态收敛

**目标**：消除反应式链上的共享可变状态；动态技能提示词从字符串拼接改为可重算的分层段。

### 改动清单
| # | 文件/位置 | 改动 |
|---|---|---|
| 2.1 | `…/agent/harness/LoopState`（现为 `HarnessLoop` 内部类）→ 提为不可变类 | copy-on-write：`appendAssistant()`/`nextIteration()` 返回新快照 |
| 2.2 | 新增 `…/agent/harness/ConversationBuffer.java` | 消息唯一所有者：`appendUser/appendAssistant/appendToolResult/snapshot/revision`；预留 write-through 钩子（P3 接入） |
| 2.3 | `TurnExecutor` | 把散落的 `workingMessages.add(...)` 全部收敛到 `ConversationBuffer` |
| 2.4 | `…/agent/harness/SystemPromptBuilder.java` | 改为**分层段**组装：base / tool-catalog / static-skill / **dynamic-skill(可重算)** / context |
| 2.5 | `…/agent/tool/DynamicSkillRegistry.java` → `DynamicCapabilityState`（per-run） | 动态激活写状态对象；每轮重渲染 dynamic 段，删除 `updateSystemPromptWithDynamicFragment` 的 `contains()` 字符串拼接 |

### 验收
- `expand`/递归链上无共享可变对象（代码审查 + 并发压测无错乱）。
- 动态技能（`search_skills` 激活）提示词幂等：重复激活不重复注入。
- 行为与 P1 完全一致（回归对拍）。

### 风险与回滚
中风险，被 P1 测试套覆盖。开关 `agent.harness.immutable-state.enabled`。

---

## P3 · 持久化

**目标**：接上被引用却未用的实体，新增 event-sourcing 表，异步 write-through 落库，为审计与 P5 恢复铺路。

### 改动清单
| # | 文件/位置 | 改动 |
|---|---|---|
| 3.1 | 实体：`AgentMessageEntity`/`AgentToolCallEntity`（接上）+ 新增 `AgentEventEntity` | 三表 DDL；event 表 append-only，含 `conversationId`/`turn`/`agentId`/`seq`/`type`/`payload(json)`/`ts` |
| 3.2 | MyBatis Mapper（`knowledge-core-mybatis` 约定） | 三表的 insert/批量 insert/按 `conversationId(+seq>?)` 查询 |
| 3.3 | 新增 `…/agent/store/ConversationStore.java` | messages/toolcalls/events 读写封装 |
| 3.4 | 新增 `…/agent/harness/PersistenceInterceptor.java` | 包在内核 Flux 外：`doOnNext(persistAsync)` + `doOnComplete/Error(finalizeTurn)`，落库走 `Schedulers.boundedElastic()` + 有界队列 |
| 3.5 | `ConversationBuffer`（P2） | 接 write-through：逻辑消息同步入 store（用于重建 LLM 上下文） |
| 3.6 | `…/agent/session/SessionManager.java` | Redis 热态加 `lastSeq` 指针 |

### 验收
- messages/toolcalls/events 正确落库；按 `conversationId` 可重建完整历史与事件流。
- 落库**不阻塞**主流：开/关持久化的 P99 延迟无显著差异。
- 队列积压有上限与降级日志（绝不 OOM / 阻塞 Netty）。

### 风险与回滚
仅新增表 → 爆炸半径低。开关 `agent.harness.persistence.enabled`，关掉即退回纯内存。

---

## P4 · 容错

**目标**：LLM 重试/熔断/超时；单工具超时；取消信号贯穿（含子 agent）。

### 改动清单
| # | 文件/位置 | 改动 |
|---|---|---|
| 4.1 | 新增 `…/agent/llm/LlmGateway.java`（装饰 `LlmClient`） | `timeout(firstToken, idle)` + Resilience4j `CircuitBreakerOperator` + `retryWhen(backoff).filter(AgentError::isRetriable)`；重试发可见的 `retry` 状态事件 |
| 4.2 | `pom.xml`(agent-skills) | 加 `resilience4j-reactor`（JDK8 兼容） |
| 4.3 | `TurnExecutor` | LLM 调用改走 `LlmGateway`；流式重试仅在「尚未产出业务 token」时自动，否则降级 `ErrorEvent(retriable=true)` |
| 4.4 | `ToolExecutor`（P1 引入） | 每个工具 `Mono.timeout(descriptor.timeout)`；sync 工具 `subscribeOn(boundedElastic)` 避免阻塞 |
| 4.5 | 新增 `…/agent/runtime/CancellationToken.java` + `RunContext` 持有 | 协作式取消 |
| 4.6 | `…/agent/controller/ChatController.java` | `emitter.onTimeout/onError → run.cancel()`；`onCompletion → dispose` 订阅 |
| 4.7 | 错误映射 | LLM/tool 异常 → `AgentError` 分类；工具失败回喂 LLM 自愈，仅 `LLM_UNAVAILABLE/INTERNAL/CANCELLED` 终止 turn |

### 验收
- 注入 429/5xx/超时 → 自动重试且前端可见重试态；超过阈值 → 熔断 + `LLM_UNAVAILABLE`。
- 单工具 hang → 命中超时 → 作为可恢复工具错误回喂，不拖死整轮。
- 客户端断开/取消 → in-flight LLM 流 + 工具 + 子 agent 级联停止（无悬挂请求）。

### 风险与回滚
中风险。开关 `agent.harness.resilience.enabled`；重试/熔断参数走配置可调。

---

## P5 · 恢复 / 续传

**目标**：turn 内断线可续传；幂等防工具重复副作用；（可选）服务端上下文重建。

### 改动清单
| # | 文件/位置 | 改动 |
|---|---|---|
| 5.1 | 新增 `…/agent/runtime/TurnRegistry.java` | per-conversation 的 hot `Flux`（`Sinks.many().multicast()`/`replay`），turn 运行态独立于单个 HTTP 连接 |
| 5.2 | `…/agent/controller/ChatController.java` | turn 不随连接销毁；HTTP 连接=hot flux 的订阅者；`onCompletion` 仅退订不杀 turn |
| 5.3 | 同上 + 重连入口 | 读 `Last-Event-ID` 头 → 从 `AgentEventEntity` replay `seq>last` → 再接 live hot flux（turn 已结束则纯 replay） |
| 5.4 | 新增幂等：`idempotencyKey`（`conversationId+revision` 或前端传） | 命中已存在 turn → 直接 replay，不重复执行工具 |
| 5.5 | （可选）服务端上下文重建 | 前端可只发增量；服务端用 `ConversationStore` 补全。过渡期：前端仍可发全量，服务端去重 |
| 5.6 | `fe: chat-client/index.ts` + `harness/agent-harness.ts` | 重连时带 `Last-Event-ID`；断线重连逻辑 |

### 验收
- turn 中途杀连接 → 重连无缝续上，不丢事件、不重复。
- 刷新页面 → 待批准计划 / 子 agent 树可从持久化恢复。
- 重试提交相同 `idempotencyKey` → 不二次执行有副作用工具。

### 风险与回滚
**高风险**（连接生命周期 + hot flux）。强制开关 `agent.harness.resume.enabled` + 小流量灰度。回滚=关开关回退到「连接断=turn 结束」。

---

## P6 · 多 agent + 子 agent 可视化

**目标**：统一工具建模、工具并行执行、运行预算贯穿；子 agent 活动在前端实时分层展示。

### 后端
| # | 文件/位置 | 改动 |
|---|---|---|
| 6.1 | `agent-api` 新增 `ToolDescriptor` + `ExecKind` | `name/jsonSchema/kind/source/parallelSafe/mutates/timeout` |
| 6.2 | 新增 `…/agent/tool/ToolResolver.java` → `ResolvedCapabilities`(不可变) | turn 开始解析一份 descriptor 表 + prompt 片段 |
| 6.3 | `…/agent/tool/ToolRegistry.java` | 「前端/后端/远程」分类改读 `descriptor.kind`，删除每轮 `clear()`+重建 `Set<String>` 的脆弱逻辑；`RemoteToolAdapter` 归 `REMOTE` |
| 6.4 | `ToolExecutor`（P1/P4） | 按 `parallelSafe` 分组：`flatMap(.., MAX_TOOL_CONCURRENCY)` 并行 + `concatMap` 保序；结果按原 index 归位再 append |
| 6.5 | 新增 `…/agent/runtime/RunBudget.java` + `RunContext` | `maxDepth/deadlineEpochMs/maxTokens/remainingSubAgents`；`DelegateTool` 递减并向下传；超限 `BUDGET_EXCEEDED` |
| 6.6 | `…/agent/core/engine/SubAgentEvent.java` | 加 `parentAgentId`、`depth` |
| 6.7 | `…/agent/core/engine/DataStreamEncoder.java` `encodeSubAgentDataStream()` | 内部 Text/Reasoning/ToolCall/ToolResult/Error → 对应 `subagent_*` 的 `8:` 注解（带公共头 `{agentId,parentAgentId,depth,seq,ts}`），**不再用 `0:/9:/a:/g:` 主流帧** |
| 6.8 | `…/agent/tool/builtin/DelegateTool.java` | 补发 `subagent_spawned`(task/capabilities/parentId) 与 `subagent_finish`(summary/usage)；`delegate_start`/`subagent_status` 补 `parentAgentId` |

### 前端
| # | 文件/位置 | 改动 |
|---|---|---|
| 6.9 | `fe: harness/types.ts` | 加判别式 `subagent-spawned/-status/-text-delta/-reasoning-delta/-tool-call-start/-tool-call-end/-finish`（保留 `agentId/parentAgentId`） |
| 6.10 | `fe: chat-client/sse-parser.ts` | 识别 `subagent_*`/`delegate_*` 注解 → 结构化事件（保留身份），不再降级裸 `annotation` |
| 6.11 | `fe: system-agent/context.tsx` | `subAgents: Record<string, SubAgentNode>` 树状态，按 `agentId` 路由更新（容忍并行交错）；`ExecutionStep` 加 optional `agentId`；文本 RAF buffer 按 agentId 分桶 |
| 6.12 | UI 组件（`packages/plugin-ai` 聊天界面 / `packages/core` 通用组件） | 子 agent 折叠树/卡片：状态徽标→思考(可折叠)→工具步骤→流式输出→token 用量 |

### 验收
- 独立工具并行执行、结果顺序确定可复现；写类工具默认串行。
- 子 agent 树实时渲染：每个 agent 独立文本/工具/状态；嵌套 depth≤2 正确挂树；主回答正文不被子 agent 文本污染。
- 预算超限干净收敛，无孤儿子 agent。
- 配合 P3：刷新后子 agent 树可恢复。

### 风险与回滚
中风险。后端编码改动用协议守门测试兜底；前端开关 `subagentTree`，旧渲染回退到「子 agent 事件当普通注解」。

---

## P7 · Plan Mode

**目标**：只读研究 → 结构化计划 → 批准门 → 执行；规划期硬禁副作用。

### 后端
| # | 文件/位置 | 改动 |
|---|---|---|
| 7.1 | `agent-api`：`AgentMode{EXECUTE,PLAN}`；`ChatCompletionRequest` 加 optional `mode` | 请求级开关 |
| 7.2 | `RunContext` 持有 `mode`；`DelegateTool` 向子 agent 透传 | 子 agent 继承 PLAN |
| 7.3 | `ToolResolver`（P6） | PLAN 下只放 `mutates=false` 工具进 LLM catalog（第一层门控） |
| 7.4 | `SystemPromptBuilder`（P2） | 注入 plan-mode 段：只读 + 必须以 `present_plan` 收尾（第二层） |
| 7.5 | `ToolExecutor` | 硬拦截 `mode==PLAN && descriptor.mutates` → 拒绝 + 回喂 `PLAN_MODE_VIOLATION`（第三层，最后防线） |
| 7.6 | 新增工具 `…/agent/tool/builtin/PresentPlanTool.java`（+ 可选 `EnterPlanModeTool`） | `present_plan` 被 `TurnExecutor` 拦截，不当普通工具执行 |
| 7.7 | `TurnExecutor` | 识别 `present_plan` → 落库 `PlanArtifact` → emit `plan_proposed`(注解) → `FinishEvent(finishReason="plan-approval")` 暂停 |
| 7.8 | `…/agent/core/engine/StreamEvent.FinishEvent` 取值 | 新增 `plan-approval` 终态 |
| 7.9 | `agent-api` `PlanArtifact` + 实体 `AgentPlanEntity` + store(P3) | `planId/conversationId/turn/status/json/决策时间/决策人` |
| 7.10 | 决策恢复（resume）| `approved/edited` → `mode=EXECUTE` 注入(已批准/修改后)计划继续 loop；`rejected` → 保持 PLAN 注入 `feedback` 重规划 |

### 前端
| # | 文件/位置 | 改动 |
|---|---|---|
| 7.11 | `fe: chat-client/types.ts` | `plan_mode_entered`/`plan_proposed` 注解 + `PlanArtifact` 类型 + 决策 resume 载荷 |
| 7.12 | `fe: sse-parser.ts` + `system-agent/context.tsx` | 解析 plan 注解 → plan 状态；请求带 `mode` |
| 7.13 | UI 计划卡片 | 步骤(tools/risk)、openQuestions、estimatedMutations + [批准并执行]/[编辑]/[拒绝并反馈] |

### 验收
- PLAN 下任何写工具调用被三层拦截（注入写调用 → 被拒，绝不真执行）。
- 计划卡片正确展示；`approved` 后按计划执行、`rejected` 后重规划、`edited` 计划被尊重。
- 「计划→批准→实际 mutation」全链路审计可查（配合 P3 event 表）。
- 旧前端：看到一次 `plan-approval` 结束 + markdown 计划文本，不卡死。

### 风险与回滚
中风险，依赖 P6(`mutates`)+P3(持久化)+bidirectional 暂停（现有）。开关 `agent.harness.plan-mode.enabled`。

---

## 依赖关系图

```
P0 ─┬─▶ P1 ─┬─▶ P2 ─┬─────────────▶ P6 ─▶ P7
    │       │       │                ▲     ▲
    │       └─▶ P4  │                │     │
    └─▶ P3 ─────────┴────▶ P5        │     │
            └───────────(P3 为 P6 子agent刷新恢复 / P7 审计 的前置)
```
- **可并行**：P3 与 P1/P2 并行启动；P4 紧随 P1。
- **强串行**：P5 ← P3；P7 ← P6(`mutates`)+P3。

---

## 测试与上线策略（贯穿）

- **单测**：`ResponseAccumulator`、`ToolExecutor`(并行/超时/保序)、`ToolResolver`(PLAN 过滤)、`ContextManager` 压缩、`PlanArtifact` 拦截。
- **集成**：`MockLlmClient` 编排五类场景（纯文本/单工具/多工具/多轮/错误）+ 子 agent + plan mode，端到端断言事件序列。
- **协议守门**：SSE/Data Stream 帧 golden 测试，断言 `0:/8:/9:/a:/d:/e:/g:` 旧格式不变、新字段均 optional。
- **前端**：`sse-parser` 解析单测（子 agent / plan 注解）；`context.tsx` 树状态 reducer 单测。
- **灰度**：每个 Phase 特性开关 → 内部 → 小流量 → 全量 → 移除旧路径。

---

## 建议首批落地

**P0 + P1** 一起作为第一个里程碑：P0 零风险打底，P1 带来用户立刻可感的真流式体验，且为后续所有 Phase 的事件模型与测试基建（`MockLlmClient`、协议守门）就位。
