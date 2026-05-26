# Agent 引擎流式 API 前端集成指南

> 版本: 3.0.0
> 更新时间: 2026-04-10

---

## 1. 概述

### 1.1 Agent 引擎流式 API 简介

Agent 引擎提供高性能的流式 AI 聊天能力，支持实时文本生成、工具调用、以及 AgentTeam 多智能体协作。本文档详细介绍前端如何集成流式 API，实现流畅的用户体验。

### 1.2 支持的流式协议

| 协议 | 说明 | 适用场景 |
|------|------|----------|
| **Data Stream Protocol v2** | Vercel AI SDK 原生协议，高效紧凑 | 推荐！配合 AI SDK v5 使用 |
| **SSE (Server-Sent Events)** | OpenAI 兼容格式 | 兼容旧版前端或第三方工具 |

### 1.3 推荐技术栈

```
前端框架: React 18+ / Vue 3+ / Next.js 14+
AI SDK: Vercel AI SDK v5 (@ai-sdk/react)
协议: Data Stream Protocol v2
TypeScript: 5.0+
```

**为什么选择 Data Stream Protocol v2？**
- 更紧凑的数据格式，减少传输开销
- Vercel AI SDK 原生支持，无需手动解析
- 支持丰富的事件类型（文本、工具调用、元数据等）
- 更好的 AgentTeam 状态推送支持

---

## 2. 接口概览

### 2.1 API 端点列表

| 方法 | 端点 | 说明 |
|------|------|------|
| `POST` | `/api/v1/chat/completions` | 主聊天接口（流式） |
| `GET` | `/api/v1/chat/config` | 获取配置信息 |
| `GET` | `/api/v1/models` | 获取模型列表 |
| `GET` | `/api/v1/providers` | 获取供应商列表 |
| `POST` | `/api/v1/tools` | 注册自定义工具 |
| `GET` | `/api/v1/skills` | 获取技能列表 |
| `GET` | `/api/v1/sessions` | 获取会话列表 |

### 2.2 基础信息

| 项目 | 说明 |
|------|------|
| 基础 URL | `/api/v1` |
| 认证方式 | API Key (`Authorization: Bearer <token>`) |
| 数据格式 | JSON (请求) / Stream (响应) |
| 流式协议 | Data Stream v2 / SSE |

---

## 3. 请求参数

### 3.1 ChatCompletionRequest

**端点**: `POST /api/v1/chat/completions`

**请求示例**:
```json
{
  "model": "deepseek-chat",
  "messages": [
    {"role": "system", "content": "你是一个专业的AI助手"},
    {"role": "user", "content": "帮我分析这个问题"}
  ],
  "stream": true,
  "streamProtocol": "data",
  "temperature": 0.7,
  "maxTokens": 4096,
  "conversationId": "conv-123",
  "sessionId": "session-abc",
  "userId": 10001,
  "tools": [],
  "toolChoice": "auto",
  "data": {"source": "web-app"}
}
```

**参数详解**:

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `model` | String | 否 | `deepseek-chat` | 模型名称 |
| `messages` | ChatMessage[] | **是** | - | 消息历史列表 |
| `stream` | Boolean | 否 | `true` | 是否开启流式响应 |
| `streamProtocol` | String | 否 | `sse` | 协议选择: `"sse"` / `"data"` |
| `temperature` | Number | 否 | `0.7` | 采样温度 (0.0-2.0) |
| `maxTokens` | Integer | 否 | `4096` | 最大生成 token 数 |
| `tools` | ChatTool[] | 否 | `[]` | 前端工具定义 |
| `toolChoice` | String/Object | 否 | `"auto"` | 工具选择策略 |
| `conversationId` | String | 否 | - | 会话 ID（多轮对话） |
| `sessionId` | String | 否 | - | Agent 会话 ID（缓存状态） |
| `userId` | Long | 否 | - | 用户 ID |
| `data` | Object | 否 | - | 前端元数据透传 |

### 3.2 ChatMessage 消息格式

```typescript
interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;                    // 可选，消息来源名称
  toolCallId?: string;              // role="tool" 时必填
  toolCalls?: ToolCallInfo[];       // role="assistant" 时，表示工具调用
}

interface ToolCallInfo {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;              // JSON 字符串
  };
}
```

**消息角色说明**:

| 角色 | 说明 | 示例 |
|------|------|------|
| `system` | 系统指令，设定 AI 行为 | `{"role":"system","content":"你是一个专业助手"}` |
| `user` | 用户输入 | `{"role":"user","content":"你好"}` |
| `assistant` | AI 回复 | `{"role":"assistant","content":"你好！有什么可以帮助你的？"}` |
| `tool` | 工具执行结果 | `{"role":"tool","toolCallId":"call-1","content":"{...}"}` |

### 3.3 ChatTool 工具定义

```typescript
interface ChatTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, ParameterSchema>;
      required?: string[];
    };
  };
}

interface ParameterSchema {
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  enum?: string[];
}
```

### 3.4 toolChoice 工具选择策略

| 值 | 说明 |
|------|------|
| `"auto"` | AI 自动决定是否调用工具 |
| `"none"` | 禁止调用工具 |
| `"required"` | 强制调用工具 |
| `{"type":"function","function":{"name":"xxx"}}` | 指定调用特定工具 |

---

## 4. 流式协议详解

### 4.1 Data Stream Protocol v2（推荐）

**协议选择方式**:
- 请求头: `Accept: text/plain`
- 或请求体: `"streamProtocol": "data"`

**事件格式**: `{协议码}:{JSON数据}\n`

| 事件类型 | 协议码 | 格式 | 说明 |
|---------|--------|------|------|
| 文本增量 | `0` | `0:"内容"\n` | AI 回复的文本片段 |
| 工具调用 | `9` | `9:{"toolCallId":"x","toolName":"fn","args":{...}}\n` | LLM 请求调用工具 |
| 工具结果 | `a` | `a:{"toolCallId":"x","result":...}\n` | 后端工具执行结果 |
| 完成 | `e` | `e:{"finishReason":"stop","usage":{...}}\n` | 流结束，含 token 用量 |
| 错误 | `d` | `d:{"error":"message"}\n` | 错误信息 |
| 数据/注解 | `8` | `8:[{...}]\n` | 元数据（团队状态、会话信息等）|

**完整响应示例**:
```
8:[{"sessionId":"sess-abc123","conversationId":"conv-456"}]
0:"你好"
0:"！"
0:"我是"
0:"AI助手"
0:"。"
e:{"finishReason":"stop","usage":{"promptTokens":25,"completionTokens":10}}
```

### 4.2 SSE 格式（OpenAI 兼容）

**协议选择方式**:
- 默认格式
- 或请求头: `Accept: text/event-stream`

**事件格式**: `data: {JSON}\n\n`

| 事件类型 | SSE 格式 |
|---------|----------|
| 文本增量 | `data: {"choices":[{"delta":{"content":"内容"},"finish_reason":null}]}\n\n` |
| 工具调用 | `data: {"choices":[{"delta":{"tool_calls":[{...}]},"finish_reason":null}]}\n\n` |
| 完成 | `data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{...}}\n\n` |
| 结束标记 | `data: [DONE]\n\n` |
| 错误 | `data: {"error":{"message":"错误信息"}}\n\n` |
| 注解/元数据 | `data: {"choices":[{"delta":{"annotations":[{...}]}}]}\n\n` |

**完整响应示例**:
```
data: {"choices":[{"delta":{"content":"你好"},"finish_reason":null}]}

data: {"choices":[{"delta":{"content":"！"},"finish_reason":null}]}

data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":25,"completion_tokens":10}}

data: [DONE]
```

### 4.3 协议对比

| 特性 | Data Stream v2 | SSE |
|------|---------------|-----|
| 数据格式 | 紧凑（单字符前缀） | 标准 JSON |
| 传输效率 | ⭐⭐⭐ 高 | ⭐⭐ 中 |
| AI SDK 支持 | 原生支持 | 需适配 |
| 工具调用 | 独立事件 | 嵌套在 delta |
| 元数据推送 | 专用通道 (8:) | 通过 annotations |
| 调试友好度 | 中等 | ⭐⭐⭐ 高 |

---

## 5. 会话管理

### 5.1 会话生命周期

```
┌─────────────────────────────────────────────────────────┐
│                    会话生命周期                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  首次请求 ──► 后端创建会话 ──► 返回 sessionId            │
│      │                              │                   │
│      ▼                              ▼                   │
│  不发送 sessionId              8:[{"sessionId":"..."}]  │
│                                                         │
│  后续请求 ──► 发送 sessionId ──► 复用缓存               │
│      │                              │                   │
│      ▼                              ▼                   │
│  携带相同 sessionId           跳过技能发现/工具转换      │
│                                                         │
│  超时/过期 ──► 30分钟 TTL ──► 自动创建新会话             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 5.2 会话 ID 管理

**首次请求**（不发送 sessionId）:
```typescript
const response = await fetch('/api/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: '你好' }],
    streamProtocol: 'data',
    // 不发送 sessionId
  }),
});
```

**响应首个事件包含 sessionId**:
```
8:[{"sessionId":"sess-abc123","conversationId":"conv-456"}]
```

**后续请求**（发送 sessionId 复用缓存）:
```typescript
const response = await fetch('/api/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({
    model: 'deepseek-chat',
    messages: [...],
    streamProtocol: 'data',
    sessionId: 'sess-abc123',  // 复用已有会话
  }),
});
```

### 5.3 前端会话存储

```typescript
// 存储会话 ID 到 localStorage
function saveSessionId(sessionId: string) {
  localStorage.setItem('agent-session-id', sessionId);
}

// 获取会话 ID
function getSessionId(): string | null {
  return localStorage.getItem('agent-session-id');
}

// 页面恢复时使用
const sessionId = getSessionId();
```

### 5.4 会话参数说明

| 参数 | 说明 |
|------|------|
| `sessionId` | Agent 会话 ID，用于缓存技能、工具等状态，30分钟 TTL |
| `conversationId` | 对话 ID，用于关联多轮消息，可自定义 |

---

## 6. AgentTeam 实时状态推送 ⭐

> **重点章节**: AgentTeam 是 Agent 引擎的核心特性，支持多智能体协作完成复杂任务。

### 6.1 触发条件

AgentTeam 由引擎自主评估任务复杂度决定是否启用：

| 任务类型 | 评估结果 | 执行模式 |
|---------|---------|---------|
| 简单问答 | SIMPLE | 单 Agent 直接回答 |
| 需要调用技能 | MODERATE | 单 Agent + 技能调用 |
| 复杂分析/研究 | COMPLEX | **AgentTeam 多智能体协作** |

**无需前端手动开启**，引擎会根据任务自动选择最佳执行模式。

### 6.2 事件推送机制

所有 AgentTeam 状态通过 **DataEvent（协议码 `8:`）** 推送：

```
8:[{"type":"team_status","event":"team_assembled","members":[...]}]
8:[{"type":"team_status","event":"member_status","memberId":"task-1","status":"working"}]
8:[{"type":"team_status","event":"team_phase","phase":"executing"}]
```

### 6.3 团队组建事件 (team_assembled)

当引擎决定组建 AgentTeam 时，推送团队成员信息：

```json
{
  "type": "team_status",
  "event": "team_assembled",
  "members": [
    {
      "id": "task-1",
      "name": "Researcher",
      "subTask": "调研相关技术方案",
      "dependencyLevel": 0,
      "status": "pending"
    },
    {
      "id": "task-2",
      "name": "Analyzer",
      "subTask": "分析数据并生成报告",
      "dependencyLevel": 1,
      "status": "pending"
    },
    {
      "id": "task-3",
      "name": "Writer",
      "subTask": "撰写最终报告",
      "dependencyLevel": 2,
      "status": "pending"
    }
  ]
}
```

**成员字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String | 任务唯一标识 |
| `name` | String | Agent 角色名称 |
| `subTask` | String | 分配的子任务描述 |
| `dependencyLevel` | Number | 依赖层级（0=无依赖，可并行） |
| `status` | String | 初始状态（pending） |

### 6.4 成员状态变更 (member_status)

每个 Agent 成员状态变化时推送：

```json
{"type": "team_status", "event": "member_status", "memberId": "task-1", "memberName": "Researcher", "status": "working"}
{"type": "team_status", "event": "member_status", "memberId": "task-1", "memberName": "Researcher", "status": "completed"}
{"type": "team_status", "event": "member_status", "memberId": "task-2", "memberName": "Analyzer", "status": "error", "detail": "timeout"}
```

**状态流转**:

```
pending ──► working ──► completed
                   └──► error (附带 detail)
```

| 状态 | 说明 |
|------|------|
| `pending` | 等待执行 |
| `working` | 正在执行 |
| `completed` | 执行完成 |
| `error` | 执行失败（含错误详情） |

### 6.5 团队阶段事件 (team_phase)

整体执行阶段变化：

```json
{"type": "team_status", "event": "team_phase", "phase": "executing"}
{"type": "team_status", "event": "team_phase", "phase": "synthesizing"}
{"type": "team_status", "event": "team_phase", "phase": "completed"}
```

| 阶段 | 说明 |
|------|------|
| `planning` | 规划任务分解 |
| `assembling` | 组建团队 |
| `executing` | 执行子任务 |
| `synthesizing` | 综合结果 |
| `completed` | 全部完成 |

### 6.6 编排状态事件 (orchestration_status)

> 兼容旧版格式，提供更详细的阶段描述

```json
{"type": "orchestration_status", "phase": "planning", "message": "Analyzing task and creating execution plan..."}
{"type": "orchestration_status", "phase": "assembling", "message": "Assembling team of 3 agents..."}
{"type": "orchestration_status", "phase": "executing", "message": "Running 2 agent(s) at dependency level 0..."}
{"type": "orchestration_status", "phase": "synthesizing", "message": "Synthesizing results from 3 agents..."}
```

### 6.7 完整事件时序图

```
用户发送复杂任务
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ 8:[{"type":"orchestration_status","phase":"planning",...}]       │
│     └─ 引擎分析任务，判定为 COMPLEX                               │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"orchestration_status","phase":"assembling",...}]     │
│     └─ 开始组建 AgentTeam                                        │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"team_status","event":"team_assembled","members":[    │
│     {"id":"task-1","name":"Researcher",...},                     │
│     {"id":"task-2","name":"Analyzer",...}                        │
│   ]}]                                                            │
│     └─ 团队组建完成，包含 2 个成员                                │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"team_status","event":"team_phase","phase":"executing"}] │
│     └─ 开始执行阶段                                               │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"team_status","event":"member_status",                │
│     "memberId":"task-1","status":"working"}]                     │
│     └─ Researcher 开始工作                                       │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"team_status","event":"member_status",                │
│     "memberId":"task-2","status":"working"}]                     │
│     └─ Analyzer 开始工作（并行执行）                              │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"member_output","memberId":"task-1",                  │
│     "memberName":"Researcher","content":"量子计算是..."}]         │
│     └─ ⭐ Researcher 实时流式输出（无需等待完成）                  │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"member_output","memberId":"task-2",                  │
│     "memberName":"Analyzer","content":"数据分析显示..."}]         │
│     └─ ⭐ Analyzer 实时流式输出（与 Researcher 并行）              │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"member_output","memberId":"task-1",                  │
│     "memberName":"Researcher","content":"最新进展包括"}]         │
│     └─ ⭐ Researcher 继续输出...                                  │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"member_tool_call","memberId":"task-1",               │
│     "memberName":"Researcher","toolName":"web_search",...}]      │
│     └─ ⭐ Researcher 调用了工具（可观测）                          │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"team_status","event":"member_status",                │
│     "memberId":"task-1","status":"completed"}]                   │
│     └─ Researcher 完成                                           │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"team_status","event":"member_status",                │
│     "memberId":"task-2","status":"completed"}]                   │
│     └─ Analyzer 完成                                             │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"team_status","event":"team_phase",                   │
│     "phase":"synthesizing"}]                                     │
│     └─ 进入综合阶段                                               │
├──────────────────────────────────────────────────────────────────┤
│ 0:"综合分析结果..."                                               │
│ 0:"根据团队研究..."                                               │
│ 0:"最终结论是..."                                                 │
│     └─ 流式输出最终结果                                           │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"team_status","event":"team_phase",                   │
│     "phase":"completed"}]                                        │
│     └─ 团队任务完成                                               │
├──────────────────────────────────────────────────────────────────┤
│ e:{"finishReason":"stop","usage":{"promptTokens":1250,           │
│     "completionTokens":890}}                                     │
│     └─ 流结束                                                     │
└──────────────────────────────────────────────────────────────────┘
```

### 6.8 成员实时输出事件 (member_output) ⭐ 新增

> **v2.1 新增**: Worker 的流式事件现在实时推送到前端，不再等待所有 Worker 完成。

在旧版中，Worker 执行阶段只会推送 `member_status`（working/completed）状态变更，最终综合结果要等到所有 Worker 完成后才流式输出。**从 v2.1 起，每个 Worker 的文本输出、工具调用等事件会实时穿透推送到前端**，前端可以在 Worker 执行过程中就看到每个成员的中间输出。

#### 6.8.1 事件格式

**成员文本输出** (`type: "member_output"`):

```json
{
  "type": "member_output",
  "memberId": "task-1",
  "memberName": "Researcher",
  "content": "根据调研，量子计算的发展趋势如下..."
}
```

**成员工具调用** (`type: "member_tool_call"`):

```json
{
  "type": "member_tool_call",
  "memberId": "task-1",
  "memberName": "Researcher",
  "toolCallId": "call-abc",
  "toolName": "web_search",
  "args": "{\"query\":\"quantum computing 2026\"}"
}
```

**成员工具结果** (`type: "member_tool_result"`):

```json
{
  "type": "member_tool_result",
  "memberId": "task-1",
  "memberName": "Researcher",
  "toolCallId": "call-abc",
  "result": {"items": [...]}
}
```

#### 6.8.2 字段说明

**member_output 字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | String | 固定为 `"member_output"` |
| `memberId` | String | 产出此文本的成员 ID |
| `memberName` | String | 成员角色名称 |
| `content` | String | 文本增量（Delta），非完整文本 |

**member_tool_call 字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | String | 固定为 `"member_tool_call"` |
| `memberId` | String | 调用工具的成员 ID |
| `memberName` | String | 成员角色名称 |
| `toolCallId` | String | 工具调用唯一标识 |
| `toolName` | String | 工具名称 |
| `args` | String | 工具参数（JSON 字符串） |

**member_tool_result 字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | String | 固定为 `"member_tool_result"` |
| `memberId` | String | 成员 ID |
| `memberName` | String | 成员角色名称 |
| `toolCallId` | String | 对应的工具调用 ID |
| `result` | Object | 工具执行结果 |

#### 6.8.3 与 synthesis 阶段文本事件的区别

| 特性 | `member_output` (Worker 输出) | `0:` TextEvent (综合结果) |
|------|------|------|
| 阶段 | executing 阶段，Worker 执行中 | synthesizing 阶段，综合结果 |
| 格式 | `8:[{"type":"member_output",...}]` | `0:"内容"` |
| 内容 | 单个 Worker 的中间输出 | 综合多个 Worker 的最终回答 |
| memberId | 有，标识来源成员 | 无，代表最终结果 |
| 推送时机 | 实时（不等所有 Worker 完成） | Worker 全部完成后 |
| 典型用途 | 分面板实时展示每个 Worker 进度 | 显示最终综合回答 |

### 6.9 实时流式事件时序图 (v2.1)

```
用户发送复杂任务
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ 8:[{"type":"orchestration_status","phase":"planning",...}]       │
│     └─ 引擎分析任务，判定为 COMPLEX                               │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"orchestration_status","phase":"assembling",...}]     │
│     └─ 开始组建 AgentTeam                                        │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"team_status","event":"team_assembled","members":[    │
│     {"id":"task-1","name":"Researcher",...},                     │
│     {"id":"task-2","name":"Analyzer",...}                        │
│   ]}]                                                            │
│     └─ 团队组建完成，包含 2 个成员                                │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"team_status","event":"team_phase",                  │
│     "phase":"executing"}]                                        │
│     └─ 开始执行阶段                                               │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"team_status","event":"member_status",               │
│     "memberId":"task-1","status":"working"}]                    │
│     └─ Researcher 开始工作                                       │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"team_status","event":"member_status",               │
│     "memberId":"task-2","status":"working"}]                    │
│     └─ Analyzer 开始工作（并行执行）                              │
├──────────────────────────────────────────────────────────────────┤
│ ⬇ 以下为实时流式 Worker 输出（v2.1 新增）⬇                        │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"member_output","memberId":"task-1",                 │
│     "memberName":"Researcher","content":"根据调研..."}]          │
│     └─ Researcher 实时输出（不等其他 Worker）                      │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"member_tool_call","memberId":"task-1",              │
│     "toolName":"web_search","args":"{\"query\":\"...\"}"}]    │
│     └─ Researcher 调用工具（实时推送）                             │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"member_output","memberId":"task-2",                 │
│     "memberName":"Analyzer","content":"分析数据显示..."}]        │
│     └─ Analyzer 实时输出（与 Researcher 并行推送）                 │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"team_status","event":"member_status",               │
│     "memberId":"task-1","status":"completed"}]                  │
│     └─ Researcher 完成                                           │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"team_status","event":"member_status",               │
│     "memberId":"task-2","status":"completed"}]                  │
│     └─ Analyzer 完成                                             │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"team_status","event":"team_phase",                  │
│     "phase":"synthesizing"}]                                    │
│     └─ 进入综合阶段                                               │
├──────────────────────────────────────────────────────────────────┤
│ 0:"综合分析结果..."                                               │
│ 0:"根据团队研究..."                                               │
│ 0:"最终结论是..."                                                 │
│     └─ 流式输出最终综合结果                                       │
├──────────────────────────────────────────────────────────────────┤
│ 8:[{"type":"team_status","event":"team_phase",                  │
│     "phase":"completed"}]                                       │
│     └─ 团队任务完成                                               │
├──────────────────────────────────────────────────────────────────┤
│ e:{"finishReason":"stop","usage":{"promptTokens":1250,           │
│     "completionTokens":890}}                                     │
│     └─ 流结束                                                     │
└──────────────────────────────────────────────────────────────────┘
```

### 6.8 Worker 实时输出事件 (member_output) ⭐ 新增

> **v3.0 新特性**: 每个 Worker Agent 的输出现在**实时流式推送**，无需等待所有 worker 完成。
> 前端可以在 executing 阶段就看到每个成员的实时输出。

在 `executing` 阶段，每个 Worker 的 TextEvent 会实时封装为 `member_output` 事件推送：

```json
{"type": "member_output", "memberId": "task-1", "memberName": "Researcher", "content": "量子计算是..."}
{"type": "member_output", "memberId": "task-1", "memberName": "Researcher", "content": "一种利用量子力学"}
{"type": "member_output", "memberId": "task-2", "memberName": "Analyzer", "content": "数据分析显示..."}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | String | 固定值 `"member_output"` |
| `memberId` | String | Worker 唯一标识（对应 team_assembled 中的成员 id） |
| `memberName` | String | Worker 角色名称 |
| `content` | String | 文本增量（delta），与 `0:` TextEvent 格式相同 |

**关键特性**:
- **实时性**: Worker 的每个 TextEvent 立即转发，无需等待该 Worker 完成
- **并行性**: 多个 Worker 的输出交错推送，前端可按 memberId 分组显示
- **与合成结果分离**: `member_output` 是 Worker 原始输出，最终合成结果仍通过 `0:` TextEvent 推送

### 6.9 Worker 工具调用事件 (member_tool_call) ⭐ 新增

Worker 执行过程中调用的工具也会实时推送，便于前端展示工具调用进度：

```json
{"type": "member_tool_call", "memberId": "task-1", "memberName": "Researcher", "toolCallId": "call-abc", "toolName": "web_search", "args": "{\"query\":\"量子计算\"}"}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | String | 固定值 `"member_tool_call"` |
| `memberId` | String | Worker 唯一标识 |
| `memberName` | String | Worker 角色名称 |
| `toolCallId` | String | 工具调用 ID |
| `toolName` | String | 工具名称 |
| `args` | String | 工具参数（JSON 字符串） |

### 6.10 Worker 工具结果事件 (member_tool_result) ⭐ 新增

Worker 执行的工具结果也会实时推送：

```json
{"type": "member_tool_result", "memberId": "task-1", "memberName": "Researcher", "toolCallId": "call-abc", "result": {"findings": "..."}}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | String | 固定值 `"member_tool_result"` |
| `memberId` | String | Worker 唯一标识 |
| `memberName` | String | Worker 角色名称 |
| `toolCallId` | String | 工具调用 ID |
| `result` | Object | 工具执行结果 |

### 6.11 与旧版事件对比

| 特性 | v2.0（旧版） | v3.0（新版） |
|------|-------------|-------------|
| Worker 输出时机 | 全部完成后才推送合成结果 | **每个 Worker 实时流式推送** |
| 前端体验 | executing 阶段只能看到 working/completed 状态 | **executing 阶段可看到每个 Worker 的实时文本和工具调用** |
| 事件类型 | 仅 `team_status` (member_status, team_phase) | 新增 `member_output`, `member_tool_call`, `member_tool_result` |
| 向后兼容 | - | ✅ 旧版事件仍然推送，新增事件为额外数据 |

---

## 7. Worker 实时输出前端集成 ⭐ 新增

> **v3.0 核心特性**: 执行阶段（executing）中，每个 Worker Agent 的输出实时流式推送，
> 前端可按成员分组展示，无需等待所有 Worker 完成。

### 7.1 事件类型总览

v3.0 新增了 3 种 DataEvent 类型，均通过 `8:` 协议码推送：

| type | 说明 | 何时出现 |
|------|------|----------|
| `member_output` | Worker 的文本增量输出 | executing 阶段，Worker 生成文本时 |
| `member_tool_call` | Worker 调用工具 | executing 阶段，Worker 执行工具时 |
| `member_tool_result` | Worker 工具结果 | executing 阶段，工具返回结果时 |

### 7.2 实时输出 Hook

```typescript
interface WorkerOutput {
  memberId: string;
  memberName: string;
  content: string;      // 文本增量
}

interface WorkerToolCall {
  memberId: string;
  memberName: string;
  toolCallId: string;
  toolName: string;
  args: string;         // JSON 字符串
}

interface WorkerToolResult {
  memberId: string;
  memberName: string;
  toolCallId: string;
  result: any;
}

// 增强的团队状态，包含 Worker 实时输出
interface TeamStateV3 {
  members: TeamMember[];
  phase: string;
  orchestrationMessage: string;
  // v3.0 新增
  workerOutputs: Record<string, string>;       // memberId -> 累积文本
  workerToolCalls: Record<string, WorkerToolCall[]>; // memberId -> 工具调用列表
}

function useTeamStatusV3(data: any[] | undefined): TeamStateV3 {
  const [state, setState] = useState<TeamStateV3>({
    members: [],
    phase: '',
    orchestrationMessage: '',
    workerOutputs: {},
    workerToolCalls: {},
  });

  useEffect(() => {
    if (!data || data.length === 0) return;

    for (const item of data) {
      if (item.type === 'team_status') {
        switch (item.event) {
          case 'team_assembled':
            setState((prev) => ({
              ...prev,
              members: item.members,
            }));
            break;
          case 'member_status':
            setState((prev) => ({
              ...prev,
              members: prev.members.map((m) =>
                m.id === item.memberId
                  ? { ...m, status: item.status, detail: item.detail }
                  : m
              ),
            }));
            break;
          case 'team_phase':
            setState((prev) => ({
              ...prev,
              phase: item.phase,
            }));
            break;
        }
      } else if (item.type === 'member_output') {
        // ⭐ v3.0: 实时 Worker 文本输出
        setState((prev) => ({
          ...prev,
          workerOutputs: {
            ...prev.workerOutputs,
            [item.memberId]: (prev.workerOutputs[item.memberId] || '') + item.content,
          },
        }));
      } else if (item.type === 'member_tool_call') {
        // ⭐ v3.0: Worker 工具调用
        setState((prev) => ({
          ...prev,
          workerToolCalls: {
            ...prev.workerToolCalls,
            [item.memberId]: [
              ...(prev.workerToolCalls[item.memberId] || []),
              item,
            ],
          },
        }));
      } else if (item.type === 'member_tool_result') {
        // ⭐ v3.0: Worker 工具结果（可更新对应工具调用状态）
        // 按需处理
      } else if (item.type === 'orchestration_status') {
        setState((prev) => ({
          ...prev,
          phase: item.phase,
          orchestrationMessage: item.message,
        }));
      }
    }
  }, [data]);

  return state;
}
```

### 7.3 Worker 实时输出面板组件

```typescript
function WorkerOutputPanel({ teamState }: { teamState: TeamStateV3 }) {
  const { members, workerOutputs, workerToolCalls } = teamState;

  if (members.length === 0) return null;

  return (
    <div className="worker-output-panel">
      <h4>Agent 执行详情</h4>
      <div className="workers-grid">
        {members.map((member) => (
          <div key={member.id} className={`worker-card status-${member.status}`}>
            <div className="worker-header">
              <span className="worker-name">{member.name}</span>
              <StatusIcon status={member.status} />
            </div>
            <div className="worker-task">{member.subTask}</div>

            {/* ⭐ 实时流式输出 - 无需等待完成 */}
            {workerOutputs[member.id] && (
              <div className="worker-output">
                <pre>{workerOutputs[member.id]}</pre>
              </div>
            )}

            {/* Worker 工具调用进度 */}
            {(workerToolCalls[member.id] || []).map((tc, i) => (
              <div key={i} className="worker-tool-call">
                🔧 {tc.toolName}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 7.4 完整集成示例（Vercel AI SDK）

```typescript
'use client';

import { useChat } from '@ai-sdk/react';
import { useState, useEffect } from 'react';

// ... (TeamStateV3 和 useTeamStatusV3 同上) ...

export function ChatWithRealtimeWorkers() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, data } =
    useChat({
      api: '/api/v1/chat/completions',
      streamProtocol: 'data',
      body: { model: 'deepseek-chat' },
    });

  const teamState = useTeamStatusV3(data as any[] | undefined);

  return (
    <div className="chat-with-realtime-workers">
      {/* Worker 实时输出面板 */}
      {teamState.members.length > 0 && (
        <WorkerOutputPanel teamState={teamState} />
      )}

      {/* 主聊天区域 - 合成结果 */}
      <div className="chat-area">
        {messages.map((m) => (
          <div key={m.id} className={`message ${m.role}`}>
            {m.content}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="输入复杂任务，如：帮我研究量子计算的最新进展"
        />
        <button type="submit" disabled={isLoading}>发送</button>
      </form>
    </div>
  );
}
```

### 7.5 手动解析 Worker 实时输出

如果不使用 AI SDK，在手动解析流时处理新增事件类型：

```typescript
// 在 streamChat 函数的 onAnnotation 回调中新增处理
onAnnotation: (annotations) => {
  for (const ann of annotations) {
    switch (ann.type) {
      case 'team_status':
        // 处理原有的 team_status 事件
        if (ann.event === 'team_assembled') {
          teamMembers.push(...ann.members);
        } else if (ann.event === 'member_status') {
          const member = teamMembers.find((m) => m.id === ann.memberId);
          if (member) member.status = ann.status;
        }
        break;

      case 'member_output':
        // ⭐ v3.0: Worker 实时文本增量
        const outputKey = ann.memberId;
        workerOutputs[outputKey] = (workerOutputs[outputKey] || '') + ann.content;
        // 更新 UI
        updateWorkerOutputPanel(ann.memberId, ann.memberName, workerOutputs[outputKey]);
        break;

      case 'member_tool_call':
        // ⭐ v3.0: Worker 工具调用
        console.log(`[${ann.memberName}] 调用工具: ${ann.toolName}`);
        break;

      case 'member_tool_result':
        // ⭐ v3.0: Worker 工具结果
        console.log(`[${ann.memberName}] 工具结果:`, ann.result);
        break;
    }
  }
}
```

### 7.6 向后兼容性

v3.0 新增的事件类型是**增量式**的，完全向后兼容：

| 事件 | v2.0 前端 | v3.0 前端 |
|------|----------|----------|
| `team_status.member_status` | ✅ 正常处理 | ✅ 正常处理 |
| `team_status.team_phase` | ✅ 正常处理 | ✅ 正常处理 |
| `team_status.team_assembled` | ✅ 正常处理 | ✅ 正常处理 |
| `orchestration_status` | ✅ 正常处理 | ✅ 正常处理 |
| `member_output` | ❌ 忽略（不影响） | ✅ 实时展示 |
| `member_tool_call` | ❌ 忽略（不影响） | ✅ 展示工具调用 |
| `member_tool_result` | ❌ 忽略（不影响） | ✅ 展示工具结果 |

> v2.0 前端无需任何修改即可继续正常工作，只是看不到 Worker 实时输出。
> 升级到 v3.0 后前端可选择性展示 Worker 实时输出。

---

## 8. 前端工具调用

### 8.1 工作流程

```
┌─────────────────────────────────────────────────────────────────┐
│                     前端工具调用流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 前端发送请求（包含 tools 定义）                               │
│     ▼                                                           │
│  2. AI 决定调用工具，返回 9: 事件                                │
│     9:{"toolCallId":"call-1","toolName":"web_search","args":{}} │
│     ▼                                                           │
│  3. 返回 finishReason: "tool-calls"                             │
│     e:{"finishReason":"tool-calls",...}                         │
│     ▼                                                           │
│  4. 前端本地执行工具                                             │
│     const result = await tools.web_search.execute(args);        │
│     ▼                                                           │
│  5. 发送下一次请求，包含工具结果                                  │
│     messages: [..., {role:"tool",toolCallId:"call-1",content}]  │
│     ▼                                                           │
│  6. AI 继续生成回复                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 工具调用事件格式

**Data Stream v2**:
```
9:{"toolCallId":"call-abc123","toolName":"web_search","args":{"query":"AI最新进展"}}
```

**SSE**:
```
data: {"choices":[{"delta":{"tool_calls":[{"id":"call-abc123","type":"function","function":{"name":"web_search","arguments":"{\"query\":\"AI最新进展\"}"}}]}}]}
```

### 8.3 使用 AI SDK 自动处理

Vercel AI SDK v5 可以自动处理工具调用循环：

```typescript
import { useChat } from '@ai-sdk/react';
import { tool } from 'ai';
import { z } from 'zod';

const { messages, handleSubmit } = useChat({
  api: '/api/v1/chat/completions',
  streamProtocol: 'data',
  maxSteps: 5,  // 最多 5 轮工具调用
  tools: {
    web_search: tool({
      description: '搜索网络获取最新信息',
      parameters: z.object({
        query: z.string().describe('搜索关键词'),
      }),
      execute: async ({ query }) => {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        return res.json();
      },
    }),
  },
});
```

---

## 9. 前端代码示例

### 9.1 基础聊天（Vercel AI SDK v5 useChat）

```typescript
'use client';

import { useChat } from '@ai-sdk/react';

export function Chat() {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    data,
    error,
  } = useChat({
    api: '/api/v1/chat/completions',
    streamProtocol: 'data',
    body: {
      model: 'deepseek-chat',
      conversationId: 'conv-123',
    },
    headers: {
      'Authorization': 'Bearer your-api-key',
    },
    onFinish: (message) => {
      console.log('完成:', message);
    },
    onError: (error) => {
      console.error('错误:', error);
    },
  });

  return (
    <div className="chat-container">
      {/* 消息列表 */}
      <div className="messages">
        {messages.map((m) => (
          <div key={m.id} className={`message ${m.role}`}>
            <div className="role">{m.role === 'user' ? '你' : 'AI'}</div>
            <div className="content">{m.content}</div>
          </div>
        ))}
        {isLoading && <div className="loading">AI 正在思考...</div>}
      </div>

      {/* 错误提示 */}
      {error && <div className="error">{error.message}</div>}

      {/* 输入框 */}
      <form onSubmit={handleSubmit} className="input-form">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="输入消息..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          发送
        </button>
      </form>
    </div>
  );
}
```

### 9.2 团队状态展示组件

```typescript
'use client';

import { useChat } from '@ai-sdk/react';
import { useState, useEffect, useMemo } from 'react';

interface TeamMember {
  id: string;
  name: string;
  subTask: string;
  dependencyLevel: number;
  status: 'pending' | 'working' | 'completed' | 'error';
  detail?: string;
}

interface TeamState {
  members: TeamMember[];
  phase: string;
  orchestrationMessage: string;
}

// 解析团队状态的 Hook
function useTeamStatus(data: any[] | undefined): TeamState {
  const [state, setState] = useState<TeamState>({
    members: [],
    phase: '',
    orchestrationMessage: '',
  });

  useEffect(() => {
    if (!data || data.length === 0) return;

    for (const item of data) {
      if (item.type === 'team_status') {
        switch (item.event) {
          case 'team_assembled':
            setState((prev) => ({
              ...prev,
              members: item.members,
            }));
            break;
          case 'member_status':
            setState((prev) => ({
              ...prev,
              members: prev.members.map((m) =>
                m.id === item.memberId
                  ? { ...m, status: item.status, detail: item.detail }
                  : m
              ),
            }));
            break;
          case 'team_phase':
            setState((prev) => ({
              ...prev,
              phase: item.phase,
            }));
            break;
        }
      } else if (item.type === 'orchestration_status') {
        setState((prev) => ({
          ...prev,
          phase: item.phase,
          orchestrationMessage: item.message,
        }));
      }
    }
  }, [data]);

  return state;
}

// 团队状态展示组件
function TeamStatusPanel({ teamState }: { teamState: TeamState }) {
  const { members, phase, orchestrationMessage } = teamState;

  if (members.length === 0 && !phase) {
    return null;
  }

  return (
    <div className="team-status-panel">
      {/* 当前阶段 */}
      {phase && (
        <div className="phase-indicator">
          <span className="phase-label">当前阶段:</span>
          <span className={`phase-value phase-${phase}`}>
            {getPhaseLabel(phase)}
          </span>
        </div>
      )}

      {/* 编排消息 */}
      {orchestrationMessage && (
        <div className="orchestration-message">{orchestrationMessage}</div>
      )}

      {/* 团队成员列表 */}
      {members.length > 0 && (
        <div className="team-members">
          <h4>团队成员</h4>
          <div className="members-grid">
            {members.map((member) => (
              <div key={member.id} className={`member-card status-${member.status}`}>
                <div className="member-name">{member.name}</div>
                <div className="member-task">{member.subTask}</div>
                <div className="member-status">
                  <StatusIcon status={member.status} />
                  <span>{getStatusLabel(member.status)}</span>
                </div>
                {member.detail && (
                  <div className="member-detail">{member.detail}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 辅助函数
function getPhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    planning: '规划中',
    assembling: '组建团队',
    executing: '执行中',
    synthesizing: '综合结果',
    completed: '已完成',
  };
  return labels[phase] || phase;
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '等待中',
    working: '执行中',
    completed: '已完成',
    error: '出错',
  };
  return labels[status] || status;
}

function StatusIcon({ status }: { status: string }) {
  const icons: Record<string, string> = {
    pending: '⏳',
    working: '🔄',
    completed: '✅',
    error: '❌',
  };
  return <span className="status-icon">{icons[status] || '❓'}</span>;
}

// 主聊天组件（集成团队状态）
export function ChatWithTeamStatus() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, data } =
    useChat({
      api: '/api/v1/chat/completions',
      streamProtocol: 'data',
      body: { model: 'deepseek-chat' },
    });

  const teamState = useTeamStatus(data as any[] | undefined);

  return (
    <div className="chat-with-team">
      {/* 团队状态面板 */}
      <TeamStatusPanel teamState={teamState} />

      {/* 聊天界面 */}
      <div className="chat-area">
        {messages.map((m) => (
          <div key={m.id} className={`message ${m.role}`}>
            {m.content}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="输入复杂任务，如：帮我研究量子计算的最新进展"
        />
        <button type="submit" disabled={isLoading}>
          发送
        </button>
      </form>
    </div>
  );
}
```

### 9.3 带工具调用的聊天

```typescript
'use client';

import { useChat } from '@ai-sdk/react';
import { tool } from 'ai';
import { z } from 'zod';

export function ChatWithTools() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat({
      api: '/api/v1/chat/completions',
      streamProtocol: 'data',
      maxSteps: 5,
      body: {
        model: 'deepseek-chat',
      },
      tools: {
        // 网络搜索工具
        web_search: tool({
          description: '搜索网络获取最新信息',
          parameters: z.object({
            query: z.string().describe('搜索关键词'),
          }),
          execute: async ({ query }) => {
            console.log('执行搜索:', query);
            const res = await fetch(
              `/api/search?q=${encodeURIComponent(query)}`
            );
            return res.json();
          },
        }),

        // 获取天气工具
        get_weather: tool({
          description: '获取指定城市的天气信息',
          parameters: z.object({
            city: z.string().describe('城市名称'),
          }),
          execute: async ({ city }) => {
            console.log('获取天气:', city);
            const res = await fetch(
              `/api/weather?city=${encodeURIComponent(city)}`
            );
            return res.json();
          },
        }),

        // 计算器工具
        calculator: tool({
          description: '执行数学计算',
          parameters: z.object({
            expression: z.string().describe('数学表达式，如 2+2*3'),
          }),
          execute: async ({ expression }) => {
            try {
              // 注意: 生产环境应使用安全的表达式解析器
              const result = Function(`'use strict'; return (${expression})`)();
              return { result, expression };
            } catch (e) {
              return { error: '无效的表达式' };
            }
          },
        }),
      },
    });

  return (
    <div className="chat-with-tools">
      <div className="messages">
        {messages.map((m) => (
          <div key={m.id} className={`message ${m.role}`}>
            <div className="content">{m.content}</div>
            {/* 显示工具调用信息 */}
            {m.toolInvocations?.map((tool, i) => (
              <div key={i} className="tool-invocation">
                <span className="tool-name">🔧 {tool.toolName}</span>
                <span className="tool-status">
                  {tool.state === 'result' ? '✅' : '⏳'}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="试试: 今天北京天气怎么样？"
        />
        <button type="submit" disabled={isLoading}>
          发送
        </button>
      </form>
    </div>
  );
}
```

### 9.4 手动流式解析（不使用 AI SDK）

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
}

interface StreamCallbacks {
  onText: (text: string) => void;
  onAnnotation: (annotations: any[]) => void;
  onToolCall: (toolCall: { toolCallId: string; toolName: string; args: any }) => void;
  onFinish: (data: { finishReason: string; usage: any }) => void;
  onError: (error: { error: string }) => void;
}

async function streamChat(
  messages: ChatMessage[],
  callbacks: StreamCallbacks
): Promise<void> {
  const response = await fetch('/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/plain',  // 请求 Data Stream v2 格式
      'Authorization': 'Bearer your-api-key',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // 按行分割处理
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';  // 保留不完整的最后一行

    for (const line of lines) {
      if (!line) continue;

      const code = line[0];
      const data = line.substring(2);  // 跳过 "X:" 前缀

      switch (code) {
        case '0':  // 文本增量
          try {
            const text = JSON.parse(data);  // 去除引号
            callbacks.onText(text);
          } catch (e) {
            console.warn('解析文本失败:', data);
          }
          break;

        case '8':  // 注解/数据（团队状态、会话信息等）
          try {
            const annotations = JSON.parse(data);
            callbacks.onAnnotation(annotations);
          } catch (e) {
            console.warn('解析注解失败:', data);
          }
          break;

        case '9':  // 工具调用
          try {
            const toolCall = JSON.parse(data);
            callbacks.onToolCall(toolCall);
          } catch (e) {
            console.warn('解析工具调用失败:', data);
          }
          break;

        case 'a':  // 工具结果（后端工具）
          try {
            const toolResult = JSON.parse(data);
            console.log('工具结果:', toolResult);
          } catch (e) {
            console.warn('解析工具结果失败:', data);
          }
          break;

        case 'e':  // 完成
          try {
            const finish = JSON.parse(data);
            callbacks.onFinish(finish);
          } catch (e) {
            console.warn('解析完成事件失败:', data);
          }
          break;

        case 'd':  // 错误
          try {
            const error = JSON.parse(data);
            callbacks.onError(error);
          } catch (e) {
            console.warn('解析错误事件失败:', data);
          }
          break;

        default:
          console.log('未知事件类型:', code, data);
      }
    }
  }

  // 处理剩余的缓冲区
  if (buffer) {
    console.log('未处理的数据:', buffer);
  }
}

// 使用示例
async function example() {
  let fullText = '';
  const teamMembers: any[] = [];

  await streamChat(
    [{ role: 'user', content: '帮我分析量子计算的发展趋势' }],
    {
      onText: (text) => {
        fullText += text;
        console.log('收到文本:', text);
        // 更新 UI
        document.getElementById('output')!.textContent = fullText;
      },
      onAnnotation: (annotations) => {
        for (const ann of annotations) {
          if (ann.type === 'team_status') {
            if (ann.event === 'team_assembled') {
              teamMembers.push(...ann.members);
              console.log('团队组建:', ann.members);
            } else if (ann.event === 'member_status') {
              const member = teamMembers.find((m) => m.id === ann.memberId);
              if (member) {
                member.status = ann.status;
                console.log(`${ann.memberName} 状态变更: ${ann.status}`);
              }
            }
          }
        }
      },
      onToolCall: (toolCall) => {
        console.log('需要调用工具:', toolCall.toolName, toolCall.args);
        // 如果是前端工具，需要执行并发送结果
      },
      onFinish: (data) => {
        console.log('完成:', data.finishReason);
        console.log('Token 用量:', data.usage);
      },
      onError: (error) => {
        console.error('错误:', error.error);
      },
    }
  );
}
```

### 9.5 SSE 格式手动解析

```typescript
async function streamChatSSE(
  messages: ChatMessage[],
  onChunk: (content: string) => void,
  onDone: () => void
): Promise<void> {
  const response = await fetch('/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',  // SSE 格式
      'Authorization': 'Bearer your-api-key',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      stream: true,
    }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE 事件以 \n\n 分隔
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      const lines = event.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);

          if (data === '[DONE]') {
            onDone();
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              onChunk(content);
            }

            // 处理注解（团队状态等）
            const annotations = parsed.choices?.[0]?.delta?.annotations;
            if (annotations) {
              console.log('注解:', annotations);
            }

            // 处理工具调用
            const toolCalls = parsed.choices?.[0]?.delta?.tool_calls;
            if (toolCalls) {
              console.log('工具调用:', toolCalls);
            }
          } catch (e) {
            console.warn('解析 SSE 数据失败:', data);
          }
        }
      }
    }
  }
}
```

---

## 10. 错误处理

### 10.1 错误事件格式

**Data Stream v2**:
```
d:{"error":"Rate limit exceeded"}
```

**SSE**:
```
data: {"error":{"message":"Rate limit exceeded","type":"rate_limit_error","code":"rate_limit"}}
```

### 10.2 HTTP 错误码

| 状态码 | 错误类型 | 说明 | 处理建议 |
|--------|----------|------|----------|
| 400 | `invalid_request_error` | 请求参数错误 | 检查请求格式 |
| 401 | `authentication_error` | 认证失败 | 检查 API Key |
| 403 | `permission_denied` | 权限不足 | 检查用户权限 |
| 429 | `rate_limit_error` | 请求频率超限 | 等待后重试 |
| 500 | `server_error` | 服务器内部错误 | 联系管理员 |
| 503 | `service_unavailable` | 服务不可用 | 稍后重试 |

### 10.3 连接重试策略

```typescript
async function streamWithRetry(
  messages: ChatMessage[],
  maxRetries = 3
): Promise<void> {
  let retries = 0;
  let delay = 1000;  // 初始延迟 1 秒

  while (retries < maxRetries) {
    try {
      await streamChat(messages, callbacks);
      return;  // 成功则退出
    } catch (error: any) {
      retries++;
      
      // 判断是否可重试
      if (error.status === 429) {
        // 速率限制，使用 Retry-After 头
        const retryAfter = error.headers?.get('Retry-After');
        delay = retryAfter ? parseInt(retryAfter) * 1000 : delay * 2;
      } else if (error.status >= 500) {
        // 服务器错误，指数退避
        delay = Math.min(delay * 2, 30000);
      } else {
        // 其他错误不重试
        throw error;
      }

      console.log(`重试 ${retries}/${maxRetries}，等待 ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error(`请求失败，已重试 ${maxRetries} 次`);
}
```

### 10.4 Token 预算耗尽处理

当 Token 预算耗尽时，流会提前结束：

```typescript
onFinish: (data) => {
  if (data.finishReason === 'length') {
    // Token 限制导致截断
    console.warn('回复被截断，考虑增加 maxTokens');
    // 可以提示用户继续生成
  }
}
```

---

## 11. TypeScript 类型定义

```typescript
// ============ 请求类型 ============

interface ChatCompletionRequest {
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
  streamProtocol?: 'sse' | 'data';
  temperature?: number;
  maxTokens?: number;
  tools?: ChatTool[];
  toolChoice?: ToolChoice;
  conversationId?: string;
  sessionId?: string;
  userId?: number;
  data?: Record<string, any>;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCallInfo[];
}

interface ToolCallInfo {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ChatTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

interface JSONSchema {
  type: 'object';
  properties: Record<string, PropertySchema>;
  required?: string[];
}

interface PropertySchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  enum?: string[];
}

type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } };

// ============ 响应类型 ============

interface StreamFinishEvent {
  finishReason: 'stop' | 'length' | 'tool-calls' | 'error';
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
}

interface StreamToolCallEvent {
  toolCallId: string;
  toolName: string;
  args: Record<string, any>;
}

interface StreamErrorEvent {
  error: string;
}

// ============ 团队状态类型 ============

interface TeamMember {
  id: string;
  name: string;
  subTask: string;
  dependencyLevel: number;
  status: TeamMemberStatus;
  detail?: string;
}

type TeamMemberStatus = 'pending' | 'working' | 'completed' | 'error';

type TeamPhase = 'planning' | 'assembling' | 'executing' | 'synthesizing' | 'completed';

// 团队组建事件
interface TeamAssembledEvent {
  type: 'team_status';
  event: 'team_assembled';
  members: TeamMember[];
}

// 成员状态变更事件
interface MemberStatusEvent {
  type: 'team_status';
  event: 'member_status';
  memberId: string;
  memberName: string;
  status: TeamMemberStatus;
  detail?: string;
}

// 团队阶段事件
interface TeamPhaseEvent {
  type: 'team_status';
  event: 'team_phase';
  phase: TeamPhase;
}

// 编排状态事件（兼容旧格式）
interface OrchestrationStatusEvent {
  type: 'orchestration_status';
  phase: TeamPhase;
  message: string;
}

// 联合类型
type TeamStatusEvent =
  | TeamAssembledEvent
  | MemberStatusEvent
  | TeamPhaseEvent
  | OrchestrationStatusEvent;

// ============ 成员实时输出类型（v3.0 新增）============

// 成员文本输出事件
interface MemberOutputEvent {
  type: 'member_output';
  memberId: string;
  memberName: string;
  content: string;              // 文本增量（Delta）
}

// 成员工具调用事件
interface MemberToolCallEvent {
  type: 'member_tool_call';
  memberId: string;
  memberName: string;
  toolCallId: string;
  toolName: string;
  args: string;                 // JSON 字符串
}

// 成员工具结果事件
interface MemberToolResultEvent {
  type: 'member_tool_result';
  memberId: string;
  memberName: string;
  toolCallId: string;
  result: unknown;
}

// 成员实时事件联合类型
type MemberStreamEvent =
  | MemberOutputEvent
  | MemberToolCallEvent
  | MemberToolResultEvent;

// 所有可能的 8: 事件联合类型
type DataEvent =
  | TeamStatusEvent
  | MemberStreamEvent;

// ============ 会话类型 ============

interface SessionInfo {
  sessionId: string;
  conversationId: string;
  executionMode: 'SOLO' | 'TEAM';
  status: 'RUNNING' | 'COMPLETED' | 'ERROR';
}

// ============ API 响应类型 ============

interface ModelsResponse {
  object: 'list';
  data: ModelInfo[];
}

interface ModelInfo {
  id: string;
  object: 'model';
  owned_by: string;
  provider: string;
}

interface ProvidersResponse {
  object: 'list';
  data: string[];
}

interface ErrorResponse {
  error: {
    message: string;
    type: string;
    code: string;
  };
}
```

---

## 12. 最佳实践

### 12.1 性能优化

1. **使用 Data Stream v2 协议** - 更紧凑的数据格式，减少传输开销
2. **复用 sessionId** - 避免重复的技能发现和工具转换
3. **合理设置 maxTokens** - 避免不必要的 Token 消耗
4. **前端防抖** - 避免用户快速重复发送请求

### 12.2 用户体验

1. **实时展示文本** - 流式输出立即显示，无需等待完成
2. **显示团队状态** - 复杂任务时展示 AgentTeam 进度
3. **优雅降级** - 网络错误时提供重试选项
4. **加载状态** - 明确指示 AI 正在思考

### 12.3 安全建议

1. **API Key 保护** - 不要在前端代码中暴露 API Key，使用后端代理
2. **输入验证** - 限制用户输入长度，防止滥用
3. **速率限制** - 前端实现请求节流

---

## 13. 常见问题

### Q1: 如何判断当前任务是否使用了 AgentTeam？

**A**: 监听 `team_assembled` 事件，如果收到该事件则表示使用了 AgentTeam：

```typescript
if (annotation.type === 'team_status' && annotation.event === 'team_assembled') {
  console.log('AgentTeam 模式已启用');
}
```

### Q2: sessionId 和 conversationId 有什么区别？

**A**:
- `sessionId`: Agent 引擎会话 ID，用于缓存技能、工具等状态，30分钟 TTL
- `conversationId`: 对话 ID，用于关联多轮消息，可自定义

### Q3: 前端工具调用失败怎么处理？

**A**: 将错误信息作为工具结果返回：

```typescript
messages: [
  ...previousMessages,
  {
    role: 'tool',
    toolCallId: 'call-123',
    content: JSON.stringify({ error: '工具执行失败: 网络超时' })
  }
]
```

### Q4: 如何取消正在进行的流式请求？

**A**: 使用 AbortController：

```typescript
const controller = new AbortController();

fetch('/api/v1/chat/completions', {
  signal: controller.signal,
  // ...
});

// 取消请求
controller.abort();
```

### Q5: Worker 实时输出和最终合成结果有什么区别？

**A**:
- `member_output` 事件（`8:` DataEvent）是每个 Worker Agent 在 executing 阶段实时生成的原始输出，前端可按 `memberId` 分组显示
- `0:` TextEvent 是所有 Worker 完成后，合成阶段（synthesizing）生成的最终统一结果
- 前端可以选择：只展示合成结果（与 v2.0 行为一致），或同时展示 Worker 实时输出

### Q6: 如何区分不同 Worker 的实时输出？

**A**: 每个 `member_output` 事件包含 `memberId` 和 `memberName` 字段，前端可按 `memberId` 分组累积文本：

```typescript
workerOutputs[ann.memberId] = (workerOutputs[ann.memberId] || '') + ann.content;
```

`memberId` 与 `team_assembled` 事件中的成员 `id` 一致，可关联成员信息。

---

## 13. 更新日志

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| 3.0.0 | 2026-04-10 | 新增 Worker 实时流式输出 (member_output, member_tool_call, member_tool_result)，无需等待所有 Worker 完成 |
| 2.0.0 | 2026-03-25 | 新增 Data Stream Protocol v2 支持，完善 AgentTeam 状态推送文档 |
| 1.0.0 | 2026-03-11 | 初始版本，支持 SSE 流式 API |
