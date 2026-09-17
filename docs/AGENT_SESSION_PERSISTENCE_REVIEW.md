# Agent 会话记录保存代码审查

审查范围：AI 侧边栏会话的多端持久化链路，即"引擎规范会话日志 + UI 投影 + 客户端索引/迁移"。

- 前端：`packages/plugin-ai/src/ai/menu/chat-sessions.ts`、`useChatSessions.ts`、`chat-session-api.ts`、`Chat.tsx`
- SDK：`packages/common/src/ai/agent/{types,client}.ts`
- 后端：`SessionTranscriptProjector.java`、`ChatSessionStore.java`、`ChatSessionController.java`、`AgentChatSessionMapper.java`、V26–V28 迁移
- 设计文档：`docs/AGENT_CHAT_SESSION_PERSISTENCE.md`

总体设计（事实来源 = run 日志；`model_messages_json` 为唯一上下文来源；`messages_json` 为纯投影；客户端只读 transcript）是自洽的。但在写入完整性、并发、迁移一致性和几个具体 SQL 边界上有缺口，按严重度列出。

---

## 修复状态（本轮已实施）

| 项 | 状态 | 落地 |
|----|------|------|
| H1 | ✅ 已修 | `ChatSessionStore.upsertMeta` 在 INSERT 前兜底 `messageCount=0` |
| H2 | ✅ 已修 | `markFailed` 与“无本地 handle 的 `cancel`”补调 `onRunTerminal`；新增 provenance 幂等守卫，重复终态不再重复插入 |
| H4 | ✅ 已修 | `/import` 改为“UI 投影条数 vs UI 投影条数”比较；`message_count` 统一缓存 UI 投影长度；客户端按返回的 `imported` 决定清本地副本 |
| M1 | ✅ 已修 | 修正本地缓存“会写盘/离线可用”的过期注释与死代码标注 |
| M2 | ✅ 已修 | `importChatSession` 返回布尔值，导入成功后删除本地迁移副本 |
| M4 | ✅ 已修 | 投影消息 id 改为确定性 `u-<index>` / `a-<index>` |
| M5 | ✅ 已修 | `/import` 增加条数（2000）与序列化字节（16MB）上限 |
| M6 | ◑ 部分 | 删除/清空不再被 `isSessionApiAvailable` 预拦截（完整重试队列未做） |
| M8 | ✅ 已修 | 投影锁改为固定 64 条 striped，消除无界增长 |
| L5 | ✅ 已修 | `ChatSessionController.get` 增加兜底 catch |
| H3 | ✅ 已修 | V29 给 `agent_chat_session` 加 `version`；投影改为 CAS（`updateTranscriptIfVersion` / `insertTranscriptIfAbsent`）+ 有界重试（读到冲突就重读重算）；显式清空也会推进版本 |
| M3 | ✅ 已修 | `SessionTranscriptProjector.toUi` 改为按用户轮折叠：一个 run 的多个 assistant turn 合并回单个 `ai` 节点，并把每个 turn 合成为 `activitySteps`（含 `startedSeq`）与工具的 `sequence`，同时回填 `answerStepId` 与合并后的 `reasoningContent`。恢复后整条时间线不再按模型 turn 断成多个 `N steps` 段，与 live 一致（模型日志本身不含事件 seq/工具成败/时长，仍为纯投影的固有精度损失） |
| M7 | ✅ 已修 | `prepareHistory` 在下一条 run 累积新用户轮前，对规范日志做一次 `repairToolPairing`，把被放弃/挂起 run 留下的 assistant tool_calls 补成合法配对；配合 H2 的 cancel 投影，跨 run 上下文不再出现连续的裸 user 轮 |
| L1–L4 | ⏸ 暂缓 | 低风险，未改 |

测试：`SessionTranscriptProjectorTest` 10/10、`ChatSessionStoreTest` 11/11（新增 messageCount 兜底、终态幂等、CAS 冲突重试/首次插入/冲突失败、M7 悬空工具配对补齐）。全量 133 用例仅剩 2 个既有的 `ContextManagerPrefixStabilityTest` 失败（已在干净树复现，与本次无关）。

---

## 高：会导致保存失败或丢数据

### H1. 新建空会话的 PUT 会因 `message_count` 为 NULL 而失败
- `ChatSessionStore.upsertMeta`（`ChatSessionStore.java:51-65`）不像 `saveTranscript` 那样兜底 `messageCount`；
- `AgentChatSessionMapper.upsertMeta`（`AgentChatSessionMapper.java:43-53`）的 INSERT 列表里包含 `message_count`，取值为 `#{messageCount}`（此时为 `null`）；
- 表定义 `V26__agent_chat_session.sql:25`：`message_count INT NOT NULL DEFAULT 0`。MySQL 严格模式（5.7+/8.0 默认）下 `INSERT ... NULL` 到 NOT NULL 列会报 1048，不会回落到 DEFAULT。
- 影响：前端 `createSession` 首次 `upsertRemoteSession`（`useChatSessions.ts:314-316`）即失败；而调用点一律 `catch(() => markSessionApiUnavailable())`，会把整个会话 API 标记为不可用，后续 delete/clear/元数据写入全部被跳过——一次失败被放大成"会话功能离线"。
- 修复：在 `upsertMeta` 里补 `if (entity.getMessageCount() == null) entity.setMessageCount(0)`，或从 INSERT 列中移除 `message_count` 依赖 DEFAULT。

### H2. 终态投影不是所有终止路径都执行
- 投影只从 `DefaultRunSupervisor.onLoopExit`（`:472`）触发；`AgentLoop` 在 `finally` 调 `exitCallback.onExit`（`AgentLoop.java:522-528`），所以 loop 真正跑过并退出的 COMPLETED/FAILED/CANCELLED 都能覆盖。
- 缺口在没有 loop 退出的终止：
  - `DefaultRunSupervisor.markFailed`（`:562-575`）直接把 run 置 FAILED，不调 `onRunTerminal`；
  - `DefaultRunSupervisor.cancel`（`:391-428`）当本地无 `handle`（跨实例运行、WAITING_TOOLS/SUSPENDED 在别的实例）时直接写 CANCELLED，也不触发投影；之后 reconcile 会因 run 已终态而跳过（`:493`）。
- 影响：这些路径下，本轮 assistant/tool 产出（以及 `messages_json` 刷新）可能永远不落库，只剩 `prepareHistory` 写入的用户消息；重载后本轮回复丢失。
- 修复：markFailed 末尾与 cancel 写 CANCELLED 后调用 `onRunTerminal`（需幂等，允许无 checkpoint 时只刷 UI），或在 run 状态机统一加终态钩子。

### H3. 规范日志的读改写只有 JVM 内锁，多实例会丢更新
- `SessionTranscriptProjector` 用 `ConcurrentHashMap<String,Object> locks`（`:71`）做 per-conversation 锁，但这是进程内锁；`persist`（`:464-488`）是整段 `model_messages_json` / `messages_json` 覆盖写，没有版本/乐观锁。
- AgentCore 本身有 lease 和 reconcile（可在另一实例接管），一旦同一 conversation 的两个 run 分落两实例，`prepareHistory`（写用户轮）与 `onRunTerminal`（插 assistant 轮）会互相覆盖。
- 修复：给 `agent_chat_session` 增 `version` 列做 CAS，或对行加 `SELECT ... FOR UPDATE`/独立事务，或把投影改成事件追加模型。

### H4. 迁移导入的"长度"比较口径不一致，可能被静默拒绝
- 前端在 `loadTranscript`（`useChatSessions.ts:181-192`）当 `local.length > remote.length` 时调 `/import` 并本地继续显示 local。
- 后端 `ChatSessionController.importTranscript`（`:154-159`）用 `existing.getMessageCount()` 与 `incoming.size()` 比较。但 `message_count` 两个写路径口径不同：`saveTranscript` 写的是模型消息数（含 tool 消息，`SessionTranscriptProjector.java:480`），`importTranscript` 写的是 UI 消息数（`:174`）。
- 影响：引擎有 tool 调用时 `message_count`（模型数）通常大于本地 UI 条数，`incoming.size() <= existingCount` 成立 → 导入被拒且返回 `imported:false`。前端已经展示 local，于是与引擎产生分歧，下次加载又变回较短的 remote，形成跳动/反复尝试导入。
- 修复：比较同一口径（两边都数 UI user/assistant 条目），或去掉计数放宽，仅保留"引擎已有非空投影则拒绝"的主判定，并让接口把 `imported` 结果回传前端以决定是否清本地副本。

---

## 中：功能缺口/一致性

### M1. 本地消息缓存写路径已成死代码，文档与实现不符
- `saveSessionMessages`（`chat-sessions.ts:117`）除 `migrateLegacy`（`:159`）外无处调用；`MAX_MESSAGES_PER_SESSION` 随之失效。
- 但模块头注释仍写 "keeps a synchronous localStorage copy ... keep working offline"（`:4-10`），`chat-types.ts:88-96` 的 `sanitizeToolPayload` 注释也提到 "cross into localStorage-backed chat history"。实际离线/刷新时 transcript 只能靠引擎，live 轮次会丢。
- 修复：要么真正落地本地 transcript 写盘（作为引擎的离线回退），要么删掉死函数与过期注释/常量，明确 transcript 不落 localStorage。

### M2. 迁移成功后不清理本地副本
- 只有 `clearActiveMessages`/`deleteSession` 会 `deleteSessionMessages`；`importRemoteSession` 成功后不删本地 `kn-ai-chat-session:<id>`。
- 影响：老数据永久占用 localStorage 配额，且（配合 H4）可能反复触发导入。
- 修复：`importRemoteSession` 返回成功后删除对应本地 blob（或标记已迁移）。

### M3. UI 投影丢字段，恢复后时间线/答案高亮退化
- 后端 `toUi`（`SessionTranscriptProjector.java:336-407`）只产出 `id/sender/timestamp/content/images/reasoningContent/steps/subRuns`，不产出 `activitySteps`、`answerStepId`。
- 前端 `MessageBubble` 依赖这两个字段（`MessageBubble.tsx:58-59,116-117`，透传给 `ExecutionStepsDisplay`）。恢复后的 AI 消息缺 `activitySteps`，reasoning/步骤时间线与 answer 选择会退化（`steps` 里的工具步骤仍在，但 `status` 被统一写成 `success`、`timestamp` 统一为消息时间、无 duration——后三点文档已承认，前两点未提及）。
- 修复：投影时补 `activitySteps`（可按 model log 的 assistant 轮重建 step-<n>）与 `answerStepId`，或让 `ExecutionStepsDisplay` 在缺省时仅凭 `steps` 也能完整渲染。

### M4. 投影 message id 每次重写都变
- `toUi` 用 `UUID.randomUUID()` 生成 `u-/a-` id（`:347,362`），而 `prepareHistory` 每轮开始都会 `persist`（`:108`），因此每发一轮，历史所有消息的 id 都变。前端用它做 React `key`（`Chat.tsx:866`）及步骤关联；`overlaySubAgents` 也不得不按 callId 而非 id 做 carry-over。
- 修复：id 基于 (conversation, model-log index) 或持久化稳定 id。

### M5. `/import` 载荷无上限，缺少服务端会话总量约束
- `importTranscript` 只校验 `messages` 是非空数组（`ChatSessionController.java:140`），不限制条数/长度；投影里的 `MAX_CONTENT_CHARS=20000`、`MAX_MODEL_MESSAGES=400`、`MAX_IMAGE_PART_CHARS=4MB` 都只在 projector 生效。图片 data URL 又会同时进 `messages_json` 与 `model_messages_json`，行可非常大（可能触及 `max_allowed_packet`）。
- 另外 `MAX_SESSIONS=50` 只是客户端索引裁剪，服务端 `list` 上限 200，没有 retention/清理（事件有 `event.retention-days`，会话没有）。
- 修复：`/import` 加条数与字节上限；会话表加清理策略或每用户条数上限。

### M6. 断网时删除/清空被可用性开关吞掉且不重放
- `chat-session-api.ts` 的 `available` 一旦因某次失败置 false，`deleteSession`（`useChatSessions.ts:349`）、`clearActiveMessages`（`:404`）、以及所有元数据写入都被跳过，且不排队重试。用户看到本地已删除，重新登录后会话又出现。
- 修复：破坏性操作应带重试/待办队列，或把"读取失败"与"写入失败"分开处理。

### M7. 终态未到就放弃的挂起 run 会让规范日志缺 assistant 轮
- 预算挂起（SUSPENDED）或等待前端工具（WAITING_TOOLS）的 run 若用户不再恢复，`onRunTerminal` 永远不会跑，规范日志只有用户轮。下一轮 `prepareHistory` 追加新用户轮后，日志出现连续两条 user（`isDuplicateLastUser` 只去重完全相同的尾部 user，不同内容则连排），模型上下文里丢失了上轮 assistant 的计划/工具调用。
- 修复：挂起时先落一次进行中的 assistant 轮，或下一轮开始时为未闭合的 run 补投影。

### M8. `locks` map 无清理
- `locks.computeIfAbsent`（`SessionTranscriptProjector.java:726-728`）每个 conversation 永久留一个空对象，长跑实例上无界增长。
- 修复：用完移除或用带 TTL 的锁表。

---

## 低：边角与维护性

- L1. 元数据 last-write-wins + 客户端时钟：`upsertMeta` 无条件覆盖 title/binding，`update_time` 采用请求里的客户端时间（`ChatSessionController.java:119`），跨设备可能用旧值覆盖新标题。
- L2. `boundPage` 基本是死字段：`setBoundPage` 没有任何调用点，仅 `SessionSwitcher` 展示遗留数据；但每次 upsert 仍会回写 `boundPage: meta.boundPage ?? null`，若本地元数据缺该字段的重命名可能把历史绑定清掉。
- L3. `importTranscript` 的 `schema_version=1` 与当前 `SCHEMA_VERSION=3` 不一致；靠 `fromUi` 旧路径兼容，但语义上应写当前版本或明确标记为 legacy。
- L4. `ChatSessionStore` 的 get+save 无事务：两个并发 `/import` 存在 TOCTOU，可能互相覆盖。
- L5. `ChatSessionController.get` 只 catch IllegalArgumentException/IllegalStateException，DB 异常直接 500（影响不大）。

---

## 建议的最小修复顺序

1. H1（一行兜底，直接让新建会话可用）——最高性价比。
2. H4 + M1/M2（迁移口径 + 本地副本清理 + 注释/死代码对齐）。
3. H2（`markFailed`/跨实例 `cancel` 补投影）。
4. H3（DB 乐观锁）与 M5（import 上限/retention）。
5. M3/M4/M7（投影保真度与挂起补轮）。

## 现有测试覆盖

- 后端有 `SessionTranscriptProjectorTest`、`ChatSessionStoreTest`、`ChatSessionControllerMappingTest`、`SubAgentProjectionTest`；建议补：新空会话 PUT 落库（覆盖 H1）、FAILED/CANCELLED 投影（H2）、tool 调用下 import 计数（H4）。
- 前端 `chat-sessions` / `useChatSessions` 没有任何 check/单测（`packages/plugin-ai/src/ai/menu` 下无 `*.check.ts`），迁移与本地缓存回归无保护。
