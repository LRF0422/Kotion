# AI 会话持久化：引擎拥有的会话日志

## 一句话

客户端不再回传历史、不再写库。引擎维护**规范消息日志（model log）**作为模型上下文的唯一来源，
UI transcript 只是它的**纯投影**（可重建缓存）。这是对 DSH 分层（session log → projection → query，客户端只读）的落地。

| 层 | 载体 | 谁写 | 作用 |
|----|------|------|------|
| 事实来源 | `agent_run_checkpoint`（每 run 模型可见对话）+ `agent_run_event`（append-only 事件） | AgentLoop | 可重放、可恢复的 run 日志 |
| 规范会话日志 | `agent_chat_session.model_messages_json`（`{m: ChatMessage, t: 时间}` 数组） | `SessionTranscriptProjector` | 模型上下文唯一来源 |
| UI 投影 | `agent_chat_session.messages_json`（UI `Message[]`） | `SessionTranscriptProjector`（由 model log 纯推导） | 展示读模型 |
| 客户端 | 内存 messages + localStorage 索引 | 前端 | 乐观回显 + 一次性迁移 |

## 关键改动（打破原设计）

1. **客户端只发本轮用户消息**。`Chat.tsx` / `AIAssistantPanel` 不再调用 `getHistoryForAI`
   （该模块已删除），`agent.start([{role:'user', content}])`。历史由引擎提供。
2. **引擎重建上下文**。`DefaultRunSupervisor.create` 调 `SessionTranscriptProjector.prepareHistory`
   拿回完整会话，经 `CommandRunInput.messages()` 交给 `AgentLoop.initFreshCheckpoint`；
   子 run（delegate）仍用调用方任务消息、不投影。
3. **跨 run 累积**。`prepareHistory` 追加新用户消息；`onRunTerminal` 把本轮 checkpoint 产出的
   assistant/tool 消息插入会话日志（`inputMessageCount - 1` 位置，见下）。
4. **UI 投影由规范日志纯推导**。`toUi(modelLog)` 每次写库时重算，二者不可能分叉；
   不再单独 append UI。
5. **压缩交给 `ContextManager.assemble`**（原有 L1/L2/L3），引擎日志只做容量上限（400 条）。

## 顺序与并发

客户端可能在收到 `run.completed` 后立刻发起下一轮，而上一轮的 `onRunTerminal` 还没跑完。
因此每次投影写入都在**按 conversation 的进程内锁**下进行，并把本轮的产出插入到
`checkpoint.inputMessageCount - 1`（= 该 run 建 checkpoint 时的会话日志长度），而不是盲目追加到尾部。
这样即使下一轮的用户消息已先落库，助手回复仍排在它前面。测试 `terminalRunInsertsBeforeANewerTurnsUser` 固定该行为。

## 迁移

- 旧的 `messages_json` UI 投影（V26/V27 时代）：当规范日志为空时，`fromUi` 从 UI 投影重建规范日志（一次性）。
- 升级前的 localStorage 全量历史：首次加载时若本地更长，客户端调 `POST /sessions/{id}/import` 上传一次，
  后端只接受“比现有投影更长”的导入，之后引擎拥有。
- 清空对话走 `DELETE /sessions/{id}/transcript`，同时清本地迁移副本；下一次只带新消息，不会把旧历史种子带回来。

## REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/agent/v1/sessions` | 会话索引（元数据） |
| GET | `/api/agent/v1/sessions/{id}` | 含引擎投影 transcript |
| PUT | `/api/agent/v1/sessions/{id}` | 仅 UI 元数据（title / @-page）；messages 被忽略 |
| POST | `/api/agent/v1/sessions/{id}/import` | 一次性迁移（仅接受更长） |
| DELETE | `/api/agent/v1/sessions/{id}/transcript` | 清空对话 |
| DELETE | `/api/agent/v1/sessions/{id}` | 删除（幂等） |

## 与 DSH 的剩余差距

- **无 live follow / 全局 seq**：读仍是快照式 `GET`，没有 `dsh-api-session-controller` 那种
  follow + 分页 + 断线重连。当前 SSE 只在单 run 内流式。
- **UI 投影不携带工具时长/成败/用量**：它是 model log 的纯推导，工具步骤的 `status` 统一为 success、
  无 duration、无 per-turn usage（model log 本身不含这些）。live 轮次仍有完整信息。
- **无格式版本迁移链**：DSH 用 `dsh-session-format-*` 不可变代际；这里靠 DB 列 + `schema_version`。

## 验证

```bash
# 前端
npx tsc -p packages/common/tsconfig.json --noEmit
npx tsc -p packages/plugin-ai/tsconfig.json --noEmit
npx tsc -p packages/core/tsconfig.json --noEmit

# 后端
cd backend/knowledgecloud
JAVA_HOME=../../.toolchain/jdk-17.0.20+8/Contents/Home mvn -o \
  -pl knowledge-service/knowledge-agent-skills -am test
```

## 涉及文件

后端：
- `script/migration/V26__agent_chat_session.sql`、`V27__agent_chat_session_projection.sql`、
  `V28__agent_session_model_log.sql`
- `core/session/SessionTranscriptProjector.java`（规范日志 + 投影 + 锁/插入）
- `core/session/ChatSessionStore.java`、`core/entity/AgentChatSessionEntity.java`、
  `core/mapper/AgentChatSessionMapper.java`
- `core/checkpoint/Checkpoint.java`（`inputMessageCount`）、
  `core/loop/AgentLoop.java`（`initFreshCheckpoint` 记录边界）、
  `core/supervisor/DefaultRunSupervisor.java`（`prepareHistory` / `onRunTerminal`）
- `core/web/ChatSessionController.java`、`core/web/dto/*`

前端：
- `packages/plugin-ai/src/ai/menu/Chat.tsx`、`AIAssistantPanel.tsx`（只发新消息）
- `packages/plugin-ai/src/ai/menu/useChatSessions.ts`、`chat-session-api.ts`
- `packages/common/src/ai/agent/types.ts`、`client.ts`
- 删除 `packages/plugin-ai/src/ai/menu/chat-persistence.ts`（`getHistoryForAI` 已无意义）
