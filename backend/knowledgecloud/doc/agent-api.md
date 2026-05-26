# Agent 模块 API 文档

> 版本: 1.0.0
> 更新时间: 2026-03-11

---

## 1. 概述

Agent 模块提供 AI 聊天补全能力，支持 OpenAI 兼容的 API 格式。可用于智能问答、任务分解、多 Agent 协作等场景。

### 1.1 基础信息

| 项目 | 说明 |
|------|------|
| 基础 URL | `/api/v1` |
| 认证方式 | API Key (Header: `Authorization: Bearer <token>`) |
| 数据格式 | JSON |
| 通信协议 | HTTP / SSE (Server-Sent Events) |

### 1.2 支持的模型

| 模型 ID | 说明 |
|---------|------|
| `deepseek-chat` | DeepSeek 聊天模型 |
| `deepseek-reasoner` | DeepSeek 推理模型 |

---

## 2. API 端点

### 2.1 聊天补全 (流式)

> SSE 流式输出，用于实时展示 AI 回复

**端点**: `POST /api/v1/chat/completions`

**请求头**:
```
Content-Type: application/json
Authorization: Bearer <your-api-key>
Accept: text/event-stream
```

**请求体**:
```json
{
  "model": "deepseek-chat",
  "messages": [
    {
      "role": "system",
      "content": "你是一个专业的AI助手"
    },
    {
      "role": "user",
      "content": "请介绍一下你自己"
    }
  ],
  "stream": true,
  "temperature": 0.7,
  "maxTokens": 4096,
  "conversationId": "可选的会话ID，用于会话保持",
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "wikiSearch",
        "description": "搜索知识库",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "搜索关键词"
            }
          },
          "required": ["query"]
        }
      }
    }
  ],
  "useAgentTeam": false
}
```

**参数说明**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| model | String | 否 | 模型 ID，默认 `deepseek-chat` |
| messages | Array | 是 | 消息列表 |
| stream | Boolean | 否 | 是否流式输出，默认 `true` |
| temperature | Double | 否 | 采样温度 (0-2)，默认 `0.7` |
| maxTokens | Integer | 否 | 最大生成 token 数，默认 `4096` |
| conversationId | String | 否 | 会话 ID，用于会话保持 |
| tools | Array | 否 | 可用的工具列表 |
| toolChoice | String | 否 | 工具选择策略: `auto` / `none` |
| userId | Long | 否 | 用户 ID，用于审计 |
| useAgentTeam | Boolean | 否 | 是否使用 AgentTeam 处理复杂任务，默认 `false` |

**消息格式**:
```json
{
  "role": "system | user | assistant",
  "content": "消息内容"
}
```

**响应格式** (SSE 流):

```
data: {"choices":[{"delta":{"content":"你好"},"finish_reason":null}]}

data: {"choices":[{"delta":{"content":"！"},"finish_reason":null}]}

data: [DONE]
```

**SSE 事件类型**:

1. **内容块**:
```json
{
  "choices": [{
    "delta": {
      "content": "生成的文本内容"
    },
    "finish_reason": "stop | length | null"
  }]
}
```

2. **Agent 活动事件**:
```json
{
  "choices": [{
    "delta": {
      "annotations": [{
        "type": "agent_activity",
        "role": "Researcher",
        "task": "task-123",
        "status": "running | completed"
      }]
    }
  }]
}
```

3. **错误事件**:
```json
{
  "error": {
    "message": "错误描述"
  }
}
```

---

### 2.2 获取可用模型列表

> 获取当前服务支持的模型

**端点**: `GET /api/v1/models`

**响应示例**:
```json
{
  "object": "list",
  "data": [
    {
      "id": "deepseek-chat",
      "object": "model",
      "owned_by": "deepseek",
      "provider": "deepseek"
    },
    {
      "id": "deepseek-reasoner",
      "object": "model",
      "owned_by": "deepseek",
      "provider": "deepseek"
    }
  ]
}
```

---

### 2.3 获取可用 Provider 列表

> 获取支持的 AI 模型提供商

**端点**: `GET /api/v1/providers`

**响应示例**:
```json
{
  "object": "list",
  "data": ["deepseek"]
}
```

---

### 2.4 注册自定义 Tool

> 注册自定义工具，供 AI 在对话中调用

**端点**: `POST /api/v1/tools`

**请求体**:
```json
{
  "type": "function",
  "function": {
    "name": "myTool",
    "description": "工具描述",
    "parameters": {
      "type": "object",
      "properties": {
        "param1": {
          "type": "string",
          "description": "参数1描述"
        }
      },
      "required": ["param1"]
    }
  }
}
```

**响应示例**:
```json
{
  "object": "tool",
  "id": "tool-uuid",
  "created": 1678900000
}
```

---

### 2.5 获取技能列表

> 获取所有可用的 Skills

**端点**: `GET /api/v1/skills`

**响应示例**:
```json
{
  "object": "list",
  "data": [
    {
      "id": "wikiSearch",
      "name": "Wiki Search",
      "description": "搜索知识库内容",
      "version": "1.0",
      "tier": "DOMAIN",
      "enabled": true,
      "parameters": [
        {
          "name": "query",
          "type": "string",
          "description": "搜索关键词",
          "required": true
        }
      ]
    }
  ]
}
```

---

### 2.6 获取会话历史

> 获取指定会话的历史消息

**端点**: `GET /api/v1/sessions/{conversationId}`

**响应示例**:
```json
{
  "sessionId": "session-uuid",
  "conversationId": "123",
  "executionMode": "SOLO",
  "task": "用户的问题",
  "status": "COMPLETED",
  "result": "AI 的回答",
  "createTime": "2026-03-11T10:00:00",
  "endTime": "2026-03-11T10:00:05",
  "messages": [
    {
      "role": "user",
      "content": "用户消息"
    },
    {
      "role": "assistant",
      "content": "AI 回复"
    }
  ]
}
```

---

### 2.7 获取会话列表

> 获取用户的所有会话

**端点**: `GET /api/v1/sessions`

**响应示例**:
```json
{
  "object": "list",
  "data": [
    {
      "sessionId": "session-1",
      "conversationId": "123",
      "executionMode": "SOLO",
      "task": "用户的问题",
      "status": "COMPLETED",
      "createTime": "2026-03-11T10:00:00",
      "endTime": "2026-03-11T10:00:05"
    }
  ]
}
```

---

## 3. 使用示例

### 3.1 前端 SSE 流式调用示例

```javascript
async function sendMessage(messages, conversationId) {
  const response = await fetch('/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer your-api-key'
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: messages,
      stream: true,
      conversationId: conversationId
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          console.log('Stream completed');
          return;
        }

        try {
          const parsed = JSON.parse(data);
          if (parsed.choices?.[0]?.delta?.content) {
            const content = parsed.choices[0].delta.content;
            console.log('Content:', content);
            // 更新 UI
          }
          if (parsed.choices?.[0]?.delta?.annotations) {
            const annotation = parsed.choices[0].delta.annotations[0];
            console.log('Agent Activity:', annotation);
            // 处理 Agent 活动事件
          }
          if (parsed.error) {
            console.error('Error:', parsed.error.message);
          }
        } catch (e) {
          console.warn('Parse error:', e);
        }
      }
    }
  }
}
```

### 3.2 使用 ai-sdk (React/Vue)

```javascript
import { useChat } from 'ai/react';

function ChatComponent() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/v1/chat/completions',
    headers: {
      'Authorization': 'Bearer your-api-key'
    }
  });

  return (
    <div>
      {messages.map(m => (
        <div key={m.id} role={m.role}>
          {m.content}
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

---

## 4. 错误处理

### 4.1 错误响应格式

```json
{
  "error": {
    "message": "错误描述",
    "type": "invalid_request_error | authentication_error | rate_limit_error | server_error",
    "code": "错误码"
  }
}
```

### 4.2 常见错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| invalid_request_error | 400 | 请求参数错误 |
| authentication_error | 401 | 认证失败 |
| rate_limit_error | 429 | 请求频率超限 |
| server_error | 500 | 服务器内部错误 |

---

## 5. 高级特性

### 5.1 AgentTeam (多 Agent 协作)

对于复杂任务，可以启用 AgentTeam 模式：

```json
{
  "useAgentTeam": true,
  "messages": [
    {
      "role": "user",
      "content": "帮我研究量子计算的最新进展，并写一份报告"
    }
  ]
}
```

AgentTeam 会自动：
1. 分解任务为多个子任务
2. 分配给不同的 Specialist Agent
3. 并行执行
4. 协调结果生成最终报告

### 5.2 工具调用 (Function Calling)

```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "wikiSearch",
        "description": "搜索维基百科",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "搜索关键词"
            }
          },
          "required": ["query"]
        }
      }
    }
  ]
}
```

当 AI 需要调用工具时，会返回：

```json
{
  "choices": [{
    "delta": {
      "tool_calls": [{
        "id": "call_123",
        "type": "function",
        "function": {
          "name": "wikiSearch",
          "arguments": "{\"query\":\"量子计算\"}"
        }
      }]
    }
  }]
}
```

---

## 6. 注意事项

1. **流式响应**: 必须使用 `Accept: text/event-stream` 头部
2. **会话保持**: 提供 `conversationId` 可以保持上下文连续性
3. **工具超时**: 工具调用有 120 秒超时限制
4. **Token 限制**: 单次请求最大 4096 tokens
5. **频率限制**: 默认每分钟 60 次请求

---

## 7. 更新日志

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| 1.0.0 | 2026-03-11 | 初始版本，支持 OpenAI 兼容 API |
