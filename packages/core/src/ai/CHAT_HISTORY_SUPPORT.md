# Chat 历史消息传递功能

## 概述

为 Chat 组件增加了历史对话记录传递功能，使 AI Agent 能够理解上下文，提供更连贯的对话体验。

## 改动内容

### 1. 修改 `useEditorAgentOptimized` Hook

#### 文件: `packages/core/src/ai/use-agent-optimized.tsx`

**更新 stream 方法签名**:

```typescript
// 之前
const stream = useCallback(async (options: { prompt: string }) => {
    // ...
}, [agent])

// 现在
const stream = useCallback(async (options: { 
    prompt: string
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>
}) => {
    // ...
}, [agent])
```

**新增历史消息处理逻辑**:

```typescript
// Build initial messages array
const initialMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []

// Add history messages if provided
if (options.messages && options.messages.length > 0) {
    initialMessages.push(...options.messages)
}

// Add current prompt
initialMessages.push({
    role: 'user',
    content: options.prompt
})

return agent.stream({
    prompt: options.prompt,
    initialMessages,  // 传递历史消息
    abortSignal: abortControllerRef.current.signal
})
```

### 2. 修改 Chat 组件

#### 文件: `packages/plugin-ai/src/ai/menu/Chat.tsx`

**更新 handleSubmit 函数**:

在调用 agent stream 之前，构建历史消息数组：

```typescript
// Build history messages from previous conversation (excluding initial message)
const historyMessages = messages
    .filter(msg => msg.id !== INITIAL_MESSAGE.id)  // Exclude initial greeting
    .map(msg => ({
        role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content
    }))

const { textStream } = await stream({
    prompt: input,
    messages: historyMessages  // Pass conversation history
})
```

**关键点**:
1. 从 `messages` 状态中提取历史对话
2. 过滤掉初始欢迎消息（避免干扰）
3. 转换为 Agent 需要的格式 `{ role, content }`
4. 传递给 stream 方法

## 工作原理

### 消息流程

```
用户输入新消息
    ↓
Chat 组件收集历史对话
    ↓
格式化为 [{ role: 'user', content: '...' }, { role: 'assistant', content: '...' }]
    ↓
传递给 useEditorAgentOptimized.stream()
    ↓
Hook 将历史消息添加到 initialMessages
    ↓
Agent 接收完整的对话上下文
    ↓
生成理解上下文的回复
```

### 示例对话

**第一轮**:
```typescript
User: "创建一个购物清单"
// initialMessages: [{ role: 'user', content: '创建一个购物清单' }]

AI: "好的，我已经创建了购物清单。请问要添加什么物品？"
```

**第二轮** (带历史):
```typescript
User: "添加苹果和香蕉"
// initialMessages: [
//   { role: 'user', content: '创建一个购物清单' },
//   { role: 'assistant', content: '好的，我已经创建了购物清单。请问要添加什么物品？' },
//   { role: 'user', content: '添加苹果和香蕉' }
// ]

AI: "已添加：
- 苹果
- 香蕉

还需要添加其他物品吗？"
// Agent 理解"添加"是指添加到之前创建的购物清单
```

**第三轮** (更长的上下文):
```typescript
User: "再加牛奶"
// initialMessages 包含完整的 3 轮对话历史

AI: "已添加牛奶到购物清单。当前清单：
1. 苹果
2. 香蕉  
3. 牛奶"
// Agent 记得之前所有的物品
```

## 数据结构

### Message 接口

```typescript
interface Message {
    id: string
    content: string
    sender: "user" | "ai"
    timestamp: number
    steps?: ExecutionStep[]
}
```

### Agent 消息格式

```typescript
type AgentMessage = {
    role: 'user' | 'assistant'
    content: string
}
```

## 性能考虑

### 1. 历史消息数量

当前实现会传递**所有历史消息**（除了初始欢迎消息）。对于很长的对话，可能需要限制：

```typescript
// 可选优化：只传递最近 N 轮对话
const HISTORY_LIMIT = 10  // 最多保留 10 轮对话

const historyMessages = messages
    .filter(msg => msg.id !== INITIAL_MESSAGE.id)
    .slice(-HISTORY_LIMIT * 2)  // 每轮包含 user + assistant 两条消息
    .map(msg => ({
        role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content
    }))
```

### 2. Token 消耗

历史消息会增加每次请求的 token 消耗：
- 无历史: ~100 tokens/请求
- 10 轮历史: ~1000-2000 tokens/请求
- 建议根据需要动态调整历史长度

## 特殊处理

### 1. 初始欢迎消息

初始欢迎消息不应包含在历史中，因为它不是用户对话的一部分：

```typescript
const INITIAL_MESSAGE: Message = {
    id: "initial-1",
    content: "Hello! I'm your AI assistant...",
    sender: "ai",
    timestamp: Date.now(),
}

// 在构建历史时过滤掉
const historyMessages = messages
    .filter(msg => msg.id !== INITIAL_MESSAGE.id)
    // ...
```

### 2. 清空聊天历史

当用户清空聊天时，历史会重置：

```typescript
const handleClearChat = useCallback(() => {
    setMessages([INITIAL_MESSAGE])  // 重置为只有初始消息
    setCurrentSteps([])
    stepsRef.current = []
}, [])
```

## 使用效果

### 启用前

```
User: 给文档添加标题 "我的笔记"
AI: 已添加标题

User: 再加一段介绍
AI: 好的，我会添加一段介绍。请问要添加什么内容？
     ❌ Agent 不记得标题是什么
```

### 启用后

```
User: 给文档添加标题 "我的笔记"
AI: 已添加标题 "我的笔记"

User: 再加一段介绍
AI: 好的，我会在 "我的笔记" 标题下添加介绍段落。
     ✅ Agent 记得之前的标题内容
```

## 兼容性

- ✅ **向后兼容**: `messages` 参数是可选的，不传则不影响现有功能
- ✅ **类型安全**: TypeScript 类型检查通过
- ✅ **无需修改其他代码**: 只修改了 `useEditorAgentOptimized` 和 `Chat.tsx`

## 扩展建议

### 1. 历史消息摘要

对于超长对话，可以实现智能摘要：

```typescript
// 伪代码
if (historyMessages.length > 20) {
    const summary = await summarizeHistory(historyMessages)
    historyMessages = [
        { role: 'assistant', content: `[对话摘要: ${summary}]` },
        ...historyMessages.slice(-10)  // 最近 10 条
    ]
}
```

### 2. 持久化历史

可以将历史保存到本地存储：

```typescript
// 保存
localStorage.setItem('chat-history', JSON.stringify(messages))

// 加载
const savedHistory = localStorage.getItem('chat-history')
if (savedHistory) {
    setMessages(JSON.parse(savedHistory))
}
```

### 3. 多会话管理

支持多个独立的对话会话：

```typescript
interface Session {
    id: string
    name: string
    messages: Message[]
}

const [sessions, setSessions] = useState<Session[]>([])
const [activeSession, setActiveSession] = useState<string>()
```

## 测试建议

### 手动测试场景

1. **基本上下文**:
   - 用户: "创建标题 Test"
   - 用户: "在下面添加段落"
   - 验证: AI 是否理解"下面"指的是标题 Test 下面

2. **多轮对话**:
   - 进行 5-10 轮对话
   - 验证: AI 是否能记住早期的信息

3. **清空历史**:
   - 清空聊天
   - 验证: 历史是否被重置

4. **错误处理**:
   - 中断生成
   - 验证: 历史是否正确保存

## 总结

✅ 完成的改动:
1. `useEditorAgentOptimized` 支持接收历史消息
2. Chat 组件在每次请求时传递完整历史
3. 过滤初始欢迎消息
4. 类型检查通过

✅ 效果:
- AI Agent 现在能够理解完整的对话上下文
- 提供更连贯、智能的回复
- 支持引用之前的对话内容
- 无需重复说明背景信息

✅ 兼容性:
- 向后兼容，不影响现有功能
- 可选参数，渐进式增强
- 类型安全
