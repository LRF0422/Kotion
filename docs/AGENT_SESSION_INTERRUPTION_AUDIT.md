# Agent 会话中断审计（前端 + 后端）

- 日期：2026-11-20
- 范围：`packages/common/src/ai/agent/**`、`packages/core/src/ai/**`、`packages/plugin-ai/src/**`、`packages/core/src/Layout.tsx` / `Dock` / 路由缓存；`backend/knowledgecloud/knowledge-service/knowledge-agent-skills/**`、`knowledge-gateway/**`、nginx 配置。
- 方法：只读代码走查（未启动服务、未改代码）。文中「会 / 不会」均给出代码位置；标注「需实测」的是结构上成立、但未在运行环境复现的结论。
- 结论对象：一次 run 从创建到终态，是否会被**非用户主动停止**的原因打断、卡死或丢失。

---

## 0. 结论（TL;DR）

**正常单窗口、网络稳定、不关标签页/不刷新时，会话不会被打断。**

- 切会话标签页：所有 tab 一直挂载，只是 `hidden`（`packages/plugin-ai/src/ai/menu/Chat.tsx:290-320`）。
- 收起右侧 dock、切换路由：`DockHost` 在所有路由常驻，面板折叠只把宽度设为 0，不卸载（`packages/core/src/Layout.tsx:657-664`、`packages/core/src/components/Dock/DockHost.tsx:266-278`）。
- SSE 断开：后端 run 跑在独立线程池，SSE 只读事件；断流不会终止 run（`core/web/RunStreamer.java:77-85`，全库无「零订阅即取消」）。前端最多重连 5 次并从 `lastSeq` 续传（`packages/common/src/ai/agent/client.ts:50-52,245-293`）。
- 刷新页面：`localStorage` 里的 run 句柄 + `attach()` 从服务端 `lastSeq` 恢复（`packages/common/src/ai/agent/use-editor-agent.ts:534-630`、`packages/core/src/ai/agent/browser-persistence.ts:63-98`）。

**但「不会」有三个前提：**

1. 不要关闭会话标签页——关闭 tab 的语义是 **cancelRun**，不是隐藏（`packages/plugin-ai/src/ai/menu/use-session-actions.ts:88-93`）。
2. 打开的第 7 个 tab 不要是正在跑的会话——超过 6 个会静默淘汰最老的 tab，淘汰时**不 cancel**，前端直接弃流（`packages/plugin-ai/src/ai/menu/useChatSessions.ts:177-187`）。
3. agent 在等**前端工具结果**时，客户端必须在线——这段等待有 180s 硬超时，超时直接把 run 判死（`core/loop/AgentLoop.java:1739-1772`）。

一句话概括：**模型生成阶段是「断线可恢复」，工具执行/审批阶段是「客户端不在就失败」。**

---

## 1. 场景判定表

| 场景 | 会不会打断 | 说明 / 证据 |
|---|---|---|
| 切会话 tab（同一窗口） | 不会 | 每个 tab 一个常驻 `ChatConversation`，非激活只 `hidden`（`Chat.tsx:290-320`） |
| 收起 AI dock / 切到别的路由 | 不会 | 面板首次激活后永久挂载；折叠只改宽度（`DockHost.tsx:180-193,266-278`）；dock 在所有路由挂载（`Layout.tsx:657-664`） |
| 刷新页面 | 一般不会 | `attach()` 从本地句柄或 `thread.activeRunId` 恢复；本地句柄 TTL 30 分钟，但 thread 指针可兜底（`use-editor-agent.ts:534-630`、`browser-persistence.ts:69`） |
| 网络抖动 / SSE 断开 | 不会（run 继续） | 后端 loop 与 HTTP 解耦（`RunStreamer.java:77-85`）；前端重连（`client.ts:245-293`、`use-agent-stream.ts:20,85-105`） |
| 关闭浏览器 / 手机 App 被系统杀掉 | 生成中：不会；等工具时：**会失败** | 生成中 run 继续并落 transcript；等前端工具时 180s 后 `FAILED/tool_timeout`（`AgentLoop.java:1739-1772`） |
| 关闭会话 tab（✕） | **会**（有意设计） | 先 `cancel()` 再移除 tab（`use-session-actions.ts:88-93`、`ChatConversation.tsx:991-995`） |
| 打开第 7 个 tab 淘汰正在跑的 tab | **会失联/可能失败** | 淘汰不 cancel；组件卸载只 abort 流 + 释放锁（`useChatSessions.ts:177-187`、`use-editor-agent.ts:778-796`） |
| 同一会话同时开在 dock 和 `/ai` 页 | **会冲突** | 两个 `useEditorAgent` 抢同一个 `agentcore:lock:<conversationId>`；后到者 `RUN_BUSY`（`browser-persistence.ts:246-303`、`use-editor-agent.ts:352-361`） |
| 同一会话新建 run | 旧 run **被取消** | `create()` 先 `cancelActiveByConversation`（`DefaultRunSupervisor.java:155-162,623-632`） |
| 运行中改模型/参数 | 不会 | 只影响下一轮 run |
| 运行中点「重试」 | 可能重复一轮 user 消息 | `handleRetry` 重发文本并新建 run（`ChatConversation.tsx:1086-1090`） |

---

## 2. 风险清单（按严重度）

### P1 — 会造成用户可见的中断/丢失，且不可恢复

#### P1-1 前端工具等待 180s 硬超时 → `FAILED/tool_timeout`（已修复，见第 6 节；以下为修复前行为）

- 证据：`core/loop/AgentLoop.java:1739`（deadline = `requestedAt + waitingToolsTimeoutSeconds`）、`:1744-1772`（超时 `fail("tool_timeout", "等待编辑器工具结果超时")`）；默认 180s（`core/config/AgentCoreProperties.java:102`、`application.yml:55`）。
- 触发：run 进入 `WAITING_TOOLS` 时，执行该工具的 `usePendingToolExecution` 必须在线。浏览器崩溃/被系统杀掉、手机后台冻结 JS、断网超过窗口、或 tab 被静默淘汰（见 P1-2）——结果就没人提交。（用户点 tab 的 ✕ 会先 cancel，不属于这条。）
- 后果：本轮直接 `FAILED`，终态没有「继续」入口；重新打开会话只能看到失败，不能续跑。
- 现状缓解：客户端有工具结果幂等/看门狗/卸载前落 `started` 标记（`use-pending-tools.ts:196-221,402-515`），但只要执行器不在线就无解。
- 建议：超时后转 `SUSPENDED/client_detached` 而不是 `FAILED`，允许重新 attach 后补交；或把等待窗口做成可配置，并对「客户端已 detach」单独处理。

#### P1-2 第 7 个 tab 静默淘汰正在跑的会话（已修复，见第 6 节；以下为修复前行为）

- 证据：`MAX_OPEN_TABS = 6`（`chat-sessions.ts:43`）；`openTab` 直接 `splice` 掉第一个非激活 tab，不 cancel（`useChatSessions.ts:177-187`）；被移除的 id 从 `Chat.tsx:293-320` 的 map 中消失 → `ChatConversation` 卸载；卸载清理只 `abort()` + `lock.release()`，不 `cancelRun`（`use-editor-agent.ts:778-796`）。
- 后果：
  - 生成中：后端继续烧 token，但 UI 上完全失联（`runStatus` 也不在 `anyRunning` 的遍历范围里，`Chat.tsx:161-164`）；只能从历史里重新打开该会话触发 `attach`。
  - 等工具时：180s 后 `FAILED/tool_timeout`（同 P1-1）。
- 建议：淘汰前若该 tab 的 `runStatus` 是 `running`/`attention`，拒绝淘汰并提示，或像关 tab 一样显式 cancel（并二次确认）。

#### P1-3 Redis 租约续期一次失败 → 取消本地 loop → `FAILED/loop_exit`（已修复，见第 6 节；以下为修复前行为）

- 证据：`renewLeases()` 每 10s 跑一次，`lease.renew()` 返回 false 就 `handle.loop.requestCancel()`（`DefaultRunSupervisor.java:716-731`）；`renew()` 捕获任何 Redis 异常都返回 false（`core/supervisor/RunLease.java:44-56`）。
- 退出路径：`requestCancel()` 只设本地标记，不写 cancelFlag；`onLoopExit` 发现 run 非终态且租约已释放 → `markFailed("loop_exit")`（`DefaultRunSupervisor.java:645-665`）。
- 后果：Redis 一次超时/抖动就可能把**所有本地在跑的 run** 打成失败；没有重试/宽限期。
- 建议：`renew` 失败先重试 2-3 次并加宽限；`onLoopExit` 区分「租约丢失」与「线程崩溃」，前者转可恢复状态，不要直接 FAILED。

#### P1-4 同一会话在 dock 与 `/ai` 双挂载 → RunLock 冲突（已修复，见第 6 节；以下为修复前行为）

- 证据：dock 在所有路由常驻（`Layout.tsx:657-664`）；`/ai` 页面同样调用 `useChatSessions()` 并为每个 open tab 挂 `KernelConversation`（`packages/plugin-ai/src/ai/home/KernelHomePage.tsx:42-52,536-558`）；两处共享同一份 open-tabs/会话 id（`KernelHomePage.tsx:42-52` 明确写了「Session management is SHARED with the side dock」）；`RunLock` 的 scope 只有 `conversationId`（`browser-persistence.ts:246-303`）。
- 后果：一侧正在跑时，另一侧的 `start()` 直接抛「该会话正在另一个标签页中运行」（`/ai` 页的 `KernelConversation` 本身不做 `attach`，所以只有发送时撞锁）；dock 侧的 `attach()` 若恰好重挂载则会走 `RUN_BUSY` 重试，5 次后变 `suspended`。更糟的是：在 dock 侧关闭该会话 tab 会 `cancelRun`——即使用户此时正在 `/ai` 页看同一个会话，run 也会被取消，而 `/ai` 并不会接管它。
- 现状：这不是「同一浏览器两个标签页」的锁，而是**同一页面内两个 surface** 的锁冲突；文档明确说两者 session 共享（`KernelHomePage.tsx:42-52`），但代码没有做 owner 交接。
- 建议：`/ai` 激活时卸载/让位 dock，或给 lock 加 surface 维度并做 owner 交接；至少把 `RUN_BUSY` 文案区分为「另一个面板」。

### P2 — 会丢消息、卡住或体验上像中断

#### P2-1 `start()` 在 in-flight 时静默复用旧 promise → 第二条消息丢失（已修复，见第 6 节）

- 证据：`use-editor-agent.ts:348-349`（`if (startInFlightRef.current) return startInFlightRef.current`）；`ChatConversation.tsx:1039-1046`（`isActive` 只由 `phase` 决定，创建 run 的两个网络往返期间 phase 仍是 `idle`）。
- 触发：发送后立刻再发（双击 Enter、慢网）。第二条气泡已经加到 UI（`ChatConversation.tsx:1009-1020`），但 `start()` 只是把第一条的 promise 返回，**从未发出请求**，也没有错误提示。
- 后果：刷新后第二条消失（engine 才是权威 transcript）。
- 建议：`start()` 在 in-flight 时返回 `false`/抛 `BUSY`，调用方转入 `queuedTurnRef`；或用提交锁 + 显式队列。

#### P2-2 `queuedTurnRef` 是单槽，连续两次被拒只保留最后一条（已修复，见第 6 节）

- 证据：`ChatConversation.tsx:866`（单槽 `AgentChatMessage[] | null`）、`:1045`（覆盖赋值）、`:914-919,971`（终态只 flush 一条）。
- 触发：一轮收尾阶段连发两条，两条都越过 steer 安全边界。
- 后果：第一条气泡留在历史里，但永远不会发到后端。
- 建议：改成 `AgentChatMessage[][]` 队列，逐条 flush。

#### P2-3 `suspended` 且 `runId` 为空时，发送会永久排队（已修复，见第 6 节）

- 证据：`isActive` 包含 `suspended`（`ChatConversation.tsx:799-806`）；`steer()` 在 `!current.runId` 时返回 false（`use-editor-agent.ts:658-668`）；`submitMessage` 随后 `queuedTurnRef.current = agentMessages`（`ChatConversation.tsx:1039-1046`），但终态 effect 只在 `completed/failed/cancelled` 才 flush（`:924-971`）。`suspended` 可能一直保持（attach 失败/锁冲突）。
- 后果：用户发消息后没有任何反应，气泡留在本地。
- 建议：`suspended` 时直接走 `start()`（新 run）而不是 steer；或在 steer 失败且无 runId 时立即 `start()`。

#### P2-4 关闭标签页 = 取消运行（无确认、无「后台继续」）

- 证据：`use-session-actions.ts:88-93`、`ChatConversation.tsx:991-995`。
- 后果：用户以为只是收起，实际 `cancelRun`；取消瞬间的答案不会再回到会话。
- 建议：运行中关闭给二次确认，或改成「移到后台」保留 run。

#### P2-5 LLM 首包 120s / 流中空闲 30s → `FAILED/llm_timeout`，有内容后不重试

- 证据：`AgentCoreProperties.java:111-113`；`core/llm/LlmGateway.java:88-124`（只在首 chunk 前重试）、`:207-216`（超时异常）；`AgentLoop.java:930-951`（`LlmTimeoutException` → `FAILED`）。
- 触发：长 reasoning、供应商限流/弱网、共享 provider 饱和。
- 后果：整轮失败，已生成文本保留但任务不再继续。
- 建议：对已产生内容的 run 支持「续流」；或把 idle 超时按模型/场景调大（30s 对 reasoning 模型偏紧）。

#### P2-6 计划审批 / 预算挂起没有 TTL

- 证据：`AgentLoop.java:2532-2567`（plan 等待）、`:1884-1902`（budget 等待）都是无 deadline 的循环。
- 后果：无人审批/无人点继续时，run 永久 `SUSPENDED`；关掉页面后也一直挂着。不是「失败」，但会话卡死。
- 建议：审批/预算等待加可配置 TTL，超时转 `CANCELLED(timeout)` 并明确提示。

#### P2-7 事件 >2000 条被裁剪 / SSE 线程池满 → 前端 gap/断流（run 仍在跑）

- 证据：每 run 只保留最新 2000 条（`core/event/DefaultRunEventLog.java:93-99`），冷层是异步 best-effort（`:111-114,127-152`）；SSE 线程池 8→256 + `SynchronousQueue` + AbortPolicy，饱和直接 `complete()`（`RunStreamer.java:48-53,233-240`）。
- 后果：前端收到 `AgentSequenceGapError` 或空流，5 次重连后 `connection-stopped`，但后端 run 可能仍在跑。
- 建议：gap 时降级为全量重放/重建，而不是 close；SSE 池满返回明确的 `control.error`。

#### P2-8 进程重启后的 60-75s 空窗 / checkpoint 缺失 → `unrecoverable`

- 证据：reconcile 每 15s 扫一次，要求 `update_time < now-60s` 且无租约（`DefaultRunSupervisor.java:687-713`）；checkpoint 缺失直接 `markFailed`（`:701-704`）。
- 后果：重启后前端最长约 75s 显示连接停止；checkpoint 缺失则直接失败。
- 建议：缩短 cutoff；checkpoint 双写校验；启动即恢复。

### P3 — 次要问题

- **重试会重复 user turn**：`handleRetry` 重发文本并新建 run（`ChatConversation.tsx:1086-1090`），如果上一轮已有 assistant 输出，`prepareHistory` 的 `isDuplicateLastUser` 不会命中（`SessionTranscriptProjector.java:186-195`），历史里出现两条相同 user 消息。
- **`runStatus` 残留 `running`**：`ChatConversation` 在 `idle` 时直接 return、不上报（`ChatConversation.tsx:825-841`）；关闭/淘汰 tab 后重新打开，容器里的旧状态可能让 dock 一直转圈（`Chat.tsx:123-129` 只清 `done/failed`）。
- **tenantId 为 null 时自动取消失效**：`parseTenantId()` 返回 null（`EditorAgentController.java:528-535`），`selectActiveByConversation` 的 `tenant_id = NULL` 永不匹配（`AgentRunMapper.java:72-77`）→ 同一会话可能并行两个 run。正常 JWT 会带 tenant，属边缘部署场景。
- **`createRun` 15s 超时与「服务端已创建」的窗口**：客户端 abort 后只在 `thread.activeRunId` 已变化时 attach（`use-editor-agent.ts:421-443`）；若服务端在 15s 后才创建，可能留下一个无人驱动的 run（可被后续 attach/reconcile 救回）。
- **`start()` 成功但组件已卸载**：会主动 `cancelRun`（`use-editor-agent.ts:408-416`）；在切换到 `/ai`/移动端关 Sheet 的瞬间发生，会把刚创建的 run 取消。

---

## 3. 正常路径的保障机制（为什么大多数情况下不会断）

1. **loop 与 HTTP 解耦**：SSE 关闭只关订阅，不碰 run（`RunStreamer.java:77-85`）；没有「无人订阅即取消」。
2. **事件先落盘再推送**：Redis 热层 + MySQL 冷层，重连按 `afterSeq` 严格连续重放（`DefaultRunEventLog.java:74-152`）。
3. **keepalive 15s** 顶住 nginx 默认 60s 读空闲；客户端读空闲 60s 才判定断流（`RunStreamer.java:36,66-75`；`packages/common/src/ai/agent/events.ts:107`）。
4. **客户端自动重连**：外层 5 次 + 内层 5 次，指数退避，从 `lastSeq` 续传（`use-agent-stream.ts:20,85-105`；`client.ts:245-293`）。
5. **刷新恢复**：`RunStore` 句柄（localStorage，30 分钟 TTL）+ `attach()` 从服务端 `lastSeq` 续（`browser-persistence.ts:63-98`；`use-editor-agent.ts:570-619`）。
6. **工具结果幂等**：先写 `started` 意图标记再执行；重挂载遇 `started` fail-closed；`tool_results` 按 callId 幂等；看门狗重提交（`use-pending-tools.ts:196-221,402-515`；`DefaultRunSupervisor.java:477-536`）。
7. **暂停顺序正确**：先发布 pending 集合、再持久化暂停、最后发 `run.suspended`（`AgentLoop.java:1658-1718`）。
8. **子 agent 失败隔离**：子 run 失败只作为工具结果回父上下文，不失败父 run（`AgentLoop.java:2029-2048,2134-2191`）。
9. **transcript 投影 CAS + 幂等**：`version` 乐观锁 + 按 run 去重（`ChatSessionStore.java:90-101`；`SessionTranscriptProjector.java:166-210,1095-1100`）。

---

## 4. 建议修复优先级

1. **P1-1**：`WAITING_TOOLS` 超时不要 `FAILED`，改可恢复的 `SUSPENDED`；或把「客户端 detach」与「工具执行失败」区分开。
2. **P1-2**：运行中的 tab 不允许静默淘汰；淘汰/关闭前先确认。
3. **P1-3**：租约续期加宽限与重试；`onLoopExit` 区分租约丢失与线程崩溃。
4. **P1-4**：dock 与 `/ai` 的 owner 交接（已实现，见第 6 节）。
5. **P2-1/2/3**：`start()` 返回值语义 + 多槽待发队列 + `suspended` 直接新 run。
6. **P2-5**：LLM idle 超时按模型可配 + 已生成内容支持续流。
7. **P2-6**：审批/预算等待加 TTL。

---

## 5. 需要实测确认的点

1. **网关 `response-timeout: 300s` 的真实语义**（整条响应 vs 每次读空闲）。若是整条，>5 分钟的流会被网关切断；后端 run 仍继续（`knowledge-gateway/src/main/resources/bootstrap.yml:13-14`）。
2. **nginx 默认 60s 读空闲**：keepalive 15s 应安全；若 keepalive 发送失败被吞（`RunStreamer.java:71-74`）则会断。确认生产是否真的部署了 `proxy_buffering off` 的配置（`script/docker/nginx/api/nginx.conf:61-67`）。
3. **dock + `/ai` 双挂载**：手动打开 dock 的某个会话 → 导航到 `/ai` → 看是否报「另一个标签页中运行」；再关闭 dock tab 看 `/ai` 的 run 是否被取消。
4. **第 7 个 tab 淘汰**：让 tab1 处于 streaming，连续新建 6 个 tab；观察是否发出 `POST /cancel`（预期：没有）、后端 run 是否继续、重新打开 tab1 是否 attach。
5. **创建窗口连发**：DevTools Slow 3G 下「发送→立刻再发」，对比 `POST /runs` 数与 UI 气泡数。
6. **等工具时关面板**：让 agent 调用需要编辑器的工具，在 `WAITING_TOOLS` 时关闭 tab/冻结页面，观察后端 180s 后是否 `tool_timeout`。
7. **租约抖动**：在测试环境短暂阻塞 Redis（>10s），观察是否出现 `Lease lost ... stopping local loop` 与 `loop_exit`。
8. **长 run + 断网重连**：>2000 事件后从 0 重放，确认冷层兜底不会产生永久 gap。

---

## 6. 本次修复（2026-11-20）

> 代码已改，验证见本节末尾。

### 已修复

| 项 | 改动 | 关键位置 |
|---|---|---|
| **P1-1** 工具等待不再判死 | 180s 窗口到期且无结果 → `SUSPENDED/client_detached`，pending 调用保留在 checkpoint；`onLoopExit` 对这种 run 不 markFailed、不投影；`reconcile` 跳过它，等客户端 attach + resume 再重建 loop。事件仍以 `run.suspended(reason=waiting_tools)` 发出，前端重放后会重新执行 pending 工具。 | `AgentLoop.java` `suspendForDetachedClient` / `dispatchWaitForPending`；`DefaultRunSupervisor.java` `onLoopExit` / `reconcile` |
| **P1-2** 不淘汰正在跑的 tab | 新增纯函数 `planOpenTab`：达到 6 个 tab 时只淘汰「非激活且无 live run」的最老 tab；若其余全在跑，宁可暂时超过软上限也不丢 run。Chat 与 `/ai` 都传入 `isSessionRunning`。 | `chat/tab-eviction.ts`、`useChatSessions.ts`、`Chat.tsx`、`KernelHomePage.tsx` |
| **P1-3** 租约抖动不再直接杀 run | 续租连续失败 2 次（约 20s，仍小于 30s TTL）才停本地 loop；停 loop 后 run 保持非终态，交给 reconcile/resume 从 checkpoint 重建，不再 `FAILED/loop_exit`。 | `DefaultRunSupervisor.java` `renewLeases` / `onLoopExit` |
| **P2-1** start in-flight 不再静默丢消息 | `start()` 在已有 start 在途时先 await，再把新 turn 作为 steer 送进刚创建的 run；若没有 live run 才新建。 | `use-editor-agent.ts` `start` |
| **P2-2** 待发消息改多槽 FIFO | `queuedTurnRef` 改为数组；每次终态只 flush 队首，下一条等下一轮终态。 | `ChatConversation.tsx` |
| **P2-3** `suspended` 无 runId 时不再永久排队 | 只有 `isActive && runId` 才走 steer；无 runId 时直接 `start()`（或由 P2-1 折叠进正在创建的 run）。 | `ChatConversation.tsx` `submitMessage` |
| **P1-4** dock 与 `/ai` 共享会话时的双挂载 | 新增 per-conversation surface owner：同一时刻只有一个 surface 驱动（`dock` / `kernel`）。可安全切换的相位（idle / streaming / 终态）主动 `detach()`（只 abort 本地流、释放 RunLock，不取消 run），另一侧 `attach()` 续流；等待工具/审批/计划/预算时保留 owner，另一侧渲染「在另一 surface 运行」提示而不是再挂一个 agent。`/ai` 被路由缓存隐藏时主动让位；dock 在 `/ai` 上让位（且只在 `/ai` 真的挂载了该会话时才让，避免两份 session index 短暂不一致把会话藏起来）。清空/删除也只允许 owner surface 执行，避免在别人的 live run 下删掉引擎 transcript。 | `chat/agent-surface.ts`、`use-session-actions.ts`、`use-editor-agent.ts` `detach`、`ChatConversation.tsx`、`KernelConversation.tsx`、`use-workspace-agent.ts`（persist 改为 true，交接时可接管句柄） |
| **错误可读性** | 锁冲突文案改为「另一个窗口、标签页或面板」；`classifyError` 对未知错误保留引擎原始 message，不再一律显示「生成失败」。 | `use-editor-agent.ts`、`chat-types.ts` |

### 新增/更新的回归检查

- `packages/plugin-ai/src/ai/menu/chat/tab-eviction.check.ts` + `pnpm --filter @kn/plugin-ai check:tabs`：覆盖「不淘汰运行中 tab」「全部在跑时超软上限」「active 不淘汰」。
- `AgentLoopToolWaitTest.aSpentDeadlineWithoutAnAnswerParksTheRunForResume`：断言超时后是 `SUSPENDED/client_detached`、无 errorCode、pending 仍在。
- `packages/plugin-ai/src/ai/menu/chat/agent-surface.check.ts` + `pnpm --filter @kn/plugin-ai check:surface`：覆盖「同一会话只有一个 owner」「非 owner 不能 release」「工具/审批等不安全相位不能交接」「mount 注册/注销」。

### 本次未改（仍建议排期）

- **P2-5** LLM `idle-timeout-seconds=30`：是否放宽取决于模型/provider，属于配置/产品取舍。
- **P2-6** 计划审批 / 预算挂起无 TTL：目前仍会一直等待用户；可在产品确认后加 TTL。
- **P2-7** 事件 2000 条裁剪 / SSE 线程池饱和：属于容量与降级策略。
- **P2-8** 进程重启 60-75s 空窗 / checkpoint 缺失：需要缩短 reconcile cutoff 或启动即恢复。
- **P3** 重试重复 user turn、`runStatus` 残留、tenant null 时自动取消失效：未在本轮处理。
- **P3** dock 与 `/ai` 仍各有一份 `useChatSessions` 元数据 state（标题/列表的实时同步），本次只解决「同一会话被两个 agent 同时驱动」；清空/删除已按 owner surface 拦截。

### 验证命令与结果

```bash
# 前端
pnpm --filter @kn/plugin-ai check:tabs          # ok
pnpm --filter @kn/plugin-ai check:surface       # ok
pnpm --filter @kn/common check:agent            # agent-core checks passed
npx tsc -p packages/common/tsconfig.json --noEmit   # 通过
npx tsc -p packages/plugin-ai/tsconfig.json --noEmit # 仅仓库既有 @ui/editor 解析错误，本次文件无新增错误
pnpm --filter @kn/plugin-ai build                  # 通过（含 dist 产物）

# 后端
JAVA_HOME=../../.toolchain/jdk-17.0.20+8/Contents/Home \
  ../../.toolchain/apache-maven-3.9.9/bin/mvn -o -q \
  -pl knowledge-service/knowledge-agent-skills -am \
  -Dtest='AgentLoop*Test,DefaultRunSupervisorResumeAckTest' \
  -Dsurefire.failIfNoSpecifiedTests=false test   # 通过
```

---

## 7. 审计范围外 / 未发现的问题

- 未发现「run 级总时长限制」。
- 未发现「无订阅者自动取消」。
- 未发现「create 幂等键」。
- 未发现 `resume.ack` 事件（确认应用与否靠 `tool.completed` / `GET /runs/{id}`）。
- 前端 `ai.chat.unavailable` 的 i18n key 实际存在（`packages/plugin-ai/src/index.tsx:398,710`），不是缺陷。