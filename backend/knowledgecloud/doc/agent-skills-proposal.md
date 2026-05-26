# Agent-Skills 模块设计方案

> 基于 Spring AI + DeepSeek 构建的可扩展 Agent Skills 平台

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Frontend (ai-sdk)                               │
│                    (React/Vue + Vercel AI SDK integration)                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           knowledge-gateway                                  │
│                    (路由 & 认证 & 限流 & WebSocket支持)                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         knowledge-agent-skills                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │   Chat API       │  │  Skills Manager  │  │  Plugin Loader   │          │
│  │  (OpenAI兼容)    │  │   (技能管理)      │  │  (外部技能加载)   │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │  Agent Engine    │  │  Tool Registry   │  │  Skill Executor  │          │
│  │  (代理引擎)       │  │   (工具注册)      │  │   (技能执行器)    │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
├─────────────────────────────────────────────────────────────────────────────┤
│                          Spring AI + DeepSeek                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
            ┌────────────┐    ┌────────────┐    ┌────────────┐
            │  Built-in  │    │  External  │    │   Remote   │
            │   Skills   │    │   Skills   │    │   Skills   │
            │  (内置技能) │    │ (JAR插件)  │    │ (HTTP/gRPC)│
            └────────────┘    └────────────┘    └────────────┘
```

## 2. 模块结构

```
knowledge-service/
└── knowledge-agent-skills/
    ├── src/main/java/com/knowledge/agent/
    │   ├── AgentSkillsApplication.java          # 启动类
    │   ├── config/
    │   │   ├── DeepSeekConfig.java              # DeepSeek配置
    │   │   ├── SpringAiConfig.java              # Spring AI配置
    │   │   └── PluginConfig.java                # 插件系统配置
    │   ├── controller/
    │   │   ├── ChatController.java              # 聊天API (ai-sdk兼容)
    │   │   ├── SkillController.java             # 技能管理API
    │   │   └── PluginController.java            # 插件管理API
    │   ├── core/
    │   │   ├── engine/
    │   │   │   ├── AgentEngine.java             # Agent执行引擎
    │   │   │   ├── ToolCallHandler.java         # 工具调用处理
    │   │   │   └── ConversationManager.java     # 会话管理
    │   │   ├── skill/
    │   │   │   ├── Skill.java                   # 技能接口
    │   │   │   ├── SkillMetadata.java           # 技能元数据
    │   │   │   ├── SkillContext.java            # 技能执行上下文
    │   │   │   └── SkillResult.java             # 技能执行结果
    │   │   └── plugin/
    │   │       ├── PluginLoader.java            # 插件加载器
    │   │       ├── PluginRegistry.java          # 插件注册中心
    │   │       └── PluginClassLoader.java       # 插件类加载器
    │   ├── service/
    │   │   ├── ChatService.java                 # 聊天服务
    │   │   ├── SkillService.java                # 技能服务
    │   │   └── PluginService.java               # 插件服务
    │   ├── repository/
    │   │   ├── SkillRepository.java             # 技能持久化
    │   │   └── PluginRepository.java            # 插件持久化
    │   ├── entity/
    │   │   ├── SkillEntity.java                 # 技能实体
    │   │   ├── PluginEntity.java                # 插件实体
    │   │   └── ConversationEntity.java          # 会话实体
    │   └── skills/                              # 内置技能
    │       ├── WebSearchSkill.java              # 网页搜索
    │       ├── CodeExecutionSkill.java          # 代码执行
    │       ├── FileOperationSkill.java          # 文件操作
    │       └── DatabaseQuerySkill.java          # 数据库查询
    ├── src/main/resources/
    │   ├── application.yml
    │   └── plugins/                             # 外部插件目录
    └── pom.xml

knowledge-service-api/
└── knowledge-agent-api/
    ├── src/main/java/com/knowledge/agent/api/
    │   ├── dto/
    │   │   ├── ChatRequest.java                 # 聊天请求DTO
    │   │   ├── ChatResponse.java                # 聊天响应DTO
    │   │   ├── SkillDTO.java                    # 技能DTO
    │   │   └── PluginDTO.java                   # 插件DTO
    │   ├── feign/
    │   │   └── IAgentClient.java                # Feign客户端
    │   └── vo/
    │       └── SkillVO.java                     # 技能视图对象
    └── pom.xml
```

## 3. 核心接口设计

### 3.1 技能接口 (Skill Interface)

```java
/**
 * 技能接口 - 所有技能必须实现此接口
 */
public interface Skill {
    
    /**
     * 获取技能元数据
     */
    SkillMetadata getMetadata();
    
    /**
     * 执行技能
     * @param context 执行上下文
     * @param params 参数
     * @return 执行结果
     */
    SkillResult execute(SkillContext context, Map<String, Object> params);
    
    /**
     * 获取技能的JSON Schema定义 (用于LLM function calling)
     */
    default String getJsonSchema() {
        return JsonSchemaGenerator.generate(getMetadata());
    }
}

@Data
@Builder
public class SkillMetadata {
    private String id;                    // 唯一标识
    private String name;                  // 技能名称
    private String description;           // 技能描述
    private String version;               // 版本号
    private String author;                // 作者
    private SkillType type;               // 类型: BUILTIN, PLUGIN, REMOTE
    private List<SkillParameter> parameters;  // 参数定义
    private Map<String, String> config;   // 配置项
    private boolean enabled;              // 是否启用
}

@Data
public class SkillParameter {
    private String name;
    private String type;           // string, number, boolean, array, object
    private String description;
    private boolean required;
    private Object defaultValue;
    private Object schema;         // JSON Schema for complex types
}
```

### 3.2 插件加载器 (Plugin Loader)

```java
/**
 * 插件加载器 - 支持动态加载外部JAR技能包
 */
public interface PluginLoader {
    
    /**
     * 从JAR文件加载插件
     */
    PluginDescriptor loadFromJar(Path jarPath);
    
    /**
     * 从URL加载插件
     */
    PluginDescriptor loadFromUrl(URL url);
    
    /**
     * 卸载插件
     */
    void unload(String pluginId);
    
    /**
     * 获取已加载的插件列表
     */
    List<PluginDescriptor> getLoadedPlugins();
}

@Data
public class PluginDescriptor {
    private String id;
    private String name;
    private String version;
    private String author;
    private String description;
    private List<Skill> skills;           // 插件提供的技能列表
    private PluginStatus status;
    private LocalDateTime loadedAt;
}
```

### 3.3 远程技能支持 (Remote Skill)

```java
/**
 * 远程技能 - 通过HTTP/gRPC调用外部服务
 */
@Data
@Builder
public class RemoteSkillConfig {
    private String id;
    private String name;
    private String endpoint;              // HTTP endpoint or gRPC address
    private ProtocolType protocol;        // HTTP, GRPC
    private AuthConfig auth;              // 认证配置
    private int timeoutMs;                // 超时时间
    private RetryConfig retry;            // 重试配置
    private String requestTemplate;       // 请求模板
    private String responseMapping;       // 响应映射
}

/**
 * 远程技能适配器
 */
public class RemoteSkillAdapter implements Skill {
    private final RemoteSkillConfig config;
    private final WebClient webClient;
    
    @Override
    public SkillResult execute(SkillContext context, Map<String, Object> params) {
        // 根据配置调用远程服务
    }
}
```

## 4. API 设计 (ai-sdk 兼容)

### 4.1 聊天接口 (OpenAI兼容格式)

```yaml
# POST /api/v1/chat/completions
# 兼容 OpenAI Chat Completions API 格式，便于 ai-sdk 直接集成

Request:
  model: "deepseek-chat"
  messages:
    - role: "system"
      content: "You are a helpful assistant with access to various skills."
    - role: "user"
      content: "Search for the latest news about AI"
  stream: true
  tools:                          # 可选：指定可用技能
    - web_search
    - code_execution
  tool_choice: "auto"             # auto, none, or specific tool

Response (Streaming):
  # SSE 格式，兼容 ai-sdk useChat hook
  data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"..."}}]}
  
  # 工具调用时
  data: {"choices":[{"delta":{"tool_calls":[{"function":{"name":"web_search","arguments":"{...}"}}]}}]}
```

### 4.2 技能管理接口

```yaml
# 获取技能列表
GET /api/v1/skills
Response:
  - id: "web_search"
    name: "Web Search"
    description: "Search the web for information"
    type: "BUILTIN"
    enabled: true
    parameters: [...]

# 获取技能详情
GET /api/v1/skills/{skillId}

# 启用/禁用技能
PATCH /api/v1/skills/{skillId}/status
Request: { "enabled": true }

# 配置技能
PUT /api/v1/skills/{skillId}/config
Request: { "apiKey": "xxx", "maxResults": 10 }
```

### 4.3 插件管理接口

```yaml
# 上传插件
POST /api/v1/plugins/upload
Content-Type: multipart/form-data
Body: file (JAR file)

# 从URL安装插件
POST /api/v1/plugins/install
Request: { "url": "https://example.com/plugin.jar" }

# 获取插件列表
GET /api/v1/plugins

# 卸载插件
DELETE /api/v1/plugins/{pluginId}

# 重新加载插件
POST /api/v1/plugins/{pluginId}/reload

# 注册远程技能
POST /api/v1/skills/remote
Request:
  name: "custom_api"
  endpoint: "https://api.example.com/execute"
  protocol: "HTTP"
  auth: { "type": "bearer", "token": "xxx" }
  parameters: [...]
```

## 5. 前端集成 (ai-sdk)

### 5.1 React 集成示例

```typescript
import { useChat } from 'ai/react';

function ChatComponent() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/v1/chat/completions',
    // 指定可用技能
    body: {
      tools: ['web_search', 'code_execution'],
      tool_choice: 'auto'
    },
    // 处理工具调用
    onToolCall: async ({ toolCall }) => {
      console.log('Tool called:', toolCall.name, toolCall.args);
      // 可以在这里添加UI反馈
    }
  });

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>
          {m.role}: {m.content}
          {m.toolInvocations?.map(tool => (
            <ToolCallUI key={tool.id} tool={tool} />
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

### 5.2 Vue 集成示例

```typescript
import { useChat } from '@ai-sdk/vue';

const { messages, input, handleSubmit, isLoading } = useChat({
  api: '/api/v1/chat/completions',
  body: {
    tools: ['web_search', 'code_execution']
  }
});
```

## 6. 渐进式技能发现 (Progressive Skills Discovery)

### 6.1 设计理念

渐进式技能发现允许 Agent 根据对话上下文**动态发现和加载**相关技能，而非一次性暴露所有技能给 LLM。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Progressive Skills Discovery                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   User Query ──▶ Intent Analyzer ──▶ Skill Recommender ──▶ Dynamic Tools   │
│                        │                    │                               │
│                        ▼                    ▼                               │
│               ┌─────────────┐      ┌─────────────────┐                     │
│               │  Skill      │      │  Relevance      │                     │
│               │  Taxonomy   │      │  Scoring        │                     │
│               │  (分类树)    │      │  (相关性评分)   │                     │
│               └─────────────┘      └─────────────────┘                     │
│                                                                             │
│   Level 1: Core Skills (Always Available)                                   │
│   Level 2: Domain Skills (Context Triggered)                                │
│   Level 3: Advanced Skills (On-Demand Discovery)                            │
│   Level 4: Custom Skills (User Requested)                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 技能分层模型

```java
/**
 * 技能层级定义
 */
public enum SkillTier {
    CORE(1, "核心技能", true),        // 始终可用: 搜索、计算等
    DOMAIN(2, "领域技能", false),     // 按领域激活: 代码、文档、数据分析
    ADVANCED(3, "高级技能", false),   // 按需发现: 复杂工作流
    CUSTOM(4, "自定义技能", false);   // 用户显式请求
    
    private final int level;
    private final String description;
    private final boolean alwaysAvailable;
}

/**
 * 技能分类树
 */
@Data
public class SkillTaxonomy {
    private String category;          // 分类: coding, research, data, creative
    private List<String> keywords;    // 触发关键词
    private List<String> skillIds;    // 关联技能
    private double activationThreshold; // 激活阈值
}
```

### 6.3 意图分析与技能推荐

```java
/**
 * 意图分析器 - 分析用户意图并推荐相关技能
 */
public interface IntentAnalyzer {
    
    /**
     * 分析用户输入，返回意图和推荐技能
     */
    IntentAnalysisResult analyze(String userInput, ConversationContext context);
}

@Data
@Builder
public class IntentAnalysisResult {
    private String primaryIntent;           // 主要意图
    private List<String> categories;        // 相关分类
    private List<SkillRecommendation> recommendedSkills;  // 推荐技能
    private double confidence;              // 置信度
}

@Data
@Builder
public class SkillRecommendation {
    private String skillId;
    private String skillName;
    private double relevanceScore;          // 相关性评分 0-1
    private String reason;                  // 推荐理由
    private SkillTier tier;                 // 技能层级
}

/**
 * 技能推荐器
 */
@Service
public class SkillRecommender {
    
    /**
     * 基于意图分析结果，返回应暴露给LLM的技能列表
     * 实现渐进式发现：先返回高相关性技能，低相关性技能按需加载
     */
    public List<Skill> getRelevantSkills(IntentAnalysisResult intent, 
                                          DiscoveryConfig config) {
        return skillRegistry.getAllSkills().stream()
            .filter(s -> s.getTier() == SkillTier.CORE || 
                        matchesIntent(s, intent))
            .sorted(Comparator.comparingDouble(
                s -> -calculateRelevance(s, intent)))
            .limit(config.getMaxToolsPerRequest())
            .collect(Collectors.toList());
    }
}
```

### 6.4 动态技能注入

```java
/**
 * 动态技能注入器 - 在对话过程中动态调整可用技能
 */
@Service
public class DynamicSkillInjector {
    
    /**
     * 根据对话上下文动态调整技能列表
     * 支持:
     * 1. 自动发现 - 基于用户输入自动推荐新技能
     * 2. 链式发现 - 执行技能A后自动推荐相关技能B
     * 3. 用户触发 - 用户说"我需要xxx功能"时主动发现
     */
    public SkillAdjustment adjustSkills(ConversationContext context,
                                         List<Skill> currentSkills,
                                         Message latestMessage) {
        // 1. 分析最新消息
        IntentAnalysisResult intent = intentAnalyzer.analyze(
            latestMessage.getContent(), context);
        
        // 2. 检查是否需要新技能
        List<Skill> newSkills = discoverNewSkills(intent, currentSkills);
        
        // 3. 检查是否有技能可以移除（降低token消耗）
        List<Skill> deprecatedSkills = findUnusedSkills(context, currentSkills);
        
        return SkillAdjustment.builder()
            .toAdd(newSkills)
            .toRemove(deprecatedSkills)
            .reason(generateAdjustmentReason(newSkills, deprecatedSkills))
            .build();
    }
    
    /**
     * 技能链发现 - 执行技能后推荐后续技能
     */
    public List<SkillRecommendation> discoverNextSkills(SkillExecutionResult result) {
        // 例如: 执行 web_search 后，推荐 summarize, translate 等技能
        return skillChainConfig.getNextSkills(result.getSkillId())
            .stream()
            .map(this::toRecommendation)
            .collect(Collectors.toList());
    }
}
```

### 6.5 API 支持

```yaml
# 模式1: 后端自主决定技能 (默认)
POST /api/v1/chat/completions
Request:
  model: "deepseek-chat"
  messages: [...]
  # 无需前端指定 tools，后端自动发现并注入

Response (Streaming):
  data: {"choices":[{"delta":{"content":"..."}}]}
  data: {"choices":[{"delta":{"tool_calls":[{"function":{"name":"web_search"}}]}}]}

---

# 模式2: 前端指定工具调用 (Frontend Tool Call)
POST /api/v1/chat/completions
Request:
  model: "deepseek-chat"
  messages: [...]
  tools:                            # 前端显式指定可用工具
    - type: "function"
      function:
        name: "web_search"
        description: "Search the web"
        parameters: {...}
  tool_choice: "auto"               # auto | none | {"type":"function","function":{"name":"xxx"}}

---

# 模式3: 前端直接调用工具 (Direct Tool Invocation)
POST /api/v1/tools/{toolId}/invoke
Request:
  parameters:
    query: "搜索内容"
  context:                          # 可选: 会话上下文
    conversationId: "conv-123"

Response:
  toolCallId: "call-xxx"
  result:
    content: "..."
    metadata: {...}

---

# 获取可用工具列表 (供前端展示)
GET /api/v1/tools
Response:
  tools:
    - id: "web_search"
      name: "Web Search"
      description: "Search the web for information"
      parameters: {...}
      category: "research"
    - id: "code_execution"
      name: "Code Execution"
      ...
```

### 6.6 前端集成 (ai-sdk Model Provider)

#### 6.6.1 自定义 Model Provider

```typescript
// providers/agent-skills.ts
import { createOpenAI } from '@ai-sdk/openai';

/**
 * 创建 Agent-Skills Model Provider
 * 完全兼容 ai-sdk 的 provider 模式
 */
export function createAgentSkills(options?: {
  baseURL?: string;
  apiKey?: string;
  headers?: Record<string, string>;
}) {
  return createOpenAI({
    baseURL: options?.baseURL ?? '/api/v1',
    apiKey: options?.apiKey ?? 'agent-skills',  // 或使用实际 token
    headers: {
      ...options?.headers,
    },
    compatibility: 'compatible',  // OpenAI 兼容模式
  });
}

// 预定义模型
export const agentSkills = createAgentSkills();
export const agentSkillsChat = agentSkills('deepseek-chat');
export const agentSkillsReasoner = agentSkills('deepseek-reasoner');
```

#### 6.6.2 使用 Model Provider

```typescript
import { useChat, useCompletion } from 'ai/react';
import { generateText, streamText } from 'ai';
import { agentSkills, agentSkillsChat } from '@/providers/agent-skills';

/**
 * 方式1: useChat Hook (Streaming)
 */
function ChatComponent() {
  const { messages, input, handleSubmit } = useChat({
    api: '/api/v1/chat/completions',
    // ai-sdk 自动处理 streaming
  });
  return <ChatUI messages={messages} />;
}

/**
 * 方式2: 使用自定义 Provider + generateText
 */
async function generateWithProvider() {
  const result = await generateText({
    model: agentSkillsChat,
    prompt: 'Explain quantum computing',
  });
  return result.text;
}

/**
 * 方式3: 使用自定义 Provider + streamText
 */
async function streamWithProvider() {
  const result = await streamText({
    model: agentSkillsChat,
    prompt: 'Write a poem about AI',
  });
  
  for await (const chunk of result.textStream) {
    console.log(chunk);
  }
}

/**
 * 方式4: 带工具调用的 generateText
 */
async function generateWithTools() {
  const result = await generateText({
    model: agentSkillsChat,
    prompt: 'Search for latest AI news and summarize',
    tools: {
      webSearch: {
        description: 'Search the web',
        parameters: z.object({
          query: z.string().describe('Search query'),
        }),
        execute: async ({ query }) => {
          // 调用后端工具 API
          const res = await fetch('/api/v1/tools/web_search/invoke', {
            method: 'POST',
            body: JSON.stringify({ parameters: { query } }),
          });
          return res.json();
        },
      },
    },
  });
  return result;
}
```

#### 6.6.3 后端 API 兼容性 (OpenAI Format)

```yaml
# 后端必须实现以下 OpenAI 兼容端点:

# Chat Completions (Streaming & Non-Streaming)
POST /api/v1/chat/completions
Headers:
  Authorization: Bearer {api_key}
  Content-Type: application/json
Request:
  model: "deepseek-chat"
  messages: [{role: "user", content: "..."}]
  stream: true | false
  tools: [...]           # 可选
  tool_choice: "auto"    # 可选
  temperature: 0.7       # 可选
  max_tokens: 4096       # 可选

Response (Non-Streaming):
  id: "chatcmpl-xxx"
  object: "chat.completion"
  model: "deepseek-chat"
  choices:
    - index: 0
      message:
        role: "assistant"
        content: "..."
        tool_calls: [...]  # 如果有工具调用
      finish_reason: "stop" | "tool_calls"
  usage:
    prompt_tokens: 10
    completion_tokens: 20
    total_tokens: 30

Response (Streaming - SSE):
  data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}
  data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":" world"}}]}
  data: [DONE]

# Models List (可选 - 用于 Provider 发现)
GET /api/v1/models
Response:
  object: "list"
  data:
    - id: "deepseek-chat"
      object: "model"
      owned_by: "agent-skills"
    - id: "deepseek-reasoner"
      object: "model"
      owned_by: "agent-skills"
```

#### 6.6.4 完整前端示例

```typescript
// app/chat/page.tsx
'use client';

import { useChat } from 'ai/react';
import { useState } from 'react';

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/v1/chat/completions',
  });

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((m) => (
          <div key={m.id} className={`message ${m.role}`}>
            <div className="content">{m.content}</div>
            {/* 展示工具调用 */}
            {m.toolInvocations?.map((tool) => (
              <div key={tool.toolCallId} className="tool-call">
                <span>🔧 {tool.toolName}</span>
                {tool.state === 'result' && (
                  <pre>{JSON.stringify(tool.result, null, 2)}</pre>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      
      <form onSubmit={handleSubmit} className="input-form">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask me anything..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Thinking...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
```

#### 6.6.5 Vue 集成

```typescript
// composables/useAgentChat.ts
import { useChat } from '@ai-sdk/vue';

export function useAgentChat() {
  return useChat({
    api: '/api/v1/chat/completions',
  });
}

// components/Chat.vue
<script setup lang="ts">
import { useAgentChat } from '@/composables/useAgentChat';

const { messages, input, handleSubmit, isLoading } = useAgentChat();
</script>

<template>
  <div class="chat">
    <div v-for="m in messages" :key="m.id" :class="m.role">
      {{ m.content }}
    </div>
    <form @submit="handleSubmit">
      <input v-model="input" :disabled="isLoading" />
      <button type="submit">Send</button>
    </form>
  </div>
</template>
```

### 6.7 配置项

```yaml
agent:
  discovery:
    enabled: true
    # 后端完全自主模式 - 无需用户确认
    autonomous: true
    intent-analyzer:
      type: llm                     # llm | keyword | hybrid
      model: deepseek-chat
    skill-selection:
      max-per-turn: 5               # 每轮最多注入技能数
      relevance-threshold: 0.5      # 相关性阈值
      auto-activate: true           # 超过阈值自动激活
    skill-tiers:
      core:                         # 核心技能（始终可用）
        - web_search
        - calculator
      domain-triggers:              # 领域技能触发规则
        coding:
          keywords: ["代码", "编程", "bug", "函数"]
          skills: ["code_execution", "code_review"]
        data:
          keywords: ["数据", "分析", "统计", "图表"]
          skills: ["data_analysis", "chart_generation"]
    skill-chains:                   # 技能链配置
      web_search: ["summarize", "translate"]
      data_analysis: ["chart_generation", "export_report"]
```

## 7. Python Skills 沙箱执行

### 7.1 架构设计

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Python Skills Sandbox                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Agent Engine                                                      │
│        │                                                            │
│        ▼                                                            │
│   ┌─────────────────┐                                               │
│   │ Python Skill   │                                               │
│   │   Executor     │                                               │
│   └────────┬────────┘                                               │
│            │                                                        │
│            ▼                                                        │
│   ┌─────────────────────────────────────────────────────────┐      │
│   │                      Sandbox Manager                      │      │
│   ├──────────────────┬───────────────────┬──────────────────┤      │
│   │   Docker         │   Subprocess      │    WebAssembly   │      │
│   │   Sandbox        │   Sandbox         │    Sandbox       │      │
│   │   (高隔离)       │   (轻量级)        │    (浏览器)      │      │
│   └──────────────────┴───────────────────┴──────────────────┘      │
│                                                                     │
│   安全策略:                                                          │
│   • 资源限制: CPU, Memory, Disk, Network                            │
│   • 时间限制: 执行超时自动终止                                      │
│   • 权限限制: 禁止系统调用, 文件访问白名单                          │
│   • 网络限制: 可配置网络访问白名单                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 沙箱类型

| 沙箱类型 | 隔离级别 | 启动速度 | 适用场景 |
|---------|---------|---------|----------|
| **Docker** | 高 (容器级) | 慢 (~1s) | 不可信代码、外部插件 |
| **Subprocess** | 中 (进程级) | 快 (~100ms) | 内置技能、简单脚本 |
| **WASM** | 中 (内存级) | 极快 (~10ms) | 前端执行、轻量计算 |

### 7.3 核心接口

```java
/**
 * Python 沙箱执行器接口
 */
public interface PythonSandbox {
    
    /**
     * 执行 Python 代码
     */
    SandboxResult execute(PythonExecutionRequest request);
    
    /**
     * 执行 Python 技能文件
     */
    SandboxResult executeSkill(String skillPath, Map<String, Object> params);
    
    /**
     * 安装依赖包
     */
    void installDependencies(List<String> packages);
}

@Data
@Builder
public class PythonExecutionRequest {
    private String code;                    // Python 代码
    private String entryFunction;           // 入口函数名
    private Map<String, Object> params;     // 参数
    private SandboxConfig config;           // 沙箱配置
}

@Data
@Builder
public class SandboxConfig {
    private SandboxType type;               // DOCKER, SUBPROCESS, WASM
    private int timeoutSeconds;             // 超时时间 (默认 30s)
    private int maxMemoryMB;                // 最大内存 (默认 256MB)
    private int maxCpuPercent;              // CPU 限制 (默认 50%)
    private boolean networkEnabled;         // 是否允许网络 (默认 false)
    private List<String> allowedModules;    // 允许的 Python 模块
    private Map<String, String> envVars;    // 环境变量
}

@Data
@Builder
public class SandboxResult {
    private boolean success;
    private Object output;                  // 返回值
    private String stdout;                  // 标准输出
    private String stderr;                  // 错误输出
    private String error;                   // 异常信息
    private long executionTimeMs;           // 执行时间
    private ResourceUsage resourceUsage;    // 资源使用
}
```

### 7.4 Docker 沙箱实现

```java
@Service
@Slf4j
public class DockerPythonSandbox implements PythonSandbox {
    
    private final DockerClient dockerClient;
    
    @Override
    public SandboxResult execute(PythonExecutionRequest request) {
        String containerId = null;
        try {
            // 1. 创建容器
            containerId = createContainer(request.getConfig());
            
            // 2. 复制代码到容器
            copyCodeToContainer(containerId, request.getCode());
            
            // 3. 执行代码
            ExecResult result = executeInContainer(containerId, request);
            
            // 4. 解析结果
            return parseResult(result);
            
        } finally {
            // 5. 清理容器
            if (containerId != null) {
                cleanupContainer(containerId);
            }
        }
    }
    
    private String createContainer(SandboxConfig config) {
        CreateContainerResponse container = dockerClient.createContainerCmd("python:3.11-slim")
            .withHostConfig(HostConfig.newHostConfig()
                .withMemory(config.getMaxMemoryMB() * 1024 * 1024L)
                .withCpuPercent((long) config.getMaxCpuPercent())
                .withNetworkMode(config.isNetworkEnabled() ? "bridge" : "none")
                .withReadonlyRootfs(true)
            )
            .withCmd("sleep", "infinity")
            .exec();
        
        dockerClient.startContainerCmd(container.getId()).exec();
        return container.getId();
    }
}
```

### 7.5 Python Skill 开发规范

```python
# skills/web_scraper.py
"""
Python Skill: Web Scraper
支持在沙箱中安全执行
"""

from typing import Dict, Any
import json

# Skill 元数据 (必须)
def get_metadata() -> Dict[str, Any]:
    return {
        "id": "web_scraper",
        "name": "Web Scraper",
        "description": "Scrape content from web pages",
        "version": "1.0.0",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to scrape"
                },
                "selector": {
                    "type": "string",
                    "description": "CSS selector (optional)"
                }
            },
            "required": ["url"]
        },
        "sandbox": {
            "type": "docker",              # 需要 Docker 沙箱
            "network": True,               # 需要网络访问
            "timeout": 60,                 # 60秒超时
            "dependencies": ["requests", "beautifulsoup4"]  # 依赖包
        }
    }

# Skill 入口函数 (必须)
def execute(params: Dict[str, Any]) -> Dict[str, Any]:
    import requests
    from bs4 import BeautifulSoup
    
    url = params["url"]
    selector = params.get("selector")
    
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    
    soup = BeautifulSoup(response.text, 'html.parser')
    
    if selector:
        elements = soup.select(selector)
        content = [el.get_text(strip=True) for el in elements]
    else:
        content = soup.get_text(strip=True)
    
    return {
        "success": True,
        "content": content,
        "url": url,
        "status_code": response.status_code
    }

# 用于本地测试
if __name__ == "__main__":
    result = execute({"url": "https://example.com"})
    print(json.dumps(result, indent=2))
```

### 7.6 数据分析 Skill 示例

```python
# skills/data_analyzer.py
"""
Python Skill: Data Analyzer
支持 pandas 数据分析
"""

def get_metadata():
    return {
        "id": "data_analyzer",
        "name": "Data Analyzer",
        "description": "Analyze data with pandas",
        "version": "1.0.0",
        "parameters": {
            "type": "object",
            "properties": {
                "data": {
                    "type": "array",
                    "description": "Data to analyze (list of dicts)"
                },
                "operation": {
                    "type": "string",
                    "enum": ["describe", "correlation", "groupby", "custom"],
                    "description": "Analysis operation"
                },
                "code": {
                    "type": "string",
                    "description": "Custom pandas code (for operation=custom)"
                }
            },
            "required": ["data", "operation"]
        },
        "sandbox": {
            "type": "subprocess",          # 较快的进程级沙箱
            "timeout": 30,
            "dependencies": ["pandas", "numpy"]
        }
    }

def execute(params):
    import pandas as pd
    import numpy as np
    
    df = pd.DataFrame(params["data"])
    operation = params["operation"]
    
    if operation == "describe":
        result = df.describe().to_dict()
    elif operation == "correlation":
        result = df.corr().to_dict()
    elif operation == "groupby":
        group_col = params.get("group_by", df.columns[0])
        result = df.groupby(group_col).agg(['mean', 'sum', 'count']).to_dict()
    elif operation == "custom":
        # 安全执行自定义代码 (只允许 pandas/numpy)
        local_vars = {"df": df, "pd": pd, "np": np}
        exec(params["code"], {"__builtins__": {}}, local_vars)
        result = local_vars.get("result", df.to_dict())
    
    return {"success": True, "result": result}
```

### 7.7 API 支持

```yaml
# 上传 Python Skill
POST /api/v1/skills/python/upload
Content-Type: multipart/form-data
Body:
  file: skill.py
  # 或者
  code: "def get_metadata(): ..."

Response:
  skillId: "web_scraper"
  name: "Web Scraper"
  status: "LOADED"
  sandboxType: "docker"

# 执行 Python Skill
POST /api/v1/skills/python/{skillId}/execute
Request:
  params:
    url: "https://example.com"
  sandboxOverride:              # 可选: 覆盖默认沙箱配置
    timeoutSeconds: 60
    networkEnabled: true

Response:
  success: true
  output:
    content: "..."
  executionTimeMs: 1234
  resourceUsage:
    memoryMB: 45
    cpuPercent: 12
```

### 7.8 配置

```yaml
agent:
  python-sandbox:
    enabled: true
    default-type: subprocess          # 默认沙箱类型
    docker:
      image: "python:3.11-slim"
      pool-size: 5                    # 预创建容器数
      max-containers: 20              # 最大容器数
    limits:
      timeout-seconds: 30             # 默认超时
      max-memory-mb: 256              # 默认内存限制
      max-cpu-percent: 50             # CPU 限制
      network-enabled: false          # 默认禁用网络
    allowed-modules:                  # 允许的模块白名单
      - json
      - math
      - datetime
      - pandas
      - numpy
      - requests
    blocked-modules:                  # 禁止的模块黑名单
      - os
      - sys
      - subprocess
      - shutil
```

## 8. 技术选型

| 组件 | 技术方案 | 说明 |
|------|---------|------|
| LLM集成 | Spring AI 1.0 | 官方框架，支持多模型 |
| AI模型 | DeepSeek API | 成本效益高，支持 function calling |
| 流式响应 | SSE (Server-Sent Events) | ai-sdk 原生支持 |
| 插件系统 | Java SPI + URLClassLoader | 动态加载JAR |
| 远程调用 | WebClient (Reactive) | 非阻塞HTTP调用 |
| 持久化 | MyBatis Plus | 与现有项目一致 |
| 缓存 | Redis | 技能配置、会话缓存 |
| 配置中心 | Nacos | 与现有项目一致 |

## 9. 数据库设计

```sql
-- 技能表
CREATE TABLE agent_skill (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    skill_id VARCHAR(64) NOT NULL UNIQUE COMMENT '技能标识',
    name VARCHAR(128) NOT NULL COMMENT '技能名称',
    description TEXT COMMENT '技能描述',
    type VARCHAR(32) NOT NULL COMMENT '类型: BUILTIN, PLUGIN, REMOTE',
    version VARCHAR(32) COMMENT '版本号',
    author VARCHAR(64) COMMENT '作者',
    parameters JSON COMMENT '参数定义',
    config JSON COMMENT '配置项',
    enabled TINYINT(1) DEFAULT 1 COMMENT '是否启用',
    sort INT DEFAULT 0 COMMENT '排序',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT(1) DEFAULT 0
);

-- 插件表
CREATE TABLE agent_plugin (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    plugin_id VARCHAR(64) NOT NULL UNIQUE COMMENT '插件标识',
    name VARCHAR(128) NOT NULL COMMENT '插件名称',
    description TEXT COMMENT '插件描述',
    version VARCHAR(32) COMMENT '版本号',
    author VARCHAR(64) COMMENT '作者',
    jar_path VARCHAR(512) COMMENT 'JAR文件路径',
    source_url VARCHAR(512) COMMENT '来源URL',
    status VARCHAR(32) DEFAULT 'LOADED' COMMENT '状态: LOADED, DISABLED, ERROR',
    skill_count INT DEFAULT 0 COMMENT '技能数量',
    load_time DATETIME COMMENT '加载时间',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT(1) DEFAULT 0
);

-- 远程技能配置表
CREATE TABLE agent_remote_skill (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    skill_id VARCHAR(64) NOT NULL UNIQUE COMMENT '技能标识',
    endpoint VARCHAR(512) NOT NULL COMMENT '服务端点',
    protocol VARCHAR(32) DEFAULT 'HTTP' COMMENT '协议: HTTP, GRPC',
    auth_type VARCHAR(32) COMMENT '认证类型',
    auth_config JSON COMMENT '认证配置',
    timeout_ms INT DEFAULT 30000 COMMENT '超时时间(ms)',
    retry_count INT DEFAULT 3 COMMENT '重试次数',
    request_template TEXT COMMENT '请求模板',
    response_mapping TEXT COMMENT '响应映射',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT(1) DEFAULT 0
);

-- 会话表
CREATE TABLE agent_conversation (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    conversation_id VARCHAR(64) NOT NULL UNIQUE COMMENT '会话标识',
    user_id BIGINT COMMENT '用户ID',
    title VARCHAR(256) COMMENT '会话标题',
    model VARCHAR(64) COMMENT '使用的模型',
    total_tokens INT DEFAULT 0 COMMENT '总token数',
    message_count INT DEFAULT 0 COMMENT '消息数量',
    last_message_time DATETIME COMMENT '最后消息时间',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT(1) DEFAULT 0
);

-- 消息表
CREATE TABLE agent_message (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    message_id VARCHAR(64) NOT NULL UNIQUE COMMENT '消息标识',
    conversation_id VARCHAR(64) NOT NULL COMMENT '会话标识',
    role VARCHAR(32) NOT NULL COMMENT '角色: user, assistant, system, tool',
    content TEXT COMMENT '消息内容',
    tool_calls JSON COMMENT '工具调用信息',
    tool_call_id VARCHAR(64) COMMENT '工具调用ID',
    tokens INT DEFAULT 0 COMMENT 'token数',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_conversation (conversation_id)
);
```

## 10. 外部技能开发规范

### 8.1 插件项目结构

```
my-custom-skill/
├── src/main/java/
│   └── com/example/skill/
│       ├── MyCustomSkill.java        # 实现 Skill 接口
│       └── SkillPlugin.java          # 插件入口
├── src/main/resources/
│   └── META-INF/services/
│       └── com.knowledge.agent.core.skill.Skill  # SPI配置
└── pom.xml
```

### 8.2 技能实现示例

```java
package com.example.skill;

import com.knowledge.agent.core.skill.*;

public class MyCustomSkill implements Skill {
    
    @Override
    public SkillMetadata getMetadata() {
        return SkillMetadata.builder()
            .id("my_custom_skill")
            .name("My Custom Skill")
            .description("A custom skill that does something useful")
            .version("1.0.0")
            .author("Your Name")
            .type(SkillType.PLUGIN)
            .parameters(List.of(
                SkillParameter.builder()
                    .name("input")
                    .type("string")
                    .description("The input to process")
                    .required(true)
                    .build()
            ))
            .build();
    }
    
    @Override
    public SkillResult execute(SkillContext context, Map<String, Object> params) {
        String input = (String) params.get("input");
        // 执行技能逻辑
        String result = processInput(input);
        
        return SkillResult.success(result);
    }
}
```

### 8.3 插件POM配置

```xml
<project>
    <groupId>com.example</groupId>
    <artifactId>my-custom-skill</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>
    
    <dependencies>
        <!-- 技能API依赖 (provided scope) -->
        <dependency>
            <groupId>com.knowledge</groupId>
            <artifactId>knowledge-agent-api</artifactId>
            <version>3.4.1</version>
            <scope>provided</scope>
        </dependency>
    </dependencies>
    
    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-shade-plugin</artifactId>
                <version>3.5.0</version>
                <executions>
                    <execution>
                        <phase>package</phase>
                        <goals>
                            <goal>shade</goal>
                        </goals>
                    </execution>
                </executions>
            </plugin>
        </plugins>
    </build>
</project>
```

## 11. 部署架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Load Balancer                            │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│ Agent Skills  │       │ Agent Skills  │       │ Agent Skills  │
│  Instance 1   │       │  Instance 2   │       │  Instance 3   │
└───────────────┘       └───────────────┘       └───────────────┘
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│     Nacos     │       │     Redis     │       │     MySQL     │
│  (配置中心)    │       │    (缓存)      │       │   (持久化)    │
└───────────────┘       └───────────────┘       └───────────────┘
```

## 12. 关键依赖

```xml
<!-- pom.xml 关键依赖 -->
<dependencies>
    <!-- Spring AI -->
    <dependency>
        <groupId>org.springframework.ai</groupId>
        <artifactId>spring-ai-openai-spring-boot-starter</artifactId>
        <version>1.0.0-M4</version>
    </dependency>
    
    <!-- WebFlux for SSE -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-webflux</artifactId>
    </dependency>
    
    <!-- 项目核心依赖 -->
    <dependency>
        <groupId>com.knowledge</groupId>
        <artifactId>knowledge-core-boot</artifactId>
        <version>${knowledge.tool.version}</version>
    </dependency>
</dependencies>
```

## 13. 配置示例

```yaml
# application.yml
spring:
  ai:
    openai:
      api-key: ${DEEPSEEK_API_KEY}
      base-url: https://api.deepseek.com
      chat:
        options:
          model: deepseek-chat
          temperature: 0.7

agent:
  skills:
    plugin-dir: ${user.dir}/plugins
    auto-load: true
    builtin:
      web-search:
        enabled: true
        api-key: ${SEARCH_API_KEY}
      code-execution:
        enabled: true
        timeout-ms: 30000
        sandbox: true
```

## 14. 实施计划

| 阶段 | 内容 | 周期 |
|------|------|------|
| Phase 1 | 基础框架搭建、Spring AI集成、DeepSeek对接 | 1周 |
| Phase 2 | 核心技能接口、内置技能实现、Chat API | 1周 |
| Phase 3 | 插件系统实现、外部JAR加载 | 1周 |
| Phase 4 | 渐进式技能发现、意图分析器、技能推荐器 | 1周 |
| Phase 5 | **Python 沙箱执行、Docker/Subprocess 集成** | 1周 |
| Phase 6 | 远程技能支持、技能管理API | 0.5周 |
| Phase 7 | 前端集成示例、文档完善 | 0.5周 |

## 15. 参考资料

- [Spring AI Documentation](https://docs.spring.io/spring-ai/reference/)
- [DeepSeek API Documentation](https://platform.deepseek.com/api-docs/)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
