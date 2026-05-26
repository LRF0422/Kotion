# Knowledge Agent 前端集成文档

## 概述

Knowledge Agent 提供与 OpenAI 兼容的流式聊天接口，支持 **SSE** 和 **Data Stream Protocol v2** 两种流式协议。Agent 会自主决定是独立完成任务还是派生子 Agent 协同工作，前端无需关心内部模式切换。

---

## 1. 接口列表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/chat/completions` | 流式聊天（SSE） |
| GET | `/api/v1/models` | 获取可用模型列表 |
| GET | `/api/v1/providers` | 获取可用模型供应商 |
| GET | `/api/v1/chat/config` | 获取服务能力配置 |

---

## 2. 聊天接口

### POST `/api/v1/chat/completions`

**Content-Type**: `application/json`  
**Response Content-Type**: `text/event-stream` (SSE)

### 请求体

```json
{
  "model": "deepseek-chat",
  "messages": [
    { "role": "system", "content": "你是一个知识助手" },
    { "role": "user", "content": "帮我搜索关于微服务架构的文档" }
  ],
  "stream": true,
  "temperature": 0.7,
  "maxTokens": 4096,
  "conversationId": "conv-abc123",
  "sessionId": "sess-xyz789",
  "userId": 10001,
  "tools": [],
  "data": {}
}
```

### 请求字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 否 | 模型名称，如 `deepseek-chat`、`gpt-4o`。不传使用默认模型 |
| `messages` | array | **是** | 消息列表，格式与 OpenAI 一致 |
| `stream` | boolean | 否 | 是否流式返回，默认 `true` |
| `temperature` | number | 否 | 采样温度，默认 `0.7` |
| `maxTokens` | integer | 否 | 最大输出 token 数 |
| `conversationId` | string | 否 | 会话 ID，不传则自动生成 |
| `sessionId` | string | 否 | Agent 会话 ID，用于恢复上下文，不传则创建新会话 |
| `userId` | long | 否 | 用户 ID |
| `tools` | array | 否 | 前端工具定义（OpenAI 格式），用于双向工具调用 |
| `data` | object | 否 | 前端透传元数据 |

### 消息格式

```typescript
interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  reasoning_content?: string; // DeepSeek 思维模式返回的链式推理内容，tool_calls 存在时必须回传
  tool_call_id?: string;   // role=tool 时必填
  name?: string;            // role=tool 时的工具名
  tool_calls?: {            // role=assistant 时的工具调用
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;    // JSON 字符串
    };
  }[];
}
```

---

## 3. SSE 流式响应格式

响应为标准 SSE 流，每条消息格式为：

```
data: {JSON}\n\n
```

流结束时发送：

```
data: [DONE]\n\n
```

### 3.1 事件类型一览

| 事件 | SSE 数据结构 | 说明 |
|------|-------------|------|
| **文本增量** | `{"choices":[{"delta":{"content":"..."}}]}` | LLM 输出的文本片段 |
| **推理增量** | `{"choices":[{"delta":{"reasoning_content":"..."}}]}` | DeepSeek 思维模式的链式推理片段 |
| **工具调用** | `{"choices":[{"delta":{"tool_calls":[...]}}]}` | LLM 请求调用工具 |
| **工具结果** | `{"tool_call_id":"...","result":{...}}` | 工具执行结果 |
| **状态标注** | `{"choices":[{"delta":{"annotations":[...]}}]}` | Agent 状态/子 Agent 进度 |
| **流结束** | `{"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{...}}` 紧接 `data: [DONE]` | 流终止 |
| **错误** | `{"error":{"message":"..."}}` 紧接 `data: [DONE]` | 错误 |

### 3.2 首条消息：Session ID

流的第一条消息始终是包含 `sessionId` 的标注事件，前端应缓存此 ID 用于后续消息的上下文恢复：

```
data: {"choices":[{"delta":{"annotations":[{"sessionId":"sess-xyz789"}]},"finish_reason":null}]}\n\n
```

### 3.3 文本增量

LLM 输出文本时，会持续发送文本增量事件。前端应拼接 `content` 字段：

```
data: {"choices":[{"delta":{"content":"根据"},"finish_reason":null}]}\n\n
data: {"choices":[{"delta":{"content":"搜索结果"},"finish_reason":null}]}\n\n
data: {"choices":[{"delta":{"content":"，找到以下文档..."},"finish_reason":null}]}\n\n
```

**前端处理**：将每次收到的 `content` 追加到显示区域。

### 3.4 推理增量（DeepSeek 思维模式）

使用 DeepSeek 思维模式（deepseek-reasoner / deepseek-chat 等）时，模型在输出最终答案前会先输出链式推理内容（`reasoning_content`）。推理增量事件格式如下：

```
data: {"choices":[{"delta":{"reasoning_content":"让我先分析"},"finish_reason":null}]}


data: {"choices":[{"delta":{"reasoning_content":"这个问题需要..."},"finish_reason":null}]}


```

**前端处理**：

1. **显示**：将 `reasoning_content` 拼接到一个可折叠的"思考过程"区域，与正式回答（`content`）区分展示
2. **回传**：当使用双向工具模式时，前端在回传 `role: "assistant"` 消息中**必须包含** `reasoning_content`，否则 DeepSeek API 会返回 400 错误

> ⚠️ **重要**：当 assistant 消息包含 `tool_calls` 时，`reasoning_content` 必须在所有后续请求中回传给 API。这是 DeepSeek API 的硬性要求。没有 `tool_calls` 的轮次中 `reasoning_content` 可选（API 会忽略）。

### 3.5 工具调用

当 Agent 需要调用工具时，会发送工具调用事件：

```
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc123","type":"function","function":{"name":"search_documents","arguments":"{\"query\":\"微服务架构\"}"}}]},"finish_reason":null}]}\n\n
```

**字段说明**：

| 字段 | 说明 |
|------|------|
| `id` | 工具调用 ID，用于匹配结果 |
| `function.name` | 工具名称 |
| `function.arguments` | 工具参数（JSON 字符串） |

### 3.5 工具结果

工具执行完成后返回结果：

```
data: {"tool_call_id":"call_abc123","result":{"success":true,"output":"找到 5 篇相关文档...","error":null}}\n\n
```

**前端处理**：可用于展示工具调用的中间状态（如"正在搜索..."→"搜索完成"）。

### 3.6 状态标注（Annotations）

Agent 运行过程中的状态变更通过 `annotations` 传递，前端可根据 `type` 字段分派处理：

```
data: {"choices":[{"delta":{"annotations":[{"type":"agent_status","phase":"thinking","iteration":1}]},"finish_reason":null}]}\n\n
```

#### 状态标注类型

| type | 说明 | payload 示例 |
|------|------|-------------|
| `agent_status` | Agent 迭代状态 | `{"type":"agent_status","phase":"thinking","iteration":1}` |
| `agent_status` | Agent 正在调用工具 | `{"type":"agent_status","phase":"tool_calling","tool":"search_documents"}` |
| `delegate_start` | Agent 开始派生子 Agent | `{"type":"delegate_start","subTaskCount":2,"subTasks":[...]}` |
| `subagent_status` | 子 Agent 状态变更 | `{"type":"subagent_status","agentId":"research-1","status":"spawned"}` |
| `subagent_output` | 子 Agent 文本输出 | `{"type":"subagent_output","agentId":"research-1","content":"..."}` |
| `subagent_reasoning` | 子 Agent 推理/思维链输出 | `{"type":"subagent_reasoning","agentId":"research-1","reasoningContent":"..."}` |
| `subagent_tool_call` | 子 Agent 调用工具 | `{"type":"subagent_tool_call","agentId":"research-1","toolName":"search_documents","toolCallId":"..."}` |
| `subagent_tool_result` | 子 Agent 工具结果 | `{"type":"subagent_tool_result","agentId":"research-1","toolCallId":"..."}` |
| `subagent_status_detail` | 子 Agent 内部状态/标注 | `{"type":"subagent_status_detail","agentId":"research-1","detail":[...]}` |
| `subagent_finish` | 子 Agent 输出结束 | `{"type":"subagent_finish","agentId":"research-1","finishReason":"stop"}` |
| `subagent_error` | 子 Agent 出错 | `{"type":"subagent_error","agentId":"research-1","error":"..."}` |
| `delegate_result` | 派生完成 | `{"type":"delegate_result","result":"All sub-agents completed"}` |
| `context_compressed` | 上下文被压缩 | `{"type":"context_compressed","from":30000,"to":15000}` |

#### agent_status.phase 值

| phase | 说明 |
|-------|------|
| `thinking` | LLM 正在推理 |
| `tool_calling` | 正在执行工具 |

#### subagent_status.status 值

| status | 说明 |
|--------|------|
| `spawned` | 子 Agent 已创建 |
| `working` | 子 Agent 工作中 |
| `completed` | 子 Agent 已完成 |
| `error` | 子 Agent 出错 |

### 3.7 流结束

流结束时先发送带有 `finish_reason` 的最终块，然后发送 `[DONE]`：

```
data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1500,"completion_tokens":800}}\n\n
data: [DONE]\n\n
```

#### finish_reason 值

| 值 | 说明 |
|----|------|
| `stop` | 正常结束（LLM 输出完毕） |
| `tool-calls` | 需要前端工具（双向工具模式） |
| `max_iterations` | 达到最大迭代次数 |
| `error` | 运行出错 |

### 3.8 错误

```
data: {"error":{"message":"LLM provider unavailable"}}\n\n
data: [DONE]\n\n
```

---

## 4. 双向工具模式（前端工具）

当 Agent 需要前端交互时（如用户确认、表单填写），流程如下：

1. 前端在请求中传入 `tools` 字段定义前端工具
2. Agent 调用前端工具时，流发送 `tool_calls` 事件，`finish_reason` 为 `"tool-calls"`
3. 前端收到后执行对应交互，将结果作为 `role: "tool"` 消息回传
4. Agent 继续执行

**示例流程**：

```
请求 1: { messages: [...用户消息], tools: [{ type: "function", function: { name: "confirm_action", ... } }] }

响应 1:
  → data: {"choices":[{"delta":{"tool_calls":[{"id":"call_x","function":{"name":"confirm_action","arguments":"..."}}]}}]}
  → data: {"choices":[{"delta":{},"finish_reason":"tool-calls"}]}
  → data: [DONE]

请求 2: { 
  messages: [...之前的消息, 
    { role: "assistant", reasoning_content: "让我分析这个请求...", tool_calls: [{ id: "call_x", type: "function", function: { name: "confirm_action", arguments: "..." } }] },
    { role: "tool", tool_call_id: "call_x", content: "confirmed" }
  ] 
}
```

---

## 5. 多轮对话

使用 `sessionId` 维持多轮对话上下文：

```javascript
// 第一轮
const resp1 = await fetch('/api/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: '搜索微服务文档' }],
    conversationId: 'conv-001'
  })
});
// 从首条 SSE 事件中提取 sessionId

// 第二轮（携带 sessionId 恢复上下文）
const resp2 = await fetch('/api/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: '总结一下搜索结果' }],
    conversationId: 'conv-001',
    sessionId: 'sess-from-first-round'
  })
});
```

---

## 6. 辅助接口

### GET `/api/v1/models`

获取可用模型列表：

```json
{
  "object": "list",
  "data": [
    { "id": "deepseek-chat", "object": "model", "owned_by": "deepseek", "provider": "deepseek" },
    { "id": "gpt-4o", "object": "model", "owned_by": "openai", "provider": "openai" }
  ]
}
```

### GET `/api/v1/providers`

获取可用供应商列表：

```json
{
  "object": "list",
  "data": ["deepseek", "openai", "ollama"]
}
```

### GET `/api/v1/chat/config`

获取服务能力配置：

```json
{
  "features": { "streaming": true, "toolStreaming": true, "multiStep": true, "multiAgent": true },
  "models": { "deepseek": ["deepseek-chat"], "openai": ["gpt-4o"] },
  "providers": ["deepseek", "openai", "ollama"],
  "streamProtocols": ["sse", "data"]
}
```

---

## 7. 前端集成示例

### JavaScript (EventSource 不可用于 POST，需用 fetch)

```javascript
async function chat(messages, sessionId) {
  const response = await fetch('/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: messages,
      conversationId: 'conv-' + Date.now(),
      sessionId: sessionId
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // 保留未完成的行

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') {
        console.log('Stream finished');
        return;
      }

      try {
        const event = JSON.parse(data);

        // 1. 工具结果事件
        if (event.tool_call_id) {
          console.log('Tool result:', event.tool_call_id, event.result);
          continue;
        }

        // 2. 错误事件
        if (event.error) {
          console.error('Error:', event.error.message);
          continue;
        }

        // 3. 标准 OpenAI 格式事件
        const choice = event.choices?.[0];
        if (!choice) continue;

        // 文本增量
        if (choice.delta?.content) {
          appendToUI(choice.delta.content);
        }

        // 推理增量（DeepSeek 思维模式）
        if (choice.delta?.reasoning_content) {
          appendReasoningToUI(choice.delta.reasoning_content);
        }

        // 工具调用
        if (choice.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            console.log('Tool call:', tc.function.name, tc.function.arguments);
          }
        }

        // 状态标注
        if (choice.delta?.annotations) {
          for (const ann of choice.delta.annotations) {
            handleAnnotation(ann);
          }
        }

        // 流结束
        if (choice.finish_reason) {
          console.log('Finish:', choice.finish_reason, event.usage);
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
  }
}

function handleAnnotation(ann) {
  switch (ann.type) {
    case 'agent_status':
      updateStatus(ann.phase === 'thinking' ? '思考中...' : `调用工具: ${ann.tool}`);
      break;
    case 'delegate_start':
      updateStatus(`派生 ${ann.subTaskCount} 个子任务`);
      break;
    case 'subagent_status':
      updateStatus(`子任务 ${ann.agentId}: ${ann.status}`);
      break;
    case 'subagent_output':
      appendSubAgentOutput(ann.agentId, ann.content);
      break;
    case 'delegate_result':
      updateStatus('所有子任务完成');
      break;
  }
}
```

### React + Vercel AI SDK (useChat)

```typescript
import { useChat } from 'ai/react';

function ChatComponent() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/v1/chat/completions',
    body: {
      model: 'deepseek-chat',
    },
    // 处理自定义 annotations 事件
    onToolCall({ toolCall }) {
      if (toolCall.function.name === 'confirm_action') {
        return confirm(toolCall.function.arguments);
      }
    },
  });

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>
          <strong>{msg.role}:</strong>
          {msg.content}
          {msg.toolInvocations?.map((ti) => (
            <div key={ti.toolCallId}>
              🔧 {ti.toolName}: {JSON.stringify(ti.args)}
              {ti.state === 'result' && <span>→ {JSON.stringify(ti.result)}</span>}
            </div>
          ))}
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button type="submit" disabled={isLoading}>Send</button>
      </form>
    </div>
  );
}
```

---

## 8. 事件流时序示例

### 简单对话（solo 模式）

```
前端                                  Agent 服务
  │                                      │
  │──── POST /chat/completions ────────→│
  │                                      │
  │←─ data: {sessionId} ───────────────│  ← 首条：返回 session ID
  │←─ data: {agent_status: thinking} ──│  ← Agent 正在思考
  │←─ data: {content: "正在"} ─────────│  ← 文本增量
  │←─ data: {content: "搜索..."} ──────│
  │←─ data: {tool_call: search} ───────│  ← Agent 决定调用搜索工具
  │←─ data: {agent_status: tool} ──────│  ← 工具执行中
  │←─ data: {tool_result: search} ─────│  ← 工具结果
  │←─ data: {agent_status: thinking} ──│  ← Agent 继续思考
  │←─ data: {content: "找到以下文档"} ─│  ← 最终输出
  │←─ data: {finish: stop} ────────────│
  │←─ data: [DONE] ───────────────────│  ← 流结束
```

### 多 Agent 协作（team 模式）

```
前端                                  Agent 服务
  │                                      │
  │──── POST /chat/completions ────────→│
  │                                      │
  │←─ data: {sessionId} ───────────────│
  │←─ data: {agent_status: thinking} ──│
  │←─ data: {content: "我来分解任务"} ──│
  │←─ data: {tool_call: delegate} ─────│  ← Agent 自主决定派生子任务
  │←─ data: {delegate_start} ──────────│  ← 派生开始，2个子任务
  │←─ data: {subagent_status: spawned} │  ← 子 Agent 1 已创建
  │←─ data: {subagent_status: spawned} │  ← 子 Agent 2 已创建
  │←─ data: {subagent_output: ...} ────│  ← 子 Agent 1 输出
  │←─ data: {subagent_output: ...} ────│  ← 子 Agent 2 输出
  │←─ data: {subagent_status: done} ───│  ← 子 Agent 1 完成
  │←─ data: {subagent_status: done} ───│  ← 子 Agent 2 完成
  │←─ data: {delegate_result} ─────────│  ← 派生结果
  │←─ data: {tool_result: delegate} ───│  ← 工具结果
  │←─ data: {content: "综合结果..."} ──│  ← Agent 最终输出
  │←─ data: {finish: stop} ────────────│
  │←─ data: [DONE] ───────────────────│
```
