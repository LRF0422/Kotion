# Agent Harness 架构蓝图

> 目标：在保持 **Java 1.8 / Spring Boot 2.7 / WebFlux+Reactor / Redis** 技术栈、
> **现有 Maven 模块边界** 与 **前端 SSE / Data Stream 协议兼容** 的前提下，
> 把现有 `knowledge-agent-skills` 的服务端 harness 演进为一套
> **真流式、可容错、可持久化恢复、可水平扩展多 agent** 的内核。
>
> 本文是设计蓝图，不含立即落地的代码。所有接口签名为设计草图，命名沿用现有包结构。

---

## 0. 现状诊断（基于真实代码）

现有 harness 已经是一套 **完全服务端、响应式** 的 agentic loop，结构清晰，但读代码后定位到 4 类根因问题，正好对应 4 个痛点。

### 0.1 「流式」是假的 —— 最高优先级

`HarnessLoop.runIteration()`：

```java
return state.client.streamChat(request)
        .collectList()                 // ← 把整轮 LLM 流全部收集成 List
        .map(chunks -> assembleResponse(chunks))
        .flatMap(response -> { ... 一次性产出 TextEvent ... });
```

- LLM 的 token 流被 `collectList()` **全部缓冲**，再用 `assembleResponse()` 重组，最后一次性发一个大 `TextEvent`。
- 每个 iteration 产出的是 `IterationResult(List<StreamEvent>)`，外层再 `flatMapIterable` —— 事件是**按轮批量**下发的。
- 结果：尽管 Controller 用了 `SseEmitter` + `Flux`，**用户在每一轮都要等整段模型响应生成完才看到字**。SSE 的意义被抵消。

### 0.2 反应式链上的共享可变状态 —— 可靠性隐患

`LoopState` 是跨 `expand()` 迭代共享的**可变对象**：`workingMessages` 被原地 `add`、`frontendToolNames` 每轮 `clear()` 后重建、`updateSystemPromptWithDynamicFragment()` 直接改 `messages.get(0)` 的 content 字符串。

- `expand()` + 可变状态在背压/取消/重订阅下行为脆弱，难以推理。
- 动态技能提示词靠**字符串拼接进 system message** 并用 `contains()` 去重，既不幂等也不可回滚。

### 0.3 没有真正的容错与生命周期管理

- LLM 调用**无重试**（429/5xx/瞬时超时直接冒泡）、**无熔断**。
- **单工具无超时**：一个 backend 工具（尤其 `DelegateTool`、Web 工具）卡住会拖死整轮。
- **取消传播不完整**：`SseEmitter` 取消后，in-flight 的 LLM 流与工具执行没有协作式中止信号。
- 错误**无分类**：`ErrorEvent.error` 是裸字符串，前端无法区分「可重试 / 工具失败可恢复 / 致命」。

### 0.4 消息不落库 —— 不可恢复、不可审计

- 会话「状态」只在 Redis（`SessionManager`，24h TTL）存了**指针**，真正的 messages / tool calls **不持久化**，完全依赖前端每次重传全量历史。
- CLAUDE.md 提到的 `AgentMessageEntity` / `AgentToolCallEntity` 在 loop 里**没有被使用**。
- 断线/刷新 → 当前 turn 的进度全丢；无审计追溯；无法做服务端续传。

### 0.5 多 agent / 扩展性的结构性约束

- backend 工具**严格串行**（`processToolCallsSequentially`），独立工具无法并行。
- 「前端工具 vs 后端工具」用 `Set<String>` 名字匹配、且**每轮重建**，工具来源（local/frontend/remote）没有作为**描述符属性**统一建模 —— 分类逻辑脆弱。
- 子 agent（`DelegateTool` + `ChannelHub`）是内存态，无统一的 **运行预算（深度/时间/token）** 贯穿传播，崩溃时子 agent 会孤儿化。

> 结论：现有架构是**好底子**，不需要推倒重来。本蓝图给出一套**分层内核 + 接口契约 + 演进路线**，让上述 5 点逐项收敛，且每一步都保持前端协议不变。

---

## 1. 目标架构总览

### 1.1 分层

```
┌──────────────────────────────────────────────────────────────────────┐
│  Transport 层 (协议兼容，不动前端)                                       │
│  ChatController · SseEmitter · DataStreamEncoder · Last-Event-ID 续传    │
└───────────────────────────────┬──────────────────────────────────────┘
                                 │  Flux<StreamEvent>
┌───────────────────────────────▼──────────────────────────────────────┐
│  Orchestration 层                                                      │
│  AgentRunner(入口, 原 AgentHarness)                                     │
│   - 组装不可变 RunContext (RunBudget / 身份 / sessionId)                 │
│   - 调 CapabilityResolver 解析技能 → ResolvedCapabilities               │
│   - 串接 PersistenceInterceptor (write-through 落库)                     │
└───────────────────────────────┬──────────────────────────────────────┘
                                 │
┌───────────────────────────────▼──────────────────────────────────────┐
│  Harness Kernel (纯响应式流式 loop, 原 HarnessLoop)                       │
│  TurnExecutor: 真 token 流式 · 不可变 LoopState · 续传式递归             │
│   ├─ LlmGateway        (LLM 调用 + 重试/熔断/超时/取消)                   │
│   ├─ ToolExecutor      (统一 ToolDescriptor · 并行/串行 · 单工具超时)     │
│   ├─ ContextManager    (token 压缩, 分层 prompt)                         │
│   └─ EventStream       (StreamEvent 序列号 + 背压)                       │
└───────┬──────────────────────────────┬──────────────────────┬─────────┘
        │                              │                      │
┌───────▼────────┐          ┌──────────▼─────────┐   ┌────────▼─────────┐
│ Capability 层   │          │ State 层            │   │ Provider 层      │
│ ToolResolver    │          │ ConversationStore   │   │ LlmClient        │
│ SkillResolver   │          │  (MyBatis 落库)     │   │  Resilience 装饰  │
│ ToolDescriptor  │          │ SessionManager      │   │  LlmClientFactory │
│ RemoteToolAdapter│         │  (Redis 热态)       │   │ (deepseek/openai) │
└─────────────────┘          │ ContextManager      │   └──────────────────┘
                             └─────────────────────┘
        ┌──────────────── Cross-cutting ────────────────┐
        │ Observability(Micrometer/Trace) · RunBudget    │
        │ Cancellation · AgentError 分类 · Idempotency   │
        └────────────────────────────────────────────────┘
```

### 1.2 落到现有 Maven 模块（不改工程结构）

| 层 | 落点模块 | 说明 |
|---|---|---|
| Transport / Orchestration / Kernel / Capability / State | `knowledge-service/knowledge-agent-skills` | harness 主体，现有代码就在这 |
| 接口契约 / DTO / `ToolDescriptor` / `AgentError` / `ModelProvider` | `knowledge-service-api/knowledge-agent-api` | 跨模块共享的契约下沉到 api 模块 |
| 注解驱动技能框架（`@AgentSkill`/`@SkillTool`） | `knowledge-tool/knowledge-core-agent` | 复用现有注解扫描 |
| 持久化实体 `AgentMessageEntity`/`AgentToolCallEntity`/`AgentEventEntity` | `knowledge-agent-skills` + `knowledge-core-mybatis` | 用现有 MyBatis 扩展 |

> 所有新增接口放 `knowledge-agent-api`，实现放 `knowledge-agent-skills`，与现有「api 定义 / service 实现」分层一致。

---

## 2. 痛点一 · 真实时流式

### 2.1 核心原则

**一个 iteration 必须返回 `Flux<StreamEvent>` 而不是 `Mono<List<StreamEvent>>`**：
LLM 的每个 chunk 一边**实时映射成 delta 事件下发**，一边**旁路累积**成本轮的「装配结果」，用于决定 loop 是否继续。

### 2.2 设计：边流边累积 + 续传式递归

用「pass-through 流」 `concatWith` 「延迟计算的续轮」，替换 `collectList` + `expand`：

```java
// TurnExecutor.java —— 单轮 = 一个 Flux，递归 concat 出整段对话
Flux<StreamEvent> runTurn(LoopState state) {
    ResponseAccumulator acc = new ResponseAccumulator();   // 本轮局部、非共享

    Flux<StreamEvent> live = llmGateway
        .stream(buildRequest(state))                       // Flux<StreamChunk>，已带重试/超时
        .doOnNext(acc::feed)                               // 旁路累积 text/reasoning/toolCall
        .mapNotNull(chunk -> toDeltaEvent(chunk))          // 实时下发 token 级 delta
        .doOnNext(state.events()::stamp);                  // 盖序列号(见 §5.2)

    Flux<StreamEvent> tail = Flux.defer(() -> {            // LLM 流结束后再决定下一步
        LlmResponse resp = acc.assemble();
        return continueOrFinish(resp, state);              // 工具执行 + 递归 or 终止
    });

    return live.concatWith(tail);
}

Flux<StreamEvent> continueOrFinish(LlmResponse resp, LoopState state) {
    if (!resp.hasToolCalls()) {
        return Flux.just(finishEvent(resp));               // stop
    }
    Classified c = classify(resp.toolCalls(), state.capabilities());
    if (c.hasFrontend()) {                                 // 前端工具：发事件并暂停 loop
        return Flux.fromIterable(toToolCallEvents(c.frontend()))
                   .concatWith(Flux.just(finishEvent("tool-calls")));
    }
    LoopState next = state.appendAssistant(resp);          // 不可变推进(见 §3)
    return toolExecutor.execute(c.backend(), next)         // 实时产出工具进度/结果事件
                       .concatWith(Flux.defer(() ->
                           next.iteration() >= state.maxIterations()
                               ? Flux.just(finishEvent("max_iterations"))
                               : runTurn(next)));           // 递归下一轮
}
```

要点：
- **`concatWith(Flux.defer(...))` 实现尾递归**：每轮的 delta 立即流出，下一轮在前一轮真正完成后才订阅。Reactor 的 `defer` 不是栈递归（调度在 operator 上），`maxIterations=20` 这种深度完全安全。
- **`ResponseAccumulator` 是每轮局部对象**，不跨轮共享 → 消除 §0.2 的共享可变状态。
- **`assembleResponse` 逻辑保留**（tool-call 分片按 index/id 合并那段是对的），只是从「整流收集后算」变成「`doOnNext` 增量喂入」。
- delta 事件类型沿用现有 `StreamEvent.TextEvent / ReasoningEvent / ToolCallEvent / ToolResultEvent / FinishEvent / DataEvent` → **前端零改动**。

### 2.3 工具进度也要流式

`ToolExecutor.execute()` 返回 `Flux<StreamEvent>`：`AsyncTool.executeAsync()` 的中间事件**透传**（不再 `collectList` 后才发），sync 工具发 `tool_calling` 状态事件 → 结果事件。

---

## 3. 痛点二 · 状态管理：不可变推进 + 单一所有者

### 3.1 `LoopState` 改为不可变快照

```java
final class LoopState {
    final ConversationBuffer messages;     // append-only，唯一消息所有者
    final int iteration;
    final int maxIterations;
    final ResolvedCapabilities capabilities; // 本轮工具/技能解析结果(不可变)
    final RunContext run;                   // 身份/预算/sessionId/取消信号
    LoopState appendAssistant(LlmResponse r){ return withMessages(messages.appendAssistant(r)); }
    LoopState nextIteration(){ return withIteration(iteration+1); }
}
```

- 「推进」= 产生新快照，而非原地改字段。便于推理、便于在重试/恢复时重放。

### 3.2 `ConversationBuffer` —— 消息的唯一入口

把「散落在 loop 里的 `workingMessages.add(...)`」收敛到一个抽象，并挂上 **持久化 write-through** 钩子（见 §6）：

```java
interface ConversationBuffer {
    ConversationBuffer appendUser(ChatMessage m);
    ConversationBuffer appendAssistant(LlmResponse r);     // content + reasoning + toolCalls
    ConversationBuffer appendToolResult(String callId, String name, ToolResult r);
    List<ChatMessage> snapshot();                          // 给 LLM 的视图(已压缩)
    long revision();                                       // 单调递增，幂等/审计用
}
```

### 3.3 动态技能提示词：分层 prompt，不再改 system 字符串

替换 `updateSystemPromptWithDynamicFragment` 的字符串拼接：system prompt 由 `SystemPromptBuilder` 按**分层段**组装，动态激活的技能片段是一个**独立可替换的段**：

```
[base instructions] + [tool catalog] + [static skill fragments] + [DYNAMIC skill fragments(可重算)] + [context: time/user]
```

每轮按 `DynamicCapabilityState` 重新渲染该段 → 幂等、可回滚、无 `contains()` 脆弱去重。

---

## 4. 痛点二（续）· 可靠性与容错

### 4.1 LLM 网关：重试 + 熔断 + 超时（装饰器模式）

新增 `LlmGateway`，用装饰器包住现有 `LlmClient`，**不动 provider 实现**：

```java
Flux<StreamChunk> stream(LlmRequest req) {
    return delegate.streamChat(req)
        .timeout(firstTokenTimeout, idleTimeout)            // 首 token + 空闲双超时
        .transformDeferred(CircuitBreakerOperator.of(cb))   // Resilience4j(兼容 JDK8)
        .retryWhen(Retry.backoff(maxRetries, Duration.ofMillis(500))
            .filter(AgentError::isRetriable)                // 仅 429/5xx/超时重试
            .doBeforeRetry(s -> emit(retryStatusEvent(s)))); // 重试也对用户可见
}
```

- **首 token 超时** 与 **空闲超时** 分离：现有前端有 10min 空闲超时，这里在服务端对齐。
- Resilience4j `resilience4j-reactor` 在 Java 8 / Reactor 上可用，满足硬约束。
- 流式重试只在「**尚未产出任何业务 token**」时安全自动重试；已经流出部分内容后失败 → 降级为 `ErrorEvent(retriable=true)` 交前端决定。

### 4.2 单工具超时 + 取消

`ToolExecutor` 对每个工具加 `Mono.timeout(perToolTimeout)`；sync 工具在 `boundedElastic` 上跑避免阻塞 Netty。`RunContext` 携带 `CancellationToken`：

```java
ChatController: emitter.onTimeout(run::cancel);
               emitter.onError(e -> run.cancel());
               // 订阅的 Disposable 在 onCompletion 时 dispose
```

`run.cancel()` → 触发 `Flux` 的 `dispose` → `LlmGateway` 流中止 + 工具 `Mono` 取消。子 agent 通过同一个 token 协作式停。

### 4.3 错误分类：`AgentError`

下沉到 `knowledge-agent-api`，让前端能据 `code` 决策：

```java
enum AgentErrorCode {
    LLM_TIMEOUT, LLM_RATE_LIMIT, LLM_UNAVAILABLE,   // 多为可重试
    TOOL_TIMEOUT, TOOL_FAILED,                       // 工具级：回喂 LLM 自愈
    CONTEXT_OVERFLOW, BUDGET_EXCEEDED,               // 预算/上下文
    PLAN_MODE_VIOLATION,                             // plan mode 下试图调用写工具(见 §13.3)
    CANCELLED, INTERNAL                              // 终止类
}
class AgentError { AgentErrorCode code; String message; boolean retriable; String detail; }
```

- `ErrorEvent` 增加 `code` / `retriable` 字段（**向后兼容**：旧前端忽略新字段即可）。
- **工具失败不杀全局**：`TOOL_FAILED/TOOL_TIMEOUT` 作为 tool message 回喂 LLM（现有 sync 路径已这么做，扩展到 async + 超时），让模型自我纠错；只有 `LLM_UNAVAILABLE/INTERNAL/CANCELLED` 才终止本 turn。

---

## 5. 事件流契约（前端协议兼容前提下增强）

### 5.1 保持现有事件类型

`StreamEvent` 子类与 `DataStreamEncoder` 的 `0:/8:/9:/a:/d:/e:/g:` 帧编码**全部保留**。新增能力一律以「可选字段」承载，旧前端忽略即可。

### 5.2 事件序列号（为续传铺路）

每个下发的 `StreamEvent` 盖一个 **turn 内单调递增 `seq`**，并作为 SSE 的 `id:` 字段（`SseEmitter.SseEventBuilder.id(seq)`）。这是 §6.3 服务端续传的基础，对不使用 `Last-Event-ID` 的前端无影响。

---

## 6. 痛点三 · 持久化与可恢复

### 6.1 三层状态职责

| 存储 | 内容 | 生命周期 |
|---|---|---|
| **Redis**（`SessionManager`） | 热态会话指针、当前 turn 运行态、最后 `seq` | 24h TTL，快 |
| **MySQL/MyBatis**（`ConversationStore`） | messages、tool calls、event log（append-only） | 持久，审计/恢复源 |
| **内存**（`ConversationBuffer`/`LoopState`） | 单次 turn 工作集 | turn 结束即弃 |

### 6.2 Write-through 持久化拦截器

把已被引用但未使用的 `AgentMessageEntity` / `AgentToolCallEntity` 真正接上，新增 `AgentEventEntity`（event-sourcing 风格）：

```java
// PersistenceInterceptor: 包在 Kernel 产出的 Flux 外层
Flux<StreamEvent> persisted = kernel.run(state)
    .doOnNext(ev -> persistAsync(run.conversationId(), ev))  // 异步落库, 单独 Scheduler
    .doOnComplete(() -> store.finalizeTurn(run, Status.DONE))
    .doOnError(e -> store.finalizeTurn(run, Status.FAILED));
```

- 落库走 `Schedulers.boundedElastic()` + 有界队列，**绝不阻塞**主流。
- `ConversationBuffer.appendXxx` 同步写「逻辑消息」，事件流写「细粒度 event」—— 前者用于重建 LLM 上下文，后者用于 UI 重放。

### 6.3 两种「恢复」语义

1. **跨 turn 上下文恢复**（多轮对话）：不再强依赖前端重传全量历史。前端可只发增量，服务端用 `conversationId` 从 `ConversationStore` 重建上下文。（过渡期兼容：前端仍可发全量，服务端去重。）
2. **turn 内断线续传**（SSE 重连）：客户端重连带 `Last-Event-ID: <seq>`，服务端从 `AgentEventEntity` **replay `seq` 之后**的事件，再接上仍在跑的实时流。需要：
   - turn 运行态可在服务端**继续存活**（订阅不随单个 HTTP 连接销毁）—— 用一个 per-conversation 的 **hot `Flux`（`replay()` 或 sink）**，HTTP 连接只是它的订阅者。
   - 若进程已结束/turn 已完成 → 纯 replay 历史 event 即可。

### 6.4 幂等

每个 turn 带 `idempotencyKey`（前端生成或 `conversationId+revision`）；重复提交命中已存在 turn → 直接 replay，不重复执行工具。解决重试导致的「工具重复副作用」。

---

## 7. 痛点四 · 多 agent 与可扩展

### 7.1 统一工具描述符 `ToolDescriptor`（消除脆弱分类）

把「前端/后端/远程」从**运行时字符串匹配**变成**描述符属性**，下沉到 `knowledge-agent-api`：

```java
class ToolDescriptor {
    String name;
    String jsonSchema;
    ExecKind kind;            // LOCAL_SYNC | LOCAL_ASYNC | FRONTEND | REMOTE
    String source;            // builtin | plugin | skill | remote(nacos)
    boolean parallelSafe;     // 能否与其他工具并行
    boolean mutates;          // 是否有副作用(写/删/外发)。plan mode 据此门控(见 §13)
    Duration timeout;
}
enum ExecKind { LOCAL_SYNC, LOCAL_ASYNC, FRONTEND, REMOTE }
```

> `mutates` 是工具的一等属性：检索/读取/web_search 等为 `false`；write/delete/updateTitle/外发类为 `true`。它同时服务于 §7.2 的 `parallelSafe` 默认推断与 §13 的 plan mode 只读门控。

`ToolResolver` 在 turn 开始时产出一份**不可变 `ResolvedCapabilities`**（含 descriptor 表 + prompt 片段）。loop 内分类直接读 `descriptor.kind`，不再每轮 `clear()`+重建 `Set<String>`。`RemoteToolAdapter`（Nacos 远程工具）自然落在 `REMOTE` 一类，由 `RemoteToolInvoker` 执行。

### 7.2 工具并行执行

`ToolExecutor` 按 `parallelSafe` 分组：

```java
Flux<StreamEvent> execute(List<ToolCall> calls, LoopState st) {
    List<ToolCall> par  = calls.stream().filter(c -> desc(c).parallelSafe).collect(...);
    List<ToolCall> seq  = calls.stream().filter(c -> !desc(c).parallelSafe).collect(...);
    Flux<Indexed<ToolResult>> parResults = Flux.fromIterable(par)
        .flatMap(c -> runOne(c, st).timeout(desc(c).timeout), MAX_TOOL_CONCURRENCY); // 并行有界
    Flux<Indexed<ToolResult>> seqResults = Flux.fromIterable(seq)
        .concatMap(c -> runOne(c, st));                                              // 保序
    // 结果按原始 index 归位后再 append 到 ConversationBuffer，保证喂回 LLM 的顺序确定
}
```

- 并行**有界**（`MAX_TOOL_CONCURRENCY`），结果按原 index 归位，喂回 LLM 顺序稳定 → 既快又可复现。
- 默认策略：read-only / 检索类（web_search、dataset_search、readChunk）`parallelSafe=true`；写类/有副作用默认 `false`。

### 7.3 子 agent：共享内核 + 统一运行预算

`DelegateTool` 复用同一 `TurnExecutor`（子 agent = 递归一个新 `LoopState`），并强制 `RunBudget` 贯穿：

```java
class RunBudget {
    int maxDepth;            // 委派深度(现有 maxDepth=2)
    long deadlineEpochMs;    // 整棵委派子树的总时间预算(新增, 解决 §0.5 超时)
    long maxTokens;          // 全树 token 预算
    int remainingSubAgents;  // 全树并发/总量上限
}
```

- `RunContext` 携带 `RunBudget`，每次 delegate 递减并向下传；超限 → `BUDGET_EXCEEDED`，干净收敛而非孤儿化。
- 子 agent 事件继续用 `SubAgentEvent` 包裹，但补全 **`parentAgentId` + 全生命周期事件**，做到前端可视化（详见 **§12**）。
- `ChannelHub` 维持现状即可（内存态足够），但订阅生命周期挂到父 `RunContext`，父取消 → 子级联取消。

### 7.4 技能渐进发现：保留并形式化

`SkillSelector`（LLM 预筛）+ `ProgressiveDiscovery`（解析 requiredTools/optionalTools）+ `SearchSkillsTool`（运行时动态激活）三段式是**对的**，保留。仅做两点收敛：
- 输出统一为不可变 `ResolvedCapabilities`，dynamic 激活写入 per-run `DynamicCapabilityState`（见 §3.3），不再改 system 字符串。
- 校验：技能引用的工具在 `ToolResolver` 解析期做存在性校验，缺失工具在 catalog 构建期就报 `WARN` 并降级，而非运行时静默失败。

---

## 8. 可观测性（贯穿）

- **Micrometer 指标**：`agent.turn.duration`、`agent.iterations`、`agent.llm.latency{provider,model}`、`agent.tool.duration{tool,kind}`、`agent.tokens{prompt,completion}`、`agent.errors{code}`、`agent.delegate.depth`。
- **Trace**：每个 turn 一个 traceId，贯穿 LLM 调用 / 工具 / 子 agent；`RunContext` 携带并写入 MDC，日志可关联。
- **结构化事件日志**：`AgentEventEntity` 即天然审计流，可回放任意会话的完整决策轨迹。

---

## 9. 关键时序（端到端）

```
前端 ──POST /chat/completions(stream)──▶ ChatController
  ChatController: 建 SseEmitter, 解析身份/session, 建 RunContext(+Budget,+CancelToken)
        │
        ▼
  AgentRunner: CapabilityResolver → ResolvedCapabilities(不可变)
               PersistenceInterceptor 包裹 Kernel
        │
        ▼  Flux<StreamEvent>(带 seq)
  TurnExecutor.runTurn(LoopState#0):
     LlmGateway.stream ──(重试/熔断/超时)──▶ DeepSeek/OpenAI
        │  chunk 实时 → TextEvent/ReasoningEvent(token 级) ──┐
        │  旁路累积 ResponseAccumulator                      │  实时下发 + 异步落库
        ▼                                                    ▼
     无工具 → FinishEvent(stop)                         SseEmitter.send(id=seq)
     有后端工具 → ToolExecutor(并行/串行,单工具超时) → ToolResult 回喂 → runTurn(#1)
     有前端工具 → ToolCallEvent + FinishEvent(tool-calls) → 暂停, 等前端回传结果
        │
        ▼
  doOnComplete → store.finalizeTurn(DONE); emitter.complete()
  (断线) 前端带 Last-Event-ID 重连 → replay AgentEventEntity[seq+1..] → 接上 hot Flux
```

---

## 10. 演进路线图（每步保持前端协议兼容）

> 原则：**先低风险埋点与契约，再动数据流，最后做恢复与多 agent**。每个 Phase 可独立上线。

| Phase | 目标 | 主要改动 | 风险 | 价值 |
|---|---|---|---|---|
| **P0 契约与埋点** | 不改行为，先立地基 | `AgentError`+`code`/`retriable`(可选字段)；`StreamEvent` 盖 `seq`/SSE `id`；Micrometer 指标；MDC traceId | 极低 | 可观测、为后续铺路 |
| **P1 真流式** | 解决最痛的体验问题 | `TurnExecutor` 用 `concatWith(defer)` 取代 `collectList`+`expand`；`ResponseAccumulator` 旁路累积；工具进度透传 | 中（核心 loop） | **用户立刻可感**：token 级流式 |
| **P2 状态收敛** | 消除共享可变态 | 不可变 `LoopState`；`ConversationBuffer` 单一所有者；分层 prompt 替换字符串拼接 | 中 | 可靠性、可维护性 |
| **P3 持久化** | 落库 + write-through | 接上 `AgentMessageEntity/AgentToolCallEntity` + 新增 `AgentEventEntity`；`PersistenceInterceptor` 异步落库 | 中 | 审计、为恢复铺路 |
| **P4 容错** | 重试/熔断/超时/取消 | `LlmGateway` 装饰器(Resilience4j)；单工具 `timeout`；`CancellationToken` 贯穿 | 中 | 稳定性、成本可控 |
| **P5 恢复/续传** | 断线可续、幂等 | hot `Flux`/sink + `Last-Event-ID` replay；`idempotencyKey`；服务端上下文重建 | 高 | 体验+健壮性 |
| **P6 多 agent/扩展** | 并行与预算 | `ToolDescriptor` 统一分类；`ToolExecutor` 并行有界；`RunBudget` 贯穿子 agent | 中 | 吞吐、可扩展 |

依赖：P1 是其余多数项的前提；P3 是 P5 的前提；P0 建议最先做且独立。

---

## 11. 设计决策摘要（取舍说明）

1. **`concatWith(defer)` 递归 vs `expand`**：`expand` 适合「每节点产出可立即拿到的集合」，但与「节点本身是长流」冲突，逼出了 `collectList`。改用续传式递归后，单轮天然是流，尾递归用 `defer` 调度安全。
2. **不可变 `LoopState` vs 共享可变**：响应式链上共享可变状态是 bug 温床（背压/取消/重放）。不可变快照换来可推理性与「重放即恢复」。
3. **`ToolDescriptor.kind` vs 运行时 `Set<String>` 分类**：把工具来源建模为数据而非每轮重算的过程，分类稳定、远程工具自然纳入、并行策略可声明。
4. **event-sourcing 落库 vs 仅存 messages**：细粒度 event 既驱动 UI 重放与断线续传，又是审计源；逻辑 messages 仍单独存用于重建 LLM 上下文。两者职责分离。
5. **保留三段式技能发现**：现有 `SkillSelector`/`ProgressiveDiscovery`/`SearchSkillsTool` 设计良好，只做不可变化与校验收敛，不重造。
6. **Resilience4j 而非自研重试**：JDK8/Reactor 兼容、熔断+重试+限流成熟，契合硬约束。

---

## 12. 子 Agent 前端可视化

> 需求：`delegate` 派生的子 agent，其**思考 / 工具调用 / 输出 / 状态**要能在前端实时、分层展示成一棵「主 agent → 子 agent」的进度树，而不是混进主回答里。

### 12.1 现状缺口（基于真实代码）

**好消息：传输层已经具备子 agent 身份。** `DelegateTool` 把每个子 agent 的事件用 `SubAgentEvent.of(subtaskId, inner)` 包裹，`DataStreamEncoder` 已经把 `agentId` 注入到 wire 帧里，并已发 `delegate_start` / `subagent_status`。前端 `chat-client/types.ts` 甚至**已定义** `SubagentOutputAnnotation` / `SubagentToolCallAnnotation` / `SubagentToolResultAnnotation` 等类型。

**但有 3 个断点导致前端无法展示：**

1. **前端归一化层丢弃 `agentId`**：`sse-parser.ts` 把带 `agentId` 的 delta 当成普通 `text-delta`；`HarnessEvent` 联合类型**没有子 agent 变体**；`context.tsx` 只把 annotations 原样堆进数组，`executionSteps` 无父子关系。→ `agentId` 在归一化时丢失。
2. **子 agent 文本污染主正文**：子 agent 的 `TextEvent` 复用 `0:` 帧，前端若按 `0:` 拼接正文，子 agent 的话会混进主回答。
3. **契约半成品**：后端只发了 `subagent_status` 的 `spawned/running/error`，**没发** `subagent_output` / `subagent_tool_call` / `subagent_tool_result` / `subagent_finish`（前端类型已定义却收不到）。

### 12.2 设计原则

- **唯一通道**：子 agent 的所有内部事件，统一走 **`8:` 数据/注解通道**的 typed annotation，**不再复用 `0:/9:/a:/g:` 主流帧**。这样主回答文本流永远干净，且 `8:` 是非关闭帧（不会误发 `e:` 关掉父流）。
- **补全而非新建**：直接对齐前端**已定义但未使用**的 `Annotation` 联合类型，把它当作既定契约补全后端发射 + 前端消费。
- **身份在发射处打标，不在编码处**：`agentId` / `parentAgentId` / `depth` 来自子 agent 的 `RunContext`（见 §7.3），任何事件天然带身份；`SubAgentEvent` 仅承载这三者 + `seq`。
- **按身份路由，不靠顺序**：子 agent 并行执行、事件交错到达，前端必须按 `agentId` 更新对应节点，**不能假设有序**。

### 12.3 统一事件契约（全生命周期）

所有子 agent 事件 = `8:` 帧内一个 typed annotation，公共头：`{ agentId, parentAgentId, depth, seq, ts }`。

| annotation `type` | 触发时机 | 关键载荷 | 前端动作 |
|---|---|---|---|
| `delegate_start` | DelegateTool 开始 | `subTaskCount`, `subTasks:[{agentId,description}]` | 在该 delegate 工具步下建 N 个子 agent 占位节点 |
| `subagent_spawned` | 单个子 agent 创建 | `task`, `requiredCapabilities` | 节点置 `spawned` |
| `subagent_status` | 状态流转 | `status: running\|completed\|error`, `detail` | 更新节点状态徽标 |
| `subagent_reasoning` | 子 agent 思考流 | `reasoningContent`(delta) | 追加到节点 reasoning（可折叠） |
| `subagent_output` | 子 agent 文本流 | `content`(delta) | 追加到节点 streamingContent |
| `subagent_tool_call` | 子 agent 调工具 | `toolCallId`, `toolName`, `args` | 节点 steps 新增一条 running |
| `subagent_tool_result` | 工具返回 | `toolCallId`, `result`/`error`, `durationMs` | 对应 step 置 success/error |
| `subagent_finish` | 子 agent 结束 | `finishReason`, `summary`, `usage` | 节点置 completed，落 token 用量 |

> 嵌套（depth≤2）天然支持：子 agent 自己再 delegate 时，其事件的 `parentAgentId` 指向它自己，前端据此挂到正确的子树。

### 12.4 后端改动（落点 `agent-skills` + `agent-api`）

1. **`SubAgentEvent`** 增加 `parentAgentId` / `depth` 字段；由 `DelegateTool` 从子 agent 的 `RunContext` 注入。
2. **`DataStreamEncoder.encodeSubAgentDataStream()`** 改路由：把内部 `Text/Reasoning/ToolCall/ToolResult/Error` 一律编码为对应 `subagent_*` 的 `8:` annotation（带公共头），**不再输出 `0:/g:/9:/a:` 主流帧**。`subagent_finish` 沿用现有「FinishEvent→annotation」做法（已避免发 `e:`）。
3. **`DelegateTool`** 补发 `subagent_spawned`（含 task / capabilities / parentAgentId）与 `subagent_finish`（含 summary / usage）；现有 `delegate_start` / `subagent_status` 保留并补上 `parentAgentId`。
4. 与 §6 持久化打通：这些 annotation 同样写入 `AgentEventEntity`（带 `agentId`），断线 replay 时子 agent 树可完整重建。

### 12.5 前端改动（落点 `packages/common/src/ai`）

1. **`harness/types.ts`** 给 `HarnessEvent` 增加判别式子 agent 变体（保留身份）：
   ```ts
   | { type: 'subagent-spawned'; agentId: string; parentAgentId: string|null; task: string }
   | { type: 'subagent-status'; agentId: string; status: 'running'|'completed'|'error'; detail?: string }
   | { type: 'subagent-text-delta'; agentId: string; content: string }
   | { type: 'subagent-reasoning-delta'; agentId: string; content: string }
   | { type: 'subagent-tool-call-start'; agentId: string; id: string; toolName: string; args: Record<string,unknown> }
   | { type: 'subagent-tool-call-end'; agentId: string; id: string; result?: unknown; error?: string; durationMs: number }
   | { type: 'subagent-finish'; agentId: string; finishReason?: string; usage?: {promptTokens:number;completionTokens:number} }
   ```
2. **`sse-parser.ts`**：识别 `8:` 帧里 `type` 以 `subagent_`/`delegate_` 开头的 annotation，解析成上述结构化事件（**保留 `agentId`/`parentAgentId`**），不再降级成裸 `annotation`。
3. **`system-agent/context.tsx`**：新增子 agent 树状态，按 `agentId` 路由更新（容忍交错）：
   ```ts
   interface SubAgentNode {
     agentId: string; parentAgentId: string | null;
     task: string;
     status: 'spawned'|'running'|'completed'|'error';
     reasoningContent: string; streamingContent: string;
     steps: ExecutionStep[];                 // 复用现有 ExecutionStep
     usage?: { promptTokens: number; completionTokens: number };
     startedAt: number; endedAt?: number; error?: string;
     children: string[];                     // 子树(depth>1)
   }
   // SystemAgentState 增加：subAgents: Record<string, SubAgentNode>
   // ExecutionStep 增加可选 agentId，使 delegate 工具步能挂出子节点
   ```
   文本仍用 §2 的 RAF buffer，但**按 agentId 分桶**，主正文与各子 agent 各自一份缓冲，互不污染。

### 12.6 UI 渲染（折叠树 / 时间线）

主 agent 的 `delegate` 工具步下，挂一棵可折叠的子 agent 卡片树；每个子 agent 卡片实时显示：状态徽标 → 思考(可折叠) → 工具步骤 → 输出 → token 用量。

```
▼ 🛠 delegate · 3 subtasks                                   [running]
  ├─ ▼ 🤖 sub-1  “检索竞品定价”                  ● running   1.2s
  │     ▸ 💭 thinking… (可折叠)
  │     ├─ 🔧 web_search("竞品 定价")            ✓ 0.8s
  │     └─ 🔧 web_fetch(url)                      ⏳ running
  │     └─ 输出: “已找到 3 家竞品的定价页…”(流式)
  ├─ ▶ 🤖 sub-2  “汇总财报要点”                  ✓ done      2.1s   ↳ 1.3k tok
  └─ ▶ 🤖 sub-3  “生成对比表”                    ✗ error     timeout
  ──────────────────────────────────────────────
  delegate 汇总结果: “综合 3 个子任务…”(主流 ToolResult)
```

交互：卡片可逐个折叠/展开；并行子 agent 各自独立流式；`completed/error` 后保留可回看（数据来自 §6 持久化，刷新不丢）。

### 12.7 兼容性与取舍

- **前端协议兼容**：`8:` 注解通道、`StreamEvent` 主流帧格式均不变；新增全部是 `8:` 内的 typed annotation 与前端**已定义**类型对齐 → 旧前端忽略即可，新前端结构化消费。
- **为何走 `8:` 而非继续复用 `0:/9:/a:`**：复用主流帧会让子 agent 文本污染主回答、且需要前端对每条 delta 做 `agentId` 判别才能避免拼错；集中到 `8:` 注解既保持主流纯净，又复用已存在的 `Annotation` 判别联合，改动面更小、语义更清晰。
- **顺序无关**：树按 `agentId` 路由，天然容忍并行交错；`seq` 仅用于断线 replay 排序（§5.2/§6.3），不用于 UI 拼装顺序。

---

## 13. Plan Mode（规划模式）

> 需求：agent 先**只读地研究**问题、产出一份**结构化计划**，经用户**批准**后才进入执行。规划期间禁止任何写/删/外发等副作用操作。

### 13.1 语义与状态机

`AgentMode` 作为 `RunContext` 的一等字段，贯穿主 agent 与所有子 agent：

```java
enum AgentMode { EXECUTE, PLAN }   // 默认 EXECUTE
```

```
            ┌────────────── PLAN ──────────────┐
 用户开启     │ 只读工具集 + 必须以 present_plan 收尾 │
 plan mode ─▶ │                                  │
            │  present_plan 工具被拦截            │
            └───────────────┬──────────────────┘
                            │ emit plan_proposed
                            │ finishReason = "plan-approval" (暂停, 人在环)
                            ▼
                    前端展示计划卡片
            ┌───────────┬───────────┬───────────┐
         approved    edited      rejected
            │           │           │
   mode=EXECUTE   mode=EXECUTE  保持 PLAN
   注入已批准计划  注入修改后计划  注入反馈, 重新规划
            ▼           ▼           ▼
        正常执行 loop(§2)        回到 PLAN 顶部
```

### 13.2 如何进入 plan mode

- **主路径 · 请求级开关**：前端在请求里带 `mode: "plan"`（`ChatCompletionRequest` 新增可选字段）。用户在 UI 切「规划模式」即走此路。
- **可选 · agent 自发**：提供 `enter_plan_mode` 工具，模型在「任务复杂、需先对齐方案」时自行调用 → 把当前 turn 切到 PLAN。便于实现「简单直接做、复杂先规划」的自适应策略。

### 13.3 只读门控（三层纵深防御）

plan mode 的安全性**不能只靠提示词**，三层叠加：

1. **目录过滤**：`ToolResolver` 在 PLAN 模式下只把 `mutates=false` 的工具放进发给 LLM 的 catalog —— 模型根本看不到写工具。
2. **系统提示**：`SystemPromptBuilder` 注入 plan-mode 段：「你处于规划模式，只能调研、不可修改任何内容，完成调研后必须调用 `present_plan` 提交计划等待批准」。
3. **硬拦截（最后防线）**：`ToolExecutor` 执行前校验 `mode==PLAN && descriptor.mutates` → 直接拒绝并回喂 `AgentError(code=PLAN_MODE_VIOLATION, retriable=false)` 给 LLM（让它改走只读路径），**绝不真正执行**。即使前两层被绕过也安全。

> 子 agent 继承父 `RunContext.mode`：plan mode 下 `delegate` 仍可用于**并行只读调研**，但子 agent 同样被三层门控约束。

### 13.4 计划产出与批准门（复用 bidirectional 暂停）

计划通过一个**被拦截的工具** `present_plan` 产出 —— 与 §7 的「前端工具暂停 loop」同构，无需新机制：

```jsonc
// present_plan 的 arguments（即计划工件 PlanArtifact）
{
  "title": "重构文档目录结构",
  "summary": "分三步：抽取小标题 → 重排层级 → 校验引用",
  "steps": [
    { "id": 1, "action": "扫描全文标题层级",      "tools": ["getDocumentStructure"], "risk": "low" },
    { "id": 2, "action": "重排为两级目录",         "tools": ["insertNear","convertBlock"], "risk": "medium" },
    { "id": 3, "action": "校验并修复跨节引用",     "tools": ["searchInDocument","replaceContent"], "risk": "medium" }
  ],
  "openQuestions": ["是否保留旧的一级编号？"],
  "estimatedMutations": 12
}
```

`TurnExecutor` 识别到 `present_plan` 调用：
- **不**把它当普通工具执行；
- 落库 `PlanArtifact`（§13.6）并 emit `plan_proposed` 事件（走 `8:` 注解通道）；
- emit `FinishEvent(finishReason="plan-approval")` 暂停 loop，等待前端回传决策。

`finishReason` 枚举新增 `plan-approval`（与 `tool-calls` 并列的「人在环暂停」类终态）。

### 13.5 批准回合协议（前端协议兼容）

| 事件/字段 | 方向 | 载荷 | 说明 |
|---|---|---|---|
| `plan_mode_entered` | ⬇ 注解 | `{ trigger: "request"\|"agent" }` | 进入 PLAN，UI 切规划态 |
| `plan_proposed` | ⬇ 注解 | `PlanArtifact` + `planId` | 展示计划卡片 |
| `FinishEvent` | ⬇ 主流 `e:` | `finishReason:"plan-approval"` | 暂停，亮出批准按钮 |
| 决策 resume | ⬆ 请求 | `{ planId, decision: "approved"\|"edited"\|"rejected", editedPlan?, feedback? }` | 作为新 turn 提交 |

恢复语义：
- **approved**：服务端把 `mode` 切 `EXECUTE`，将**已批准计划**作为高优先级上下文注入 system/`developer` 段，继续执行 loop（§2）。
- **edited**：同上，但注入**用户修改后的计划**（用户可在卡片里增删步骤）。
- **rejected**：保持 `mode=PLAN`，把 `feedback` 注入，回到 PLAN 顶部重新规划。

> 旧前端兼容：不认识 `plan_proposed` 注解的前端，会看到一次 `finishReason="plan-approval"` 的正常结束 + 计划文本（计划同时以 `TextEvent` 形式给出 markdown 版），不会卡死；新前端走结构化卡片。

### 13.6 持久化与可恢复（接 §6）

- `PlanArtifact` 落 `AgentPlanEntity`（`planId`、`conversationId`、`turn`、`status: proposed/approved/edited/rejected`、JSON 工件、决策时间/决策人）。
- 与 §6.3 续传打通：断线后凭 `conversationId` 可恢复「待批准的计划」，刷新页面计划卡片不丢。
- 审计价值：**「计划 → 批准 → 实际执行」全链路可追溯**，谁批了什么、改了什么、最终执行了哪些 mutation，一目了然（配合 §8 的 `AgentEventEntity`）。

### 13.7 前端展示（接 §12 风格）

```
╭─ 📋 规划模式 · 等待你的批准 ───────────────────────────╮
│ 重构文档目录结构                                       │
│ 分三步：抽取小标题 → 重排层级 → 校验引用               │
│                                                       │
│  1. 扫描全文标题层级               🔧 read    risk:low │
│  2. 重排为两级目录                 🔧 write   risk:med │
│  3. 校验并修复跨节引用             🔧 write   risk:med │
│                                                       │
│  ❓ 是否保留旧的一级编号？                              │
│  预计修改 12 处                                        │
├───────────────────────────────────────────────────────┤
│   [ ✅ 批准并执行 ]   [ ✏️ 编辑 ]   [ ❌ 拒绝并反馈 ]    │
╰───────────────────────────────────────────────────────╯
```

- 规划期间，子 agent 的只读调研过程仍用 §12 的子 agent 树实时展示（用户能看到「它在查什么」才敢批准）。
- 步骤里的 `risk` / `tools` / `estimatedMutations` 让用户**带信息地决策**，而非盲签。
- 批准后切换到执行视图，按计划步骤把实际工具调用对齐到对应 step（可显示「步骤 2/3 执行中」）。

### 13.8 与路线图的关系（接 §10）

Plan mode 依赖：`ToolDescriptor.mutates`（P6）、bidirectional 暂停（现有）、持久化（P3）。建议作为 **P6 之后的独立增量 P7**，因为只读门控的安全性依赖 §7.1 的工具统一建模先就位。最小可用版（请求级开关 + 三层门控 + `present_plan` + 批准回合）即可上线，`edited`/审计可作为后续增强。

---

## 附录 A · 新增/调整的核心接口清单（草图）

| 接口/类 | 模块 | 角色 |
|---|---|---|
| `AgentRunner` (原 `AgentHarness`) | agent-skills | 入口编排、组装 `RunContext` |
| `TurnExecutor` (原 `HarnessLoop`) | agent-skills | 纯流式 loop 内核 |
| `ResponseAccumulator` | agent-skills | 单轮旁路累积 LLM 流 |
| `LoopState`(不可变) / `RunContext` / `RunBudget` | agent-skills | 运行态快照与预算 |
| `ConversationBuffer` | agent-skills | 消息唯一所有者 + 落库钩子 |
| `LlmGateway` | agent-skills | LLM 调用 + 重试/熔断/超时/取消装饰 |
| `ToolExecutor` / `ToolDescriptor` / `ToolResolver` | api + agent-skills | 统一工具建模、并行/串行执行 |
| `ResolvedCapabilities` / `DynamicCapabilityState` | agent-skills | 不可变能力解析结果 |
| `ConversationStore` | agent-skills + core-mybatis | messages/toolcalls/events 落库 |
| `PersistenceInterceptor` | agent-skills | write-through 异步持久化 |
| `AgentError` / `AgentErrorCode` | agent-api | 错误分类契约 |
| `AgentMode`(EXECUTE/PLAN) | agent-api | 运行模式，挂在 `RunContext` |
| `present_plan` / `enter_plan_mode` 工具 | agent-skills | plan mode 计划产出与进入(§13) |
| `PlanArtifact` / `AgentPlanEntity` | agent-api + agent-skills | 结构化计划工件 + 落库/审计 |
| `AgentEventEntity` (+复用 `AgentMessageEntity`/`AgentToolCallEntity`) | agent-skills | event-sourcing 持久化 |
| `CancellationToken` | agent-api | 协作式取消 |

> 兼容性保证：`ChatController` 的请求/响应 DTO、`StreamEvent` 子类、`DataStreamEncoder` 帧格式均保持；所有增强通过**新增可选字段**承载。
