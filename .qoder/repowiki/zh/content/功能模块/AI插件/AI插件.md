# AI插件

<cite>
**本文引用的文件**
- [packages/plugin-ai/src/index.tsx](file://packages/plugin-ai/src/index.tsx)
- [packages/plugin-ai/src/ai/index.tsx](file://packages/plugin-ai/src/ai/index.tsx)
- [packages/plugin-ai/src/ai/ai.ts](file://packages/plugin-ai/src/ai/ai.ts)
- [packages/plugin-ai/src/ai/ai-image.ts](file://packages/plugin-ai/src/ai/ai-image.ts)
- [packages/plugin-ai/src/ai/AiView.tsx](file://packages/plugin-ai/src/ai/AiView.tsx)
- [packages/plugin-ai/src/ai/AiImageView.tsx](file://packages/plugin-ai/src/ai/AiImageView.tsx)
- [packages/plugin-ai/src/ai/utils.ts](file://packages/plugin-ai/src/ai/utils.ts)
- [packages/plugin-ai/src/ai/text-loading.tsx](file://packages/plugin-ai/src/ai/text-loading.tsx)
- [packages/plugin-ai/src/ai/marks/loading-mark.tsx](file://packages/plugin-ai/src/ai/marks/loading-mark.tsx)
- [packages/plugin-ai/src/ai/menu/AiStaticMenu.tsx](file://packages/plugin-ai/src/ai/menu/AiStaticMenu.tsx)
- [packages/plugin-ai/src/ai/menu/Chat.tsx](file://packages/plugin-ai/src/ai/menu/Chat.tsx)
- [packages/plugin-ai/src/ai/menu/MessageBubble.tsx](file://packages/plugin-ai/src/ai/menu/MessageBubble.tsx)
- [packages/plugin-ai/src/ai/menu/chat-types.ts](file://packages/plugin-ai/src/ai/menu/chat-types.ts)
- [packages/plugin-ai/src/ai/menu/use-streaming-buffer.ts](file://packages/plugin-ai/src/ai/menu/use-streaming-buffer.ts)
- [packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx](file://packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx)
- [packages/plugin-ai/src/ai/menu/ErrorDisplay.tsx](file://packages/plugin-ai/src/ai/menu/ErrorDisplay.tsx)
- [packages/plugin-ai/src/ai/menu/QuickPrompts.tsx](file://packages/plugin-ai/src/ai/menu/QuickPrompts.tsx)
- [packages/plugin-ai/src/ai/menu/TeamStatusPanel.tsx](file://packages/plugin-ai/src/ai/menu/TeamStatusPanel.tsx)
- [packages/plugin-ai/src/ai/menu/chat-persistence.ts](file://packages/plugin-ai/src/ai/menu/chat-persistence.ts)
- [packages/plugin-ai/src/ai/menu/useSessionManager.ts](file://packages/plugin-ai/src/ai/menu/useSessionManager.ts)
- [packages/plugin-ai/src/ai/menu/useTeamStatus.ts](file://packages/plugin-ai/src/ai/menu/useTeamStatus.ts)
- [packages/plugin-ai/src/ai/AISettings.tsx](file://packages/plugin-ai/src/ai/AISettings.tsx)
- [packages/core/src/ai/AiInlineMenu.tsx](file://packages/core/src/ai/AiInlineMenu.tsx)
- [packages/core/src/ai/utils/editor-effects.ts](file://packages/core/src/ai/utils/editor-effects.ts)
- [packages/core/src/ai/ai-utils.ts](file://packages/core/src/ai/ai-utils.ts)
- [packages/core/src/ai/use-agent-optimized.tsx](file://packages/core/src/ai/use-agent-optimized.tsx)
- [packages/core/src/ai/tools/columns-tools.ts](file://packages/core/src/ai/tools/columns-tools.ts)
- [packages/core/src/ai/tools/delete-tools.ts](file://packages/core/src/ai/tools/delete-tools.ts)
- [packages/core/src/ai/tools/insert-tools.ts](file://packages/core/src/ai/tools/insert-tools.ts)
- [packages/core/src/ai/tools/misc-tools.ts](file://packages/core/src/ai/tools/misc-tools.ts)
- [packages/core/src/ai/tools/read-tools.ts](file://packages/core/src/ai/tools/read-tools.ts)
- [packages/core/src/ai/utils/markdown-parser.ts](file://packages/core/src/ai/utils/markdown-parser.ts)
- [packages/core/src/ai/utils/web-search.ts](file://packages/core/src/ai/utils/web-search.ts)
- [packages/core/src/ai/utils/tool-wrapper.ts](file://packages/core/src/ai/utils/tool-wrapper.ts)
- [packages/core/src/ai/utils/editor-effects.ts](file://packages/core/src/ai/utils/editor-effects.ts)
- [packages/core/src/ai/utils/document-utils.ts](file://packages/core/src/ai/utils/document-utils.ts)
- [packages/core/src/ai/types.ts](file://packages/core/src/ai/types.ts)
- [packages/core/src/ai/discovery/tool-metadata.ts](file://packages/core/src/ai/discovery/tool-metadata.ts)
- [packages/common/src/core/PluginManager.ts](file://packages/common/src/core/PluginManager.ts)
- [packages/editor/src/editor/build-in-extension.ts](file://packages/editor/src/editor/build-in-extension.ts)
- [packages/editor/src/editor/use-extension.ts](file://packages/editor/src/editor/use-extension.ts)
- [packages/core/src/ai/tools/format-tools.ts](file://packages/core/src/ai/tools/format-tools.ts)
- [packages/core/src/ai/system-agent/AIAssistantPanel.tsx](file://packages/core/src/ai/system-agent/AIAssistantPanel.tsx)
- [packages/common/src/ai/constants.ts](file://packages/common/src/ai/constants.ts)
- [packages/common/src/ai/discovery/tool-metadata.ts](file://packages/common/src/ai/discovery/tool-metadata.ts)
- [packages/common/src/ai/system-agent/context.tsx](file://packages/common/src/ai/system-agent/context.tsx)
- [packages/common/src/ai/foundation/agent/agent-service.ts](file://packages/common/src/ai/foundation/agent/agent-service.ts)
- [packages/common/src/ai/system-agent/hooks.ts](file://packages/common/src/ai/system-agent/hooks.ts)
- [packages/core/src/ai/PROGRESSIVE_TOOL_DISCOVERY.md](file://packages/core/src/ai/PROGRESSIVE_TOOL_DISCOVERY.md)
- [packages/core/src/ai/TOOL_ADAPTATION_GUIDE.md](file://packages/core/src/ai/TOOL_ADAPTATION_GUIDE.md)
- [packages/core/src/ai/README_TOOL_DISCOVERY.md](file://packages/core/src/ai/README_TOOL_DISCOVERY.md)
- [packages/core/src/ai/ARCHITECTURE.md](file://packages/core/src/ai/ARCHITECTURE.md)
- [packages/core/src/ai/skills/skillsmp/use-skillsmp.ts](file://packages/core/src/ai/skills/skillsmp/use-skillsmp.ts)
- [docs/api/skills-api.md](file://docs/api/skills-api.md)
- [.env.example](file://.env.example)
- [apps/vite/.env.development](file://apps/vite/.env.development)
- [apps/vite/.env.production](file://apps/vite/.env.production)
</cite>

## 更新摘要
**变更内容**
- **架构重大转变**：从渐进式工具发现系统转向集中式目录系统，工具元数据统一管理
- **新增格式化工具**：完整的文本格式化和表格操作工具集，支持内联格式、表格插入、编辑和删除
- **AI助手面板增强**：全新的AI Assistant Panel提供全局悬浮面板、工具调用可视化、流式响应等功能
- **工具元数据系统重构**：统一的工具分类、优先级和标签系统，支持智能搜索和排序
- **技能生态系统优化**：SkillsMP集成、技能注册表管理、工具提供商系统
- **AI内联助手系统完善**：浮动面板界面、实时流式响应、执行步骤跟踪、用户选择提示
- **增强的列管理工具**：支持嵌套列布局、改进编辑器效果工具、增强列管理功能
- **改进的工具系统**：新增insertNestedColumns工具、增强工具元数据系统、改进工具执行跟踪

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [组件详解](#组件详解)
6. [AI技能生态系统](#ai技能生态系统)
7. [AI内联助手系统](#ai内联助手系统)
8. [格式化工具系统](#格式化工具系统)
9. [AI助手面板](#ai助手面板)
10. [工具元数据系统](#工具元数据系统)
11. [技能生态系统](#技能生态系统)
12. [依赖关系分析](#依赖关系分析)
13. [性能与可用性建议](#性能与可用性建议)
14. [故障排查指南](#故障排查指南)
15. [结论](#结论)
16. [附录：使用示例与最佳实践](#附录使用示例与最佳实践)

## 简介
本文件面向希望在编辑器中集成AI能力（文本生成、图像生成与智能编辑）的开发者与产品团队。文档围绕"AI技能生态系统"和"AI内联助手系统"展开，系统阐述以下内容：
- **全新的集中式目录系统**：统一的工具元数据管理，支持智能分类、优先级排序和标签搜索
- **增强的格式化工具系统**：完整的文本格式化和表格操作工具集，支持内联格式、表格插入、编辑和删除
- **AI助手面板**：全新的全局悬浮面板，提供AI助手功能和工具调用可视化
- **AI内联助手系统**：提供浮动面板界面、实时流式响应、执行步骤跟踪、用户选择提示等功能
- **技能生态系统**：集成SkillsMP平台，支持技能搜索、安装、管理和评价
- **工具元数据系统**：统一的工具分类、优先级和标签系统，支持智能搜索和排序
- **增强的列管理工具**：支持嵌套列布局、改进编辑器效果工具、增强列管理功能
- **完整的工具系统**：包含读取、插入、删除、列布局和杂项五大类工具，支持复杂的文档操作
- **现代化UI组件系统**：Chat.tsx、MessageBubble.tsx等组件提供流畅的用户体验和丰富的交互功能

## 项目结构
AI插件位于 packages/plugin-ai，核心由以下模块组成：
- **插件入口与注册**：定义插件类实例，注入编辑器扩展、浮动菜单、静态菜单与斜杠命令
- **编辑器节点扩展**：定义AI文本块与AI图像块两种节点类型，绑定React节点视图
- **视图组件**：分别为AI文本块与AI图像块提供交互界面
- **工具函数**：封装文本生成、图像生成与加载装饰器命令
- **加载装饰器扩展**：为编辑器提供"生成中"装饰器，用于流式渲染占位
- **标记扩展**：提供"加载中"标记，便于在特定范围内标注加载状态
- **菜单与聊天**：提供静态菜单（一键改写、语气、翻译等）与浮动聊天视图
- **AI设置面板**：提供API端点和密钥配置界面，支持安全的密钥管理
- **AI内联助手系统**：提供浮动面板界面、实时流式响应、执行步骤跟踪、用户选择提示
- **格式化工具系统**：完整的文本格式化和表格操作工具集
- **AI助手面板**：全局悬浮面板，提供AI助手功能和工具调用可视化
- **工具元数据系统**：统一的工具分类、优先级和标签管理
- **技能市场集成**：集成SkillsMP平台，支持技能搜索、安装和管理
- **技能注册表**：提供技能生命周期管理、版本控制和依赖解析
- **工具提供商**：支持插件动态注册工具，实现按需加载机制
- **优化的AI代理系统**：全新的use-agent-optimized.tsx，提供强大的工具调用能力
- **完整的工具系统**：五大类工具模块，支持复杂的文档操作
- **增强的工具库**：Markdown解析器、Web搜索、工具包装器等辅助功能
- **现代化UI组件系统**：Chat.tsx、MessageBubble.tsx等提供丰富的交互体验

```mermaid
graph TB
subgraph "插件层"
P["插件入口<br/>index.tsx"]
AIEXT["AI扩展组合<br/>ai/index.tsx"]
E1["AI文本节点<br/>ai.ts"]
E2["AI图像节点<br/>ai-image.ts"]
V1["AI文本视图<br/>AiView.tsx"]
V2["AI图像视图<br/>AiImageView.tsx"]
U["工具函数<br/>utils.ts"]
TL["加载装饰器扩展<br/>text-loading.tsx"]
LM["加载标记扩展<br/>loading-mark.tsx"]
SM["静态菜单<br/>AiStaticMenu.tsx"]
CH["聊天视图<br/>Chat.tsx"]
AS["AI设置面板<br/>AISettings.tsx"]
IL["AI内联助手<br/>AiInlineMenu.tsx"]
AAP["AI助手面板<br/>AIAssistantPanel.tsx"]
FT["格式化工具<br/>format-tools.ts"]
end
subgraph "UI组件层"
CHAT["聊天组件<br/>Chat.tsx"]
MSG["消息气泡<br/>MessageBubble.tsx"]
BUF["流式缓冲<br/>use-streaming-buffer.ts"]
STEP["执行步骤<br/>ExecutionStepsDisplay.tsx"]
ERR["错误显示<br/>ErrorDisplay.tsx"]
QUICK["快速提示<br/>QuickPrompts.tsx"]
TEAM["团队状态<br/>TeamStatusPanel.tsx"]
SESS["会话管理<br/>useSessionManager.ts"]
PERSIST["持久化<br/>chat-persistence.ts"]
end
subgraph "技能生态系统层"
SK["SkillsMP集成<br/>use-skillsmp.ts"]
SR["技能注册表<br/>技能生命周期管理"]
DT["工具元数据<br/>集中式目录系统"]
SP["技能提供商<br/>技能商店管理"]
TP["工具提供商<br/>插件工具注册"]
end
subgraph "核心层"
C1["AI工具库<br/>ai-utils.ts"]
C2["优化代理系统<br/>use-agent-optimized.tsx"]
TOOLS["工具系统<br/>tools/*"]
MD["Markdown解析器<br/>markdown-parser.ts"]
WS["Web搜索<br/>web-search.ts"]
TW["工具包装器<br/>tool-wrapper.ts"]
EE["编辑器效果工具<br/>editor-effects.ts"]
CM["工具常量<br/>constants.ts"]
end
subgraph "配置层"
ENV["环境变量配置<br/>.env.example"]
DEV["开发环境配置<br/>.env.development"]
PROD["生产环境配置<br/>.env.production"]
end
subgraph "通用层"
PM["插件管理器<br/>PluginManager.ts"]
BE["内置扩展集合<br/>build-in-extension.ts"]
UE["扩展解析与组装<br/>use-extension.ts"]
end
P --> AIEXT
AIEXT --> E1
AIEXT --> E2
AIEXT --> TL
AIEXT --> LM
AIEXT --> SM
AIEXT --> CH
AIEXT --> AS
AIEXT --> IL
AIEXT --> AAP
AIEXT --> FT
E1 --> V1
E2 --> V2
V1 --> U
V2 --> U
U --> C1
V1 --> TL
P --> PM
PM --> UE
UE --> BE
C2 --> TOOLS
C2 --> MD
C2 --> WS
C2 --> TW
AS --> ENV
AS --> DEV
AS --> PROD
IL --> EE
IL --> DT
AAP --> CM
AAP --> C2
SK --> SR
SK --> DT
SK --> SP
SK --> TP
CHAT --> MSG
CHAT --> BUF
CHAT --> STEP
CHAT --> ERR
CHAT --> QUICK
CHAT --> TEAM
CHAT --> SESS
CHAT --> PERSIST
```

**图表来源**
- [packages/plugin-ai/src/index.tsx:1-35](file://packages/plugin-ai/src/index.tsx#L1-L35)
- [packages/plugin-ai/src/ai/index.tsx:1-66](file://packages/plugin-ai/src/ai/index.tsx#L1-L66)
- [packages/plugin-ai/src/ai/AISettings.tsx:1-182](file://packages/plugin-ai/src/ai/AISettings.tsx#L1-L182)
- [packages/core/src/ai/AiInlineMenu.tsx:1-435](file://packages/core/src/ai/AiInlineMenu.tsx#L1-L435)
- [packages/core/src/ai/utils/editor-effects.ts:1-12](file://packages/core/src/ai/utils/editor-effects.ts#L1-L12)
- [packages/core/src/ai/use-agent-optimized.tsx:1-223](file://packages/core/src/ai/use-agent-optimized.tsx#L1-L223)
- [packages/core/src/ai/utils/markdown-parser.ts:1-458](file://packages/core/src/ai/utils/markdown-parser.ts#L1-L458)
- [packages/core/src/ai/utils/web-search.ts:1-172](file://packages/core/src/ai/utils/web-search.ts#L1-L172)
- [packages/core/src/ai/skills/skillsmp/use-skillsmp.ts:1-190](file://packages/core/src/ai/skills/skillsmp/use-skillsmp.ts#L1-L190)
- [packages/core/src/ai/discovery/tool-metadata.ts:268-419](file://packages/core/src/ai/discovery/tool-metadata.ts#L268-L419)
- [packages/core/src/ai/tools/format-tools.ts:1-505](file://packages/core/src/ai/tools/format-tools.ts#L1-L505)
- [packages/core/src/ai/system-agent/AIAssistantPanel.tsx:1-538](file://packages/core/src/ai/system-agent/AIAssistantPanel.tsx#L1-L538)
- [packages/common/src/ai/constants.ts:1-143](file://packages/common/src/ai/constants.ts#L1-L143)
- [packages/common/src/ai/discovery/tool-metadata.ts:1-404](file://packages/common/src/ai/discovery/tool-metadata.ts#L1-L404)
- [.env.example:1-24](file://.env.example#L1-L24)
- [apps/vite/.env.development:1-23](file://apps/vite/.env.development#L1-L23)
- [apps/vite/.env.production:1-23](file://apps/vite/.env.production#L1-L23)

## 核心组件
- **插件入口与注册**
  - 定义插件实例，声明编辑器扩展数组、浮动菜单、静态菜单与斜杠命令，供插件管理器在运行时合并与注入
  - **新增AI内联助手系统集成**：在AIExtension中集成AiInlineTrigger和AiInlinePanel组件
  - **新增AI助手面板集成**：集成AIAssistantPanel组件提供全局悬浮面板
  - **新增格式化工具集成**：集成format-tools工具集
  - 关键路径参考：[packages/plugin-ai/src/index.tsx:1-35](file://packages/plugin-ai/src/index.tsx#L1-L35), [packages/plugin-ai/src/ai/index.tsx:1-66](file://packages/plugin-ai/src/ai/index.tsx#L1-L66)

- **AI文本节点与命令**
  - 定义节点属性（提示语、生成时间）、HTML渲染、节点视图绑定与插入命令
  - 关键路径参考：[packages/plugin-ai/src/ai/ai.ts:1-55](file://packages/plugin-ai/src/ai/ai.ts#L1-L55)

- **AI图像节点与命令**
  - 定义节点属性（提示语、图片URL）、节点视图绑定与插入命令
  - 关键路径参考：[packages/plugin-ai/src/ai/ai-image.ts:1-37](file://packages/plugin-ai/src/ai/ai-image.ts#L1-L37)

- **文本生成视图**
  - 负责渲染节点内容、显示生成信息、接收提示语、触发生成与删除
  - 关键路径参考：[packages/plugin-ai/src/ai/AiView.tsx:1-76](file://packages/plugin-ai/src/ai/AiView.tsx#L1-L76)

- **图像生成视图**
  - 负责渲染图片预览、接收提示语、触发生成与删除；对错误进行提示
  - 关键路径参考：[packages/plugin-ai/src/ai/AiImageView.tsx:1-69](file://packages/plugin-ai/src/ai/AiImageView.tsx#L1-L69)

- **工具函数**
  - 文本生成：基于核心AI工具库发起流式文本生成，支持在指定位置插入与更新
  - 图像生成：调用外部图像生成接口，返回结果后更新节点属性
  - **安全的API密钥管理**：通过环境变量VITE_AI_IMAGE_API_KEY获取图像生成密钥
  - 关键路径参考：[packages/plugin-ai/src/ai/utils.ts:1-126](file://packages/plugin-ai/src/ai/utils.ts#L1-L126)

- **加载装饰器扩展**
  - 在编辑器中注入"生成中"装饰器，支持切换与移除，用于流式渲染占位
  - 关键路径参考：[packages/plugin-ai/src/ai/text-loading.tsx:1-146](file://packages/plugin-ai/src/ai/text-loading.tsx#L1-L146)

- **加载标记扩展**
  - 提供"加载中"标记，支持设置与取消标记，便于在特定范围内标注加载状态
  - 关键路径参考：[packages/plugin-ai/src/ai/marks/loading-mark.tsx:1-36](file://packages/plugin-ai/src/ai/marks/loading-mark.tsx#L1-L36)

- **静态菜单与聊天视图**
  - 静态菜单：提供一键改写、简化、插入表情、改变语气、翻译等常用智能编辑操作
  - 聊天视图：提供浮动聊天窗口，支持与Agent对话并流式展示回答
  - **重大更新**：Chat.tsx组件提供完整的聊天界面，包含流式渲染、执行步骤跟踪、错误处理等功能
  - 关键路径参考：[packages/plugin-ai/src/ai/menu/AiStaticMenu.tsx:1-48](file://packages/plugin-ai/src/ai/menu/AiStaticMenu.tsx#L1-L48), [packages/plugin-ai/src/ai/menu/Chat.tsx:1-636](file://packages/plugin-ai/src/ai/menu/Chat.tsx#L1-L636)

- **AI设置面板**
  - 提供API端点和密钥配置界面，支持文本生成和图像生成的API配置
  - 支持密码输入框安全存储API密钥，提供设置保存功能
  - 关键路径参考：[packages/plugin-ai/src/ai/AISettings.tsx:1-182](file://packages/plugin-ai/src/ai/AISettings.tsx#L1-L182)

- **AI内联助手系统**
  - **浮动面板界面**：提供Ask AI浮动面板，支持实时流式响应和执行步骤跟踪
  - **触发器组件**：在气泡菜单中提供Ask AI按钮，捕获用户选中文本并触发面板
  - **虚拟选中高亮**：通过装饰插件为选中区域提供视觉高亮
  - **流式缓冲**：使用requestAnimationFrame优化流式文本渲染性能
  - **执行步骤跟踪**：实时显示工具执行状态、结果和耗时
  - 关键路径参考：[packages/core/src/ai/AiInlineMenu.tsx:1-435](file://packages/core/src/ai/AiInlineMenu.tsx#L1-L435)

- **格式化工具系统**
  - **文本格式化**：支持内联格式（加粗、斜体、下划线、删除线、代码）
  - **表格操作**：支持表格插入、结构操作、单元格编辑、删除
  - **工具定义**：完整的TypeScript类型定义和输入验证
  - **编辑器集成**：与ProseMirror编辑器无缝集成
  - 关键路径参考：[packages/core/src/ai/tools/format-tools.ts:1-505](file://packages/core/src/ai/tools/format-tools.ts#L1-L505)

- **AI助手面板**
  - **全局悬浮面板**：提供AI助手功能，支持全局访问
  - **流式响应**：实时流式文本生成和工具调用可视化
  - **工具调用**：显示工具执行步骤、参数和结果
  - **错误处理**：友好的错误提示和重试机制
  - **会话管理**：支持持久化的会话和对话ID管理
  - 关键路径参考：[packages/core/src/ai/system-agent/AIAssistantPanel.tsx:1-538](file://packages/core/src/ai/system-agent/AIAssistantPanel.tsx#L1-L538)

- **工具元数据系统**
  - **集中式目录**：统一的工具分类、优先级和标签管理
  - **智能搜索**：支持按分类、标签和关键词搜索工具
  - **优先级排序**：根据重要性和使用频率排序工具
  - **按需加载**：只在需要时加载工具，提升性能
  - **分类管理**：按功能分类组织工具，便于管理
  - 关键路径参考：[packages/common/src/ai/discovery/tool-metadata.ts:1-404](file://packages/common/src/ai/discovery/tool-metadata.ts#L1-L404)

- **技能市场集成（SkillsMP）**
  - 基于use-skillsmp.ts的React Hook，提供技能搜索、分类加载和分页功能
  - 支持关键词搜索和AI语义搜索，提供完整的技能市场交互体验
  - 关键路径参考：[packages/core/src/ai/skills/skillsmp/use-skillsmp.ts:1-190](file://packages/core/src/ai/skills/skillsmp/use-skillsmp.ts#L1-L190)

- **技能注册表系统**
  - 提供技能生命周期管理，包括安装、卸载、启用/禁用和版本控制
  - 支持技能依赖解析和工具注册，实现完整的技能生态系统
  - 关键路径参考：[docs/api/skills-api.md:1-777](file://docs/api/skills-api.md#L1-L777)

- **工具提供商**
  - 支持插件动态注册工具，实现按需加载机制
  - 提供工具元数据管理、优先级设置和标签系统
  - 关键路径参考：[packages/core/src/ai/TOOL_ADAPTATION_GUIDE.md:147-169](file://packages/core/src/ai/TOOL_ADAPTATION_GUIDE.md#L147-L169)

- **优化的AI代理系统**
  - 基于use-agent-optimized.tsx的全新代理系统，支持工具循环和智能决策
  - 提供停止生成、状态检查等功能，增强用户体验
  - 关键路径参考：[packages/core/src/ai/use-agent-optimized.tsx:1-223](file://packages/core/src/ai/use-agent-optimized.tsx#L1-L223)

- **完整的工具系统**
  - 五大类工具模块：读取工具、插入工具、删除工具、列布局工具、杂项工具
  - 支持复杂的文档操作和智能编辑功能
  - **新增嵌套列布局工具**：insertNestedColumns支持在现有分栏列内插入嵌套分栏布局
  - **新增格式化工具**：formatText、insertTable、getTableInfo、editTable、deleteTable、listTable、editTableCell
  - 关键路径参考：[packages/core/src/ai/tools/read-tools.ts:1-208](file://packages/core/src/ai/tools/read-tools.ts#L1-L208), [packages/core/src/ai/tools/insert-tools.ts:1-611](file://packages/core/src/ai/tools/insert-tools.ts#L1-L611), [packages/core/src/ai/tools/delete-tools.ts:1-253](file://packages/core/src/ai/tools/delete-tools.ts#L1-L253), [packages/core/src/ai/tools/columns-tools.ts:1-616](file://packages/core/src/ai/tools/columns-tools.ts#L1-L616), [packages/core/src/ai/tools/misc-tools.ts:1-210](file://packages/core/src/ai/tools/misc-tools.ts#L1-L210)

- **增强的工具库**
  - Markdown解析器：支持完整的Markdown语法解析和转换
  - Web搜索：集成多种搜索源，提供高质量的外部信息获取
  - 工具包装器：提供统一的工具执行跟踪和回调机制
  - **编辑器效果工具**：提供滚动到指定位置等编辑器操作工具
  - 关键路径参考：[packages/core/src/ai/utils/markdown-parser.ts:1-458](file://packages/core/src/ai/utils/markdown-parser.ts#L1-L458), [packages/core/src/ai/utils/web-search.ts:1-172](file://packages/core/src/ai/utils/web-search.ts#L1-L172), [packages/core/src/ai/utils/tool-wrapper.ts:1-68](file://packages/core/src/ai/utils/tool-wrapper.ts#L1-L68), [packages/core/src/ai/utils/editor-effects.ts:1-12](file://packages/core/src/ai/utils/editor-effects.ts#L1-L12)

- **核心AI工具库**
  - 提供模型创建与流式文本生成封装，作为工具函数的上游依赖
  - **移除了硬编码的DeepSeek API密钥，通过空字符串初始化**
  - 关键路径参考：[packages/core/src/ai/ai-utils.ts:1-20](file://packages/core/src/ai/ai-utils.ts#L1-L20)

- **插件管理与扩展装配**
  - 插件管理器负责收集各插件的编辑器扩展与本地化资源；编辑器在运行时解析并组装扩展
  - 关键路径参考：[packages/common/src/core/PluginManager.ts:1-177](file://packages/common/src/core/PluginManager.ts#L1-L177), [packages/editor/src/editor/use-extension.ts:47-63](file://packages/editor/src/editor/use-extension.ts#L47-L63), [packages/editor/src/editor/build-in-extension.ts:1-56](file://packages/editor/src/editor/build-in-extension.ts#L1-L56)

**章节来源**
- [packages/plugin-ai/src/index.tsx:1-35](file://packages/plugin-ai/src/index.tsx#L1-L35)
- [packages/plugin-ai/src/ai/index.tsx:1-66](file://packages/plugin-ai/src/ai/index.tsx#L1-L66)
- [packages/plugin-ai/src/ai/ai.ts:1-55](file://packages/plugin-ai/src/ai/ai.ts#L1-L55)
- [packages/plugin-ai/src/ai/ai-image.ts:1-37](file://packages/plugin-ai/src/ai/ai-image.ts#L1-L37)
- [packages/plugin-ai/src/ai/AiView.tsx:1-76](file://packages/plugin-ai/src/ai/AiView.tsx#L1-L76)
- [packages/plugin-ai/src/ai/AiImageView.tsx:1-69](file://packages/plugin-ai/src/ai/AiImageView.tsx#L1-L69)
- [packages/plugin-ai/src/ai/utils.ts:1-126](file://packages/plugin-ai/src/ai/utils.ts#L1-L126)
- [packages/plugin-ai/src/ai/text-loading.tsx:1-146](file://packages/plugin-ai/src/ai/text-loading.tsx#L1-L146)
- [packages/plugin-ai/src/ai/marks/loading-mark.tsx:1-36](file://packages/plugin-ai/src/ai/marks/loading-mark.tsx#L1-L36)
- [packages/plugin-ai/src/ai/menu/AiStaticMenu.tsx:1-48](file://packages/plugin-ai/src/ai/menu/AiStaticMenu.tsx#L1-L48)
- [packages/plugin-ai/src/ai/menu/Chat.tsx:1-636](file://packages/plugin-ai/src/ai/menu/Chat.tsx#L1-L636)
- [packages/plugin-ai/src/ai/AISettings.tsx:1-182](file://packages/plugin-ai/src/ai/AISettings.tsx#L1-L182)
- [packages/core/src/ai/AiInlineMenu.tsx:1-435](file://packages/core/src/ai/AiInlineMenu.tsx#L1-L435)
- [packages/core/src/ai/tools/format-tools.ts:1-505](file://packages/core/src/ai/tools/format-tools.ts#L1-L505)
- [packages/core/src/ai/system-agent/AIAssistantPanel.tsx:1-538](file://packages/core/src/ai/system-agent/AIAssistantPanel.tsx#L1-L538)
- [packages/common/src/ai/discovery/tool-metadata.ts:1-404](file://packages/common/src/ai/discovery/tool-metadata.ts#L1-L404)
- [packages/core/src/ai/skills/skillsmp/use-skillsmp.ts:1-190](file://packages/core/src/ai/skills/skillsmp/use-skillsmp.ts#L1-L190)
- [docs/api/skills-api.md:1-777](file://docs/api/skills-api.md#L1-L777)
- [packages/core/src/ai/PROGRESSIVE_TOOL_DISCOVERY.md:1-389](file://packages/core/src/ai/PROGRESSIVE_TOOL_DISCOVERY.md#L1-L389)
- [packages/core/src/ai/TOOL_ADAPTATION_GUIDE.md:147-169](file://packages/core/src/ai/TOOL_ADAPTATION_GUIDE.md#L147-L169)
- [packages/core/src/ai/use-agent-optimized.tsx:1-223](file://packages/core/src/ai/use-agent-optimized.tsx#L1-L223)
- [packages/core/src/ai/tools/read-tools.ts:1-208](file://packages/core/src/ai/tools/read-tools.ts#L1-L208)
- [packages/core/src/ai/tools/insert-tools.ts:1-611](file://packages/core/src/ai/tools/insert-tools.ts#L1-L611)
- [packages/core/src/ai/tools/delete-tools.ts:1-253](file://packages/core/src/ai/tools/delete-tools.ts#L1-L253)
- [packages/core/src/ai/tools/columns-tools.ts:1-616](file://packages/core/src/ai/tools/columns-tools.ts#L1-L616)
- [packages/core/src/ai/tools/misc-tools.ts:1-210](file://packages/core/src/ai/tools/misc-tools.ts#L1-L210)
- [packages/core/src/ai/utils/markdown-parser.ts:1-458](file://packages/core/src/ai/utils/markdown-parser.ts#L1-L458)
- [packages/core/src/ai/utils/web-search.ts:1-172](file://packages/core/src/ai/utils/web-search.ts#L1-L172)
- [packages/core/src/ai/utils/tool-wrapper.ts:1-68](file://packages/core/src/ai/utils/tool-wrapper.ts#L1-L68)
- [packages/core/src/ai/utils/editor-effects.ts:1-12](file://packages/core/src/ai/utils/editor-effects.ts#L1-L12)
- [packages/core/src/ai/ai-utils.ts:1-20](file://packages/core/src/ai/ai-utils.ts#L1-L20)
- [packages/common/src/core/PluginManager.ts:1-177](file://packages/common/src/core/PluginManager.ts#L1-L177)
- [packages/editor/src/editor/use-extension.ts:47-63](file://packages/editor/src/editor/use-extension.ts#L47-L63)
- [packages/editor/src/editor/build-in-extension.ts:1-56](file://packages/editor/src/editor/build-in-extension.ts#L1-L56)

## 架构总览
AI插件采用"插件-扩展-视图-技能生态系统"的分层架构：
- **插件层**：通过插件入口注册编辑器扩展、浮动菜单、静态菜单与斜杠命令
- **扩展层**：节点扩展定义节点行为与视图；加载装饰器扩展提供流式渲染占位；标记扩展提供范围标记能力
- **视图层**：React节点视图为用户提供交互界面；静态菜单与聊天视图为用户提供快捷操作与对话体验；**AI设置面板为用户提供安全的配置界面**；**AI内联助手系统提供浮动面板界面和实时交互**；**AI助手面板提供全局悬浮面板和工具调用可视化**
- **UI组件层**：**现代化的聊天组件系统**提供完整的用户交互体验，包括流式渲染、执行步骤跟踪、错误处理等
- **技能生态系统层**：**SkillsMP集成提供技能市场接入**；**技能注册表管理技能生命周期**；**集中式工具元数据系统提供智能工具管理**；**技能提供商和工具提供商实现生态系统的开放性**
- **工具层**：全新的工具系统提供完整的文档操作能力，包括读取、插入、删除、列布局、杂项功能，**新增嵌套列布局支持**，**新增格式化工具系统**
- **代理层**：优化的AI代理系统提供智能决策和工具调用能力
- **配置层**：环境变量和设置面板提供安全的API密钥管理
- **运行时装配**：插件管理器聚合各插件扩展，编辑器解析并组装扩展

```mermaid
sequenceDiagram
participant User as "用户"
participant Chat as "聊天组件<br/>Chat.tsx"
participant Buffer as "流式缓冲<br/>use-streaming-buffer.ts"
participant Steps as "执行步骤<br/>ExecutionStepsDisplay.tsx"
participant Team as "团队状态<br/>TeamStatusPanel.tsx"
participant Agent as "优化代理系统<br/>use-agent-optimized.tsx"
participant Skills as "技能生态系统<br/>SkillsMP"
participant Tools as "工具系统<br/>tools/*"
participant Parser as "Markdown解析器<br/>markdown-parser.ts"
participant Search as "Web搜索<br/>web-search.ts"
participant Core as "AI工具库<br/>ai-utils.ts"
User->>Chat : 发送消息
Chat->>Buffer : 开始流式渲染
Chat->>Steps : 更新执行步骤
Chat->>Team : 显示团队状态
Chat->>Agent : 调用优化代理系统
Agent->>Skills : 检查技能可用性
Skills-->>Agent : 返回技能工具
Agent->>Tools : 解析指令并调用相应工具
Tools->>Parser : 处理Markdown内容
Tools->>Search : 获取外部信息
Agent-->>Chat : 返回操作结果
Chat->>Buffer : 更新流式内容
Chat->>Steps : 记录执行结果
Chat->>User : 实时流式展示响应
```

**图表来源**
- [packages/plugin-ai/src/ai/menu/Chat.tsx:117-246](file://packages/plugin-ai/src/ai/menu/Chat.tsx#L117-L246)
- [packages/plugin-ai/src/ai/menu/use-streaming-buffer.ts:10-62](file://packages/plugin-ai/src/ai/menu/use-streaming-buffer.ts#L10-L62)
- [packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx:10-75](file://packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx#L10-L75)
- [packages/plugin-ai/src/ai/menu/TeamStatusPanel.tsx:60-122](file://packages/plugin-ai/src/ai/menu/TeamStatusPanel.tsx#L60-L122)
- [packages/core/src/ai/use-agent-optimized.tsx:1-223](file://packages/core/src/ai/use-agent-optimized.tsx#L1-L223)
- [packages/core/src/ai/skills/skillsmp/use-skillsmp.ts:1-190](file://packages/core/src/ai/skills/skillsmp/use-skillsmp.ts#L1-L190)
- [packages/core/src/ai/tools/insert-tools.ts:1-611](file://packages/core/src/ai/tools/insert-tools.ts#L1-L611)
- [packages/core/src/ai/utils/markdown-parser.ts:1-458](file://packages/core/src/ai/utils/markdown-parser.ts#L1-L458)
- [packages/core/src/ai/utils/web-search.ts:1-172](file://packages/core/src/ai/utils/web-search.ts#L1-L172)

## 组件详解

### 文本生成流程（AI文本块）
- **节点定义与命令**
  - 节点属性包含提示语与生成时间；提供插入AI文本块的命令
  - 参考路径：[packages/plugin-ai/src/ai/ai.ts:1-55](file://packages/plugin-ai/src/ai/ai.ts#L1-L55)

- **视图交互**
  - 显示"此文本由AI生成"与生成日期；在可编辑状态下允许修改提示语并触发生成
  - 参考路径：[packages/plugin-ai/src/ai/AiView.tsx:1-76](file://packages/plugin-ai/src/ai/AiView.tsx#L1-L76)

- **流式渲染与装饰器**
  - 使用"生成中"装饰器在指定位置渲染占位；通过命令切换与移除装饰器
  - 参考路径：[packages/plugin-ai/src/ai/text-loading.tsx:1-146](file://packages/plugin-ai/src/ai/text-loading.tsx#L1-L146)

- **工具函数**
  - aiGeneration：发起流式文本生成，回调增量结果；aiText：在当前选区执行AI改写
  - **安全的API密钥管理**：通过环境变量VITE_AI_IMAGE_API_KEY获取图像生成密钥
  - 参考路径：[packages/plugin-ai/src/ai/utils.ts:1-126](file://packages/plugin-ai/src/ai/utils.ts#L1-L126), [packages/core/src/ai/ai-utils.ts:1-20](file://packages/core/src/ai/ai-utils.ts#L1-L20)

```mermaid
flowchart TD
Start(["开始"]) --> GetPrompt["读取提示语"]
GetPrompt --> DeleteOld["删除旧内容"]
DeleteOld --> ToggleDeco["切换"生成中"装饰器"]
ToggleDeco --> Stream["订阅流式文本"]
Stream --> Update["增量更新编辑器内容"]
Update --> HasMore{"是否还有片段？"}
HasMore --> |是| Stream
HasMore --> |否| InsertFinal["插入最终文本"]
InsertFinal --> RemoveDeco["移除装饰器"]
RemoveDeco --> End(["结束"])
```

**图表来源**
- [packages/plugin-ai/src/ai/AiView.tsx:1-76](file://packages/plugin-ai/src/ai/AiView.tsx#L1-L76)
- [packages/plugin-ai/src/ai/utils.ts:1-126](file://packages/plugin-ai/src/ai/utils.ts#L1-L126)
- [packages/plugin-ai/src/ai/text-loading.tsx:1-146](file://packages/plugin-ai/src/ai/text-loading.tsx#L1-L146)

**章节来源**
- [packages/plugin-ai/src/ai/ai.ts:1-55](file://packages/plugin-ai/src/ai/ai.ts#L1-L55)
- [packages/plugin-ai/src/ai/AiView.tsx:1-76](file://packages/plugin-ai/src/ai/AiView.tsx#L1-L76)
- [packages/plugin-ai/src/ai/utils.ts:1-126](file://packages/plugin-ai/src/ai/utils.ts#L1-L126)
- [packages/plugin-ai/src/ai/text-loading.tsx:1-146](file://packages/plugin-ai/src/ai/text-loading.tsx#L1-L146)
- [packages/core/src/ai/ai-utils.ts:1-20](file://packages/core/src/ai/ai-utils.ts#L1-L20)

### 图像生成流程（AI图像块）
- **节点定义与命令**
  - 节点属性包含提示语与图片URL；提供插入AI图像块的命令
  - 参考路径：[packages/plugin-ai/src/ai/ai-image.ts:1-37](file://packages/plugin-ai/src/ai/ai-image.ts#L1-L37)

- **视图交互**
  - 预览图片；在可编辑状态下允许修改提示语并触发生成；失败时弹出提示
  - 参考路径：[packages/plugin-ai/src/ai/AiImageView.tsx:1-69](file://packages/plugin-ai/src/ai/AiImageView.tsx#L1-L69)

- **工具函数**
  - aiImageWriter：调用外部图像生成接口，返回结果后更新节点URL
  - **安全的API密钥管理**：通过环境变量VITE_AI_IMAGE_API_KEY获取图像生成密钥，支持配置覆盖
  - 参考路径：[packages/plugin-ai/src/ai/utils.ts:1-126](file://packages/plugin-ai/src/ai/utils.ts#L1-L126)

```mermaid
sequenceDiagram
participant User as "用户"
participant ImageView as "AI图像视图<br/>AiImageView.tsx"
participant Utils as "工具函数<br/>utils.ts"
participant API as "图像生成接口"
participant Editor as "编辑器命令链"
User->>ImageView : 输入提示语并点击"生成"
ImageView->>Utils : 调用aiImageWriter(prompt)
Utils->>API : POST /images/generations
API-->>Utils : 返回{data : [{url}], error?}
alt 成功
Utils-->>ImageView : 返回数据
ImageView->>Editor : 更新节点属性(url)
else 失败
Utils-->>ImageView : 返回错误
ImageView-->>User : 提示错误信息
end
```

**图表来源**
- [packages/plugin-ai/src/ai/AiImageView.tsx:1-69](file://packages/plugin-ai/src/ai/AiImageView.tsx#L1-L69)
- [packages/plugin-ai/src/ai/utils.ts:1-126](file://packages/plugin-ai/src/ai/utils.ts#L1-L126)

**章节来源**
- [packages/plugin-ai/src/ai/ai-image.ts:1-37](file://packages/plugin-ai/src/ai/ai-image.ts#L1-L37)
- [packages/plugin-ai/src/ai/AiImageView.tsx:1-69](file://packages/plugin-ai/src/ai/AiImageView.tsx#L1-L69)
- [packages/plugin-ai/src/ai/utils.ts:1-126](file://packages/plugin-ai/src/ai/utils.ts#L1-L126)

### 智能编辑工具与聊天视图
- **静态菜单**
  - 提供一键改写、简化、插入表情、改变语气、翻译等常用智能编辑操作
  - 参考路径：[packages/plugin-ai/src/ai/menu/AiStaticMenu.tsx:1-48](file://packages/plugin-ai/src/ai/menu/AiStaticMenu.tsx#L1-L48)

- **聊天视图**
  - **重大更新**：提供完整的浮动聊天窗口，支持与Agent对话并流式展示回答
  - **现代化UI设计**：包含ExpandableChat组件、消息列表、工具步骤显示等
  - **流式渲染优化**：使用requestAnimationFrame优化流式文本渲染性能
  - **执行步骤跟踪**：实时显示工具执行状态、结果和耗时
  - **错误处理**：提供友好的错误提示和重试机制
  - **会话管理**：支持持久化的会话和对话ID管理
  - **团队状态可视化**：显示AgentTeam的状态和进度
  - 参考路径：[packages/plugin-ai/src/ai/menu/Chat.tsx:1-636](file://packages/plugin-ai/src/ai/menu/Chat.tsx#L1-L636)

- **优化的AI代理系统**
  - 基于use-agent-optimized.tsx的全新代理系统，支持工具循环和智能决策
  - 提供停止生成、状态检查等功能，增强用户体验
  - **移除了硬编码的DeepSeek API密钥，通过空字符串初始化**
  - 参考路径：[packages/core/src/ai/use-agent-optimized.tsx:1-223](file://packages/core/src/ai/use-agent-optimized.tsx#L1-L223)

- **Agent能力**
  - 基于插件管理器解析的工具集，提供读取范围、读取全文、写入、替换、删除与高亮等能力
  - 支持列布局操作、Web搜索、用户选择确认等高级功能
  - **集成技能生态系统，支持技能驱动的工具调用**
  - 参考路径：[packages/core/src/ai/use-agent-optimized.tsx:1-223](file://packages/core/src/ai/use-agent-optimized.tsx#L1-L223)

- **模型与工具库**
  - 使用DeepSeek模型与工具库封装流式文本生成
  - **移除了硬编码的DeepSeek API密钥，通过空字符串初始化**
  - 参考路径：[packages/core/src/ai/ai-utils.ts:1-20](file://packages/core/src/ai/ai-utils.ts#L1-L20)

**章节来源**
- [packages/plugin-ai/src/ai/menu/AiStaticMenu.tsx:1-48](file://packages/plugin-ai/src/ai/menu/AiStaticMenu.tsx#L1-L48)
- [packages/plugin-ai/src/ai/menu/Chat.tsx:1-636](file://packages/plugin-ai/src/ai/menu/Chat.tsx#L1-L636)
- [packages/core/src/ai/use-agent-optimized.tsx:1-223](file://packages/core/src/ai/use-agent-optimized.tsx#L1-L223)
- [packages/core/src/ai/ai-utils.ts:1-20](file://packages/core/src/ai/ai-utils.ts#L1-L20)

### AI设置面板与API配置
- **安全的API配置界面**
  - 提供文本生成API端点、图像生成API端点和API密钥的配置界面
  - 支持密码输入框安全存储API密钥，提供设置保存功能
  - 参考路径：[packages/plugin-ai/src/ai/AISettings.tsx:1-182](file://packages/plugin-ai/src/ai/AISettings.tsx#L1-L182)

- **环境变量支持**
  - 通过VITE_AI_IMAGE_API_KEY环境变量获取图像生成API密钥
  - 支持开发环境和生产环境的不同配置
  - 参考路径：[packages/plugin-ai/src/ai/utils.ts:6-10](file://packages/plugin-ai/src/ai/utils.ts#L6-L10), [.env.example:1-24](file://.env.example#L1-L24), [apps/vite/.env.development:1-23](file://apps/vite/.env.development#L1-L23), [apps/vite/.env.production:1-23](file://apps/vite/.env.production#L1-L23)

- **安全的API密钥管理**
  - 移除了硬编码的DeepSeek API密钥，提升了安全性
  - 通过环境变量和设置面板进行API密钥的配置和管理
  - 参考路径：[packages/core/src/ai/ai-utils.ts:5-7](file://packages/core/src/ai/ai-utils.ts#L5-L7)

**章节来源**
- [packages/plugin-ai/src/ai/AISettings.tsx:1-182](file://packages/plugin-ai/src/ai/AISettings.tsx#L1-L182)
- [packages/plugin-ai/src/ai/utils.ts:6-10](file://packages/plugin-ai/src/ai/utils.ts#L6-L10)
- [packages/core/src/ai/ai-utils.ts:5-7](file://packages/core/src/ai/ai-utils.ts#L5-L7)
- [.env.example:1-24](file://.env.example#L1-L24)
- [apps/vite/.env.development:1-23](file://apps/vite/.env.development#L1-L23)
- [apps/vite/.env.production:1-23](file://apps/vite/.env.production#L1-L23)

### 插件集成与参数配置
- **插件注册**
  - 在插件入口中声明编辑器扩展数组、浮动菜单、静态菜单与斜杠命令，供插件管理器在运行时合并
  - **新增AI内联助手系统集成**：在AIExtension中集成AiInlineTrigger和AiInlinePanel组件
  - **新增AI助手面板集成**：集成AIAssistantPanel组件提供全局悬浮面板
  - **新增格式化工具集成**：集成format-tools工具集
  - 参考路径：[packages/plugin-ai/src/index.tsx:1-35](file://packages/plugin-ai/src/index.tsx#L1-L35), [packages/plugin-ai/src/ai/index.tsx:1-66](file://packages/plugin-ai/src/ai/index.tsx#L1-L66)

- **扩展解析与装配**
  - 编辑器运行时将内置扩展与插件扩展合并，解析并组装扩展列表
  - 参考路径：[packages/editor/src/editor/use-extension.ts:47-63](file://packages/editor/src/editor/use-extension.ts#L47-L63), [packages/editor/src/editor/build-in-extension.ts:1-56](file://packages/editor/src/editor/build-in-extension.ts#L1-L56)

- **插件管理器**
  - 支持动态安装/卸载插件，聚合各插件的服务与扩展
  - **集成技能生态系统，支持插件驱动的技能管理**
  - 参考路径：[packages/common/src/core/PluginManager.ts:1-177](file://packages/common/src/core/PluginManager.ts#L1-L177)

**章节来源**
- [packages/plugin-ai/src/index.tsx:1-35](file://packages/plugin-ai/src/index.tsx#L1-L35)
- [packages/plugin-ai/src/ai/index.tsx:1-66](file://packages/plugin-ai/src/ai/index.tsx#L1-L66)
- [packages/editor/src/editor/use-extension.ts:47-63](file://packages/editor/src/editor/use-extension.ts#L47-L63)
- [packages/editor/src/editor/build-in-extension.ts:1-56](file://packages/editor/src/editor/build-in-extension.ts#L1-L56)
- [packages/common/src/core/PluginManager.ts:1-177](file://packages/common/src/core/PluginManager.ts#L1-L177)

### 格式化工具系统

#### 文本格式化工具
**完整的内联格式化工具集**提供丰富的文本格式化功能：
- **formatText工具**：为文档中已有的文本应用内联格式（加粗、斜体、下划线、删除线、代码）
- **输入验证**：使用zod进行严格的输入验证，支持文本搜索、格式类型和出现次数
- **精确定位**：通过findTextPosition精确定位目标文本，支持多次出现的文本选择
- **编辑器集成**：与ProseMirror编辑器无缝集成，支持滚动到可视区域
- **错误处理**：提供详细的错误信息和回退机制

```mermaid
graph TB
subgraph "格式化工具流程"
SEARCH["搜索文本<br/>findTextPosition"]
SELECT["选择文本范围<br/>setTextSelection"]
FORMAT["应用格式<br/>toggleBold/ToggleItalic"]
SUCCESS["格式化成功<br/>返回结果"]
ERROR["格式化失败<br/>返回错误"]
end
SEARCH --> SELECT
SELECT --> FORMAT
FORMAT --> SUCCESS
FORMAT --> ERROR
```

**图表来源**
- [packages/core/src/ai/tools/format-tools.ts:21-70](file://packages/core/src/ai/tools/format-tools.ts#L21-L70)

**章节来源**
- [packages/core/src/ai/tools/format-tools.ts:11-71](file://packages/core/src/ai/tools/format-tools.ts#L11-L71)

#### 表格操作工具
**完整的表格操作工具集**提供文档表格的全面管理：
- **insertTable工具**：插入新表格，支持行列数、表头行和块索引定位
- **getTableInfo工具**：获取表格结构信息和单元格内容，支持概览和详细信息
- **editTable工具**：表格结构操作（添加/删除行列、合并/拆分单元格）
- **editTableCell工具**：编辑指定单元格内容，支持替换、追加、前置模式
- **deleteTable工具**：删除指定表格，提供详细确认信息
- **listTable工具**：列出所有表格概览，支持预览行数设置

**章节来源**
- [packages/core/src/ai/tools/format-tools.ts:73-505](file://packages/core/src/ai/tools/format-tools.ts#L73-L505)

### AI助手面板

#### 全局悬浮面板
**全新的AI助手面板**提供全局悬浮访问和工具调用可视化：
- **悬浮面板设计**：支持多种位置（右下角、左下角、居中），固定尺寸400x600px
- **工具调用可视化**：实时显示工具执行步骤、参数和结果
- **流式响应**：支持实时流式文本生成和工具调用状态
- **会话管理**：支持持久化的会话和对话ID管理
- **错误处理**：友好的错误提示和重试机制
- **键盘快捷键**：支持Ctrl+K快捷键打开面板

```mermaid
graph TB
subgraph "AI助手面板架构"
TRIGGER["触发器<br/>AIAssistantTrigger"]
PANEL["悬浮面板<br/>AIAssistantPanel"]
HEADER["头部信息<br/>状态显示"]
MESSAGES["消息列表<br/>用户/助手消息"]
STEPS["工具调用<br/>执行步骤可视化"]
INPUT["输入区域<br/>文本输入 + 发送按钮"]
ERROR["错误显示<br/>错误信息提示"]
END
TRIGGER --> PANEL
PANEL --> HEADER
PANEL --> MESSAGES
PANEL --> STEPS
PANEL --> INPUT
PANEL --> ERROR
```

**图表来源**
- [packages/core/src/ai/system-agent/AIAssistantPanel.tsx:75-472](file://packages/core/src/ai/system-agent/AIAssistantPanel.tsx#L75-L472)

**章节来源**
- [packages/core/src/ai/system-agent/AIAssistantPanel.tsx:1-538](file://packages/core/src/ai/system-agent/AIAssistantPanel.tsx#L1-L538)

#### 工具调用可视化
**工具执行步骤可视化**帮助用户理解AI操作过程：
- **步骤记录**：实时记录工具执行状态（运行中/成功/失败）
- **参数显示**：显示工具名称和执行参数
- **耗时统计**：记录每个工具的执行耗时
- **状态指示**：使用不同图标表示执行状态
- **错误详情**：显示错误状态下的详细信息和参数
- **历史记录**：维护完整的执行历史，支持查看和调试

**章节来源**
- [packages/core/src/ai/system-agent/AIAssistantPanel.tsx:357-400](file://packages/core/src/ai/system-agent/AIAssistantPanel.tsx#L357-L400)

### 工具元数据系统

#### 集中式目录管理
**统一的工具元数据系统**实现智能分类和管理：
- **工具分类**：document-read、document-write、document-delete、document-structure、layout、interaction、web、plugin、discovery
- **优先级系统**：1-10分制，数值越高越重要
- **标签系统**：功能标签、特性标签、场景标签、对象标签
- **智能搜索**：支持按分类、标签和关键词搜索工具
- **按需加载**：只在需要时加载工具，提升性能
- **分类管理**：按功能分类组织工具，便于管理

```mermaid
graph TB
subgraph "工具元数据系统"
ESSENTIAL["基础工具<br/>ESSENTIAL_TOOLS"]
CATEGORY["分类管理<br/>CATEGORY_DESCRIPTIONS"]
METADATA["工具元数据<br/>BUILTIN_TOOL_METADATA"]
SEARCH["智能搜索<br/>按分类/标签/关键词"]
LOAD["按需加载<br/>只加载需要的工具"]
END
ESSENTIAL --> CATEGORY
CATEGORY --> METADATA
METADATA --> SEARCH
SEARCH --> LOAD
```

**图表来源**
- [packages/common/src/ai/discovery/tool-metadata.ts:10-404](file://packages/common/src/ai/discovery/tool-metadata.ts#L10-L404)

**章节来源**
- [packages/common/src/ai/discovery/tool-metadata.ts:1-404](file://packages/common/src/ai/discovery/tool-metadata.ts#L1-L404)

#### 工具分类与描述
**详细的工具分类和描述**提供清晰的工具组织：
- **document-read分类**：文档读取工具 - 用于获取文档结构、内容和搜索
- **document-write分类**：文档写入工具 - 用于插入、更新和替换内容
- **document-delete分类**：文档删除工具 - 用于删除内容和块
- **document-structure分类**：结构工具 - 用于转换块类型、移动块、格式化文本、表格操作
- **layout分类**：布局工具 - 用于管理多列布局
- **interaction分类**：交互工具 - 用于与用户交互
- **web分类**：网络工具 - 用于网页搜索和获取
- **plugin分类**：插件工具 - 来自已安装插件的工具
- **discovery分类**：发现工具 - 用于发现和加载其他工具

**章节来源**
- [packages/common/src/ai/discovery/tool-metadata.ts:32-43](file://packages/common/src/ai/discovery/tool-metadata.ts#L32-L43)

### 技能生态系统

#### 技能市场集成（SkillsMP）
**全新的技能市场平台集成**，提供完整的技能生态系统：
- **SkillsMP客户端**：基于use-skillsmp.ts的React Hook，提供技能搜索、分类加载和分页功能
- **关键词搜索**：支持传统的关键词匹配搜索
- **AI语义搜索**：基于语义理解的智能搜索，提升搜索准确性
- **分类管理**：支持技能分类浏览和筛选
- **分页加载**：支持大数据量的分页加载和无限滚动
- **错误处理**：完善的错误处理和状态管理

```mermaid
graph TB
subgraph "SkillsMP客户端"
US["use-skillsmp Hook<br/>use-skillsmp.ts"]
SC["SkillsMP Client<br/>skillsMPClient"]
end
subgraph "技能市场API"
API["Skills API<br/>skills-api.md"]
end
subgraph "技能数据"
SK["技能列表<br/>SkillsMPSkill[]"]
CAT["分类列表<br/>SkillsMPCategory[]"]
STAT["状态管理<br/>loading/error/page"]
end
US --> SC
SC --> API
API --> SK
API --> CAT
US --> STAT
```

**图表来源**
- [packages/core/src/ai/skills/skillsmp/use-skillsmp.ts:1-190](file://packages/core/src/ai/skills/skillsmp/use-skillsmp.ts#L1-L190)
- [docs/api/skills-api.md:311-465](file://docs/api/skills-api.md#L311-L465)

**章节来源**
- [packages/core/src/ai/skills/skillsmp/use-skillsmp.ts:1-190](file://packages/core/src/ai/skills/skillsmp/use-skillsmp.ts#L1-L190)
- [docs/api/skills-api.md:1-777](file://docs/api/skills-api.md#L1-L777)

#### 技能注册表系统
**完整的技能生命周期管理**，支持技能的安装、卸载、启用/禁用和版本控制：
- **技能定义**：完整的技能元数据，包括名称、描述、版本、作者等
- **安装管理**：支持从市场安装和自定义技能安装
- **状态控制**：启用/禁用技能，控制技能的活跃状态
- **来源追踪**：区分市场技能、自定义技能和导入技能
- **依赖解析**：自动解析和加载技能所需的工具依赖
- **版本管理**：支持技能版本升级和兼容性检查

**章节来源**
- [docs/api/skills-api.md:13-58](file://docs/api/skills-api.md#L13-L58)

#### 工具提供商
**插件驱动的工具注册系统**，实现动态工具管理和性能优化：
- **动态注册**：支持插件在运行时注册新工具
- **工厂模式**：使用工厂函数创建工具实例
- **元数据管理**：自动为工具添加优先级和标签
- **分类注册**：按功能分类注册工具
- **描述增强**：为工具提供详细的描述信息
- **兼容性保证**：完全向后兼容现有工具

**章节来源**
- [packages/core/src/ai/TOOL_ADAPTATION_GUIDE.md:147-169](file://packages/core/src/ai/TOOL_ADAPTATION_GUIDE.md#L147-L169)

#### 工具系统架构
AI工具系统采用模块化设计，包含五大类工具模块，每类工具都有明确的职责分工：

- **读取工具（Read Tools）**：获取文档结构、分块读取内容、搜索文档、获取节点信息等
- **插入工具（Insert Tools）**：插入内容、更新标题、批量插入、替换内容等
- **删除工具（Delete Tools）**：按范围删除、按文本删除、按块删除等
- **列布局工具（Columns Tools）**：创建分栏、更新列内容、设置布局、添加/删除列、**嵌套列布局**
- **杂项工具（Misc Tools）**：用户选择确认、高亮标记、Web搜索、网页抓取等
- **格式化工具（Format Tools）**：文本格式化、表格操作、单元格编辑等

### 读取工具（Read Tools）
提供文档内容的读取和查询功能：

- getDocumentStructure：获取文档结构概览，包括大小、标题、块等信息
- readChunk：分块读取文档内容，支持上下文包含
- searchInDocument：在文档中搜索指定文本，返回精确位置信息
- getNodeAtPosition：获取指定位置的节点信息
- getDocumentSize：获取文档大小信息

**章节来源**
- [packages/core/src/ai/tools/read-tools.ts:1-208](file://packages/core/src/ai/tools/read-tools.ts#L1-L208)

### 插入工具（Insert Tools）
提供文档内容的插入和修改功能：

- updateTitle：更新文档标题（第一个块）
- write：插入文本到指定块的开头或末尾
- insertAtEnd：在文档末尾插入内容
- insertAtPosition：在指定位置插入内容
- insertAfterBlock：在指定块后插入新段落
- insertNear：在包含指定文本的块附近插入内容
- batchInsert：批量插入多个内容块
- replaceContent：搜索并替换内容
- insertSegmentedMarkdown：分段插入Markdown内容

**章节来源**
- [packages/core/src/ai/tools/insert-tools.ts:1-611](file://packages/core/src/ai/tools/insert-tools.ts#L1-L611)

### 删除工具（Delete Tools）
提供文档内容的删除功能：

- deleteRange：删除指定范围的内容
- deleteBySearch：通过搜索文本定位并删除内容
- deleteBlock：通过块索引删除整个块

**章节来源**
- [packages/core/src/ai/tools/delete-tools.ts:1-253](file://packages/core/src/ai/tools/delete-tools.ts#L1-L253)

### 列布局工具（Columns Tools）
提供分栏布局的创建和管理功能：

- insertColumns：插入分栏布局
- getColumnsInfo：获取分栏信息
- updateColumnContent：更新指定列的内容
- setColumnsLayout：设置分栏布局类型
- addColumnToLayout：向现有布局添加新列
- deleteColumn：删除指定列
- deleteColumnsLayout：删除整个分栏布局
- **insertNestedColumns：在已有分栏的指定列内插入嵌套分栏布局**

**章节来源**
- [packages/core/src/ai/tools/columns-tools.ts:1-616](file://packages/core/src/ai/tools/columns-tools.ts#L1-L616)

### 杂项工具（Misc Tools）
提供辅助功能和用户交互：

- askUserChoice：向用户询问选择（必须优先使用）
- highlight：高亮标记指定范围的文本
- webSearch：搜索互联网获取最新信息
- fetchWebPage：获取网页内容

**章节来源**
- [packages/core/src/ai/tools/misc-tools.ts:1-210](file://packages/core/src/ai/tools/misc-tools.ts#L1-L210)

### 工具包装器与类型系统
- **工具包装器**：wrapToolsWithCallback提供统一的工具执行跟踪和回调机制
- **类型系统**：完整的TypeScript类型定义，包括工具执行事件、用户选择请求、Web搜索结果等
- **工具上下文**：提供编辑器实例和用户选择回调的上下文环境

**章节来源**
- [packages/core/src/ai/utils/tool-wrapper.ts:1-68](file://packages/core/src/ai/utils/tool-wrapper.ts#L1-L68)
- [packages/core/src/ai/types.ts:1-166](file://packages/core/src/ai/types.ts#L1-L166)

### Markdown解析器
提供完整的Markdown语法解析和转换功能：

- parseMarkdownToNodes：将Markdown转换为ProseMirror兼容的JSON节点
- parseInlineMarkdown：解析内联Markdown格式（粗体、斜体、代码、链接等）
- contentItemsToNodes：将内容项转换为ProseMirror节点
- 表格支持：完整的表格解析和创建功能

**章节来源**
- [packages/core/src/ai/utils/markdown-parser.ts:1-458](file://packages/core/src/ai/utils/markdown-parser.ts#L1-L458)

### Web搜索功能
集成多种搜索源，提供高质量的外部信息获取：

- performWebSearch：支持Bocha API、后端API、DuckDuckGo等多种搜索源
- fetchWebPage：获取网页内容，支持纯文本提取
- 多级降级：主搜索失败时自动尝试其他搜索源

**章节来源**
- [packages/core/src/ai/utils/web-search.ts:1-172](file://packages/core/src/ai/utils/web-search.ts#L1-L172)

## AI内联助手系统

### 浮动面板界面
**全新的AI内联助手系统**提供直观的浮动面板界面：
- **Ask AI按钮**：在气泡菜单中提供Ask AI按钮，捕获用户选中文本并触发面板
- **浮动面板设计**：固定尺寸320px，支持动画入场效果，提供沉浸式交互体验
- **头部信息**：显示Ask AI标识和选中文本的简要预览
- **输入区域**：支持多行文本输入，支持Enter快捷键提交
- **提交按钮**：根据输入状态动态启用/禁用
- **内容区域**：支持步骤跟踪、流式响应和错误提示的显示

```mermaid
graph TB
subgraph "AI内联助手界面"
TR["触发器<br/>AiInlineTrigger"]
PL["浮动面板<br/>AiInlinePanel"]
HD["头部区域<br/>Ask AI + 选中文本"]
IN["输入区域<br/>多行文本框 + 提交按钮"]
CT["内容区域<br/>步骤 + 响应 + 错误"]
CL["关闭按钮<br/>X图标"]
end
TR --> PL
PL --> HD
PL --> IN
PL --> CT
PL --> CL
```

**图表来源**
- [packages/core/src/ai/AiInlineMenu.tsx:77-115](file://packages/core/src/ai/AiInlineMenu.tsx#L77-L115)
- [packages/core/src/ai/AiInlineMenu.tsx:119-435](file://packages/core/src/ai/AiInlineMenu.tsx#L119-L435)

**章节来源**
- [packages/core/src/ai/AiInlineMenu.tsx:77-115](file://packages/core/src/ai/AiInlineMenu.tsx#L77-L115)
- [packages/core/src/ai/AiInlineMenu.tsx:119-435](file://packages/core/src/ai/AiInlineMenu.tsx#L119-L435)

### 实时流式响应
**优化的流式文本渲染**确保流畅的用户体验：
- **流式缓冲机制**：使用requestAnimationFrame优化渲染性能，约16fps刷新率
- **增量更新**：逐块接收流式文本，实时更新显示内容
- **动画效果**：Streamdown组件提供文本动画效果，增强视觉体验
- **中断处理**：支持AbortError处理，优雅中断流式响应
- **性能优化**：通过缓冲区和RAF机制避免频繁DOM更新

**章节来源**
- [packages/core/src/ai/AiInlineMenu.tsx:147-171](file://packages/core/src/ai/AiInlineMenu.tsx#L147-L171)
- [packages/core/src/ai/AiInlineMenu.tsx:294-313](file://packages/core/src/ai/AiInlineMenu.tsx#L294-L313)

### 执行步骤跟踪
**完整的工具执行可视化**帮助用户理解AI操作过程：
- **步骤记录**：实时记录工具执行状态（运行中/成功/失败）
- **参数显示**：显示工具名称和执行参数
- **耗时统计**：记录每个工具的执行耗时
- **状态指示**：使用不同图标表示执行状态
- **历史记录**：维护完整的执行历史，支持查看和调试

**章节来源**
- [packages/core/src/ai/AiInlineMenu.tsx:11-19](file://packages/core/src/ai/AiInlineMenu.tsx#L11-L19)
- [packages/core/src/ai/AiInlineMenu.tsx:174-200](file://packages/core/src/ai/AiInlineMenu.tsx#L174-L200)

### 用户选择提示
**智能的用户交互处理**确保AI操作的准确性和可控性：
- **选择请求处理**：通过handleUserChoiceRequest处理用户选择请求
- **默认选项**：在有可用选项时自动选择第一个选项
- **交互支持**：支持用户自定义输入和选项选择
- **错误处理**：处理用户选择失败的情况

**章节来源**
- [packages/core/src/ai/AiInlineMenu.tsx:202-206](file://packages/core/src/ai/AiInlineMenu.tsx#L202-L206)

### 虚拟选中高亮
**增强的选中文本可视化**提供更好的上下文感知：
- **装饰插件**：使用aiSelectionKey创建虚拟选中高亮装饰
- **状态管理**：通过setVirtualSelection控制高亮状态
- **样式定制**：提供半透明背景色和圆角边框
- **生命周期管理**：在组件卸载时自动清理装饰

**章节来源**
- [packages/core/src/ai/AiInlineMenu.tsx:35-73](file://packages/core/src/ai/AiInlineMenu.tsx#L35-L73)

### 事件驱动架构
**基于事件的触发机制**实现松耦合的组件通信：
- **自定义事件**：使用AI_INLINE_EVENT实现触发器与面板的通信
- **位置计算**：根据选中文本位置动态计算面板显示位置
- **边界检测**：自动调整面板位置避免超出屏幕边界
- **焦点管理**：保持编辑器焦点，确保选中状态持续有效

**章节来源**
- [packages/core/src/ai/AiInlineMenu.tsx:28-28](file://packages/core/src/ai/AiInlineMenu.tsx#L28-L28)
- [packages/core/src/ai/AiInlineMenu.tsx:211-243](file://packages/core/src/ai/AiInlineMenu.tsx#L211-L243)

## 增强的列管理工具

### 嵌套列布局支持
**全新的嵌套列布局功能**实现复杂的文档结构：
- **insertNestedColumns工具**：在现有分栏的指定列内插入嵌套分栏布局
- **深度追踪**：支持多层级嵌套，通过depth和parentPath追踪嵌套关系
- **位置计算**：精确定位目标列的位置，支持开头和末尾插入
- **滚动定位**：插入后自动滚动到新位置，提供视觉反馈
- **索引更新**：重新发现文档结构，获取更新后的嵌套列索引

```mermaid
graph TB
subgraph "嵌套列布局"
COL["父分栏<br/>columns"]
SUB["子分栏<br/>nested columns"]
POS["插入位置<br/>start/end"]
CALC["位置计算<br/>columnPos + contentStart/End"]
INS["插入操作<br/>insertContentAt"]
SCROLL["滚动定位<br/>scrollToPosition"]
END["完成<br/>返回嵌套信息"]
end
COL --> SUB
SUB --> POS
POS --> CALC
CALC --> INS
INS --> SCROLL
SCROLL --> END
```

**图表来源**
- [packages/core/src/ai/tools/columns-tools.ts:520-616](file://packages/core/src/ai/tools/columns-tools.ts#L520-L616)

**章节来源**
- [packages/core/src/ai/tools/columns-tools.ts:520-616](file://packages/core/src/ai/tools/columns-tools.ts#L520-L616)

### 增强的列信息追踪
**改进的列结构分析**提供更详细的列布局信息：
- **嵌套深度**：通过depth属性追踪嵌套层级（0=顶层，1=一级嵌套...）
- **父路径追踪**：使用parentPath记录父分栏路径，支持多级嵌套导航
- **全局索引**：保持向后兼容的全局扁平索引
- **布局信息**：包含列数、布局类型和位置信息
- **实时更新**：插入嵌套列后重新发现文档结构

**章节来源**
- [packages/core/src/ai/tools/columns-tools.ts:11-19](file://packages/core/src/ai/tools/columns-tools.ts#L11-L19)
- [packages/core/src/ai/tools/columns-tools.ts:591-598](file://packages/core/src/ai/tools/columns-tools.ts#L591-L598)

### 编辑器效果工具
**新增的编辑器操作工具**提升用户体验：
- **scrollToPosition工具**：滚动编辑器视口到指定位置
- **视觉反馈**：设置文本选择以提供视觉提示
- **边界保护**：确保位置在文档范围内
- **平滑滚动**：自动滚动到目标位置

**章节来源**
- [packages/core/src/ai/utils/editor-effects.ts:1-12](file://packages/core/src/ai/utils/editor-effects.ts#L1-L12)

### 工具元数据增强
**改进的工具元数据系统**支持嵌套列功能：
- **新增工具元数据**：insertNestedColumns工具的元数据定义
- **分类标识**：归类为layout分类，支持嵌套布局操作
- **优先级设置**：设置为5的优先级，平衡重要性和使用频率
- **标签系统**：包含columns、nested、layout、insert标签
- **来源追踪**：标记为builtin来源，支持内置工具识别

**章节来源**
- [packages/common/src/ai/discovery/tool-metadata.ts:208-215](file://packages/common/src/ai/discovery/tool-metadata.ts#L208-L215)

## UI组件系统

### Chat.tsx 聊天组件
**现代化的聊天界面**提供完整的用户交互体验：
- **ExpandableChat容器**：提供可展开的聊天界面，支持不同尺寸和图标
- **消息列表**：使用ChatMessageList组件展示消息历史
- **流式渲染**：通过use-streaming-buffer实现requestAnimationFrame优化的流式文本渲染
- **执行步骤显示**：实时显示工具执行状态和结果
- **错误处理**：提供友好的错误提示和重试机制
- **会话管理**：支持持久化的会话和对话ID管理
- **团队状态可视化**：显示AgentTeam的状态和进度
- **快速提示**：提供常用操作的快捷提示
- **用户选择对话框**：处理用户选择请求，支持自定义输入

```mermaid
graph TB
subgraph "Chat.tsx组件树"
EXP["ExpandableChat容器"]
HDR["ExpandableChatHeader头部"]
BODY["ExpandableChatBody主体"]
FOOT["ExpandableChatFooter底部"]
MSG["消息列表ChatMessageList"]
BUF["流式缓冲use-streaming-buffer"]
STEP["执行步骤ExecutionStepsDisplay"]
ERR["错误显示ErrorDisplay"]
TEAM["团队状态TeamStatusPanel"]
QUICK["快速提示QuickPrompts"]
SEL["用户选择对话框"]
end
EXP --> HDR
EXP --> BODY
EXP --> FOOT
BODY --> TEAM
BODY --> MSG
MSG --> BUF
MSG --> STEP
MSG --> ERR
MSG --> QUICK
MSG --> SEL
```

**图表来源**
- [packages/plugin-ai/src/ai/menu/Chat.tsx:307-634](file://packages/plugin-ai/src/ai/menu/Chat.tsx#L307-L634)

**章节来源**
- [packages/plugin-ai/src/ai/menu/Chat.tsx:1-636](file://packages/plugin-ai/src/ai/menu/Chat.tsx#L1-L636)

### MessageBubble.tsx 消息气泡组件
**增强的消息显示组件**提供丰富的交互功能：
- **流式文本显示**：使用Streamdown组件提供动画效果
- **复制功能**：支持消息内容复制，提供视觉反馈
- **时间戳显示**：显示相对时间，支持用户悬停查看更多信息
- **停止状态指示**：显示生成停止状态
- **执行步骤显示**：对于AI消息显示工具执行步骤
- **记忆化优化**：使用React.memo避免不必要的重渲染

**章节来源**
- [packages/plugin-ai/src/ai/menu/MessageBubble.tsx:1-82](file://packages/plugin-ai/src/ai/menu/MessageBubble.tsx#L1-L82)

### use-streaming-buffer.ts 流式缓冲钩子
**优化的流式渲染机制**确保流畅的用户体验：
- **requestAnimationFrame优化**：每帧渲染一次，约16fps刷新率
- **缓冲区管理**：使用缓冲区累积文本片段，避免频繁DOM更新
- **强制刷新**：forceFlush确保流式气泡可见
- **内存管理**：自动清理动画帧请求，避免内存泄漏
- **内容获取**：提供getContent方法获取当前缓冲内容

**章节来源**
- [packages/plugin-ai/src/ai/menu/use-streaming-buffer.ts:1-63](file://packages/plugin-ai/src/ai/menu/use-streaming-buffer.ts#L1-L63)

### ExecutionStepsDisplay.tsx 执行步骤显示组件
**完整的工具执行可视化**提供详细的执行信息：
- **已完成步骤**：使用Collapsible组件显示可折叠的执行步骤
- **运行中步骤**：实时显示正在执行的工具和状态
- **状态图标**：使用不同图标表示执行状态（运行中/成功/失败）
- **耗时统计**：显示每个工具的执行耗时
- **参数显示**：显示工具调用参数（截断显示）
- **格式化工具名**：将驼峰命名转换为可读格式

**章节来源**
- [packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx:1-110](file://packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx#L1-L110)

### ErrorDisplay.tsx 错误显示组件
**友好的错误处理界面**提供清晰的错误信息：
- **错误类型图标**：根据不同错误类型显示相应图标
- **重试功能**：提供可重试的错误类型重试按钮
- **消失功能**：提供错误消失按钮
- **错误分类**：支持网络、认证、速率限制、超时、服务器等错误类型
- **可重试判断**：根据错误类型决定是否显示重试按钮

**章节来源**
- [packages/plugin-ai/src/ai/menu/ErrorDisplay.tsx:1-57](file://packages/plugin-ai/src/ai/menu/ErrorDisplay.tsx#L1-L57)

### QuickPrompts.tsx 快速提示组件
**便捷的操作入口**提供常用功能的快捷访问：
- **预设提示**：提供创建自定义代理、数据分析、图表创建、数据过滤等预设提示
- **图标标识**：使用相应图标标识不同类型的提示
- **徽章标识**：新功能使用"New"徽章标识
- **一键提交**：点击即可提交对应的提示内容
- **响应式设计**：适配不同屏幕尺寸

**章节来源**
- [packages/plugin-ai/src/ai/menu/QuickPrompts.tsx:1-51](file://packages/plugin-ai/src/ai/menu/QuickPrompts.tsx#L1-L51)

### TeamStatusPanel.tsx 团队状态面板
**AgentTeam状态可视化**提供团队协作的实时状态：
- **阶段指示器**：显示当前执行阶段（规划、组装团队、执行、合成结果、完成）
- **编排消息**：显示Agent的思考和工具调用状态
- **成员网格**：显示团队成员的状态和子任务
- **状态颜色**：使用不同颜色标识成员状态（等待、运行中、完成、错误）
- **错误详情**：显示错误状态下的详细信息

**章节来源**
- [packages/plugin-ai/src/ai/menu/TeamStatusPanel.tsx:1-125](file://packages/plugin-ai/src/ai/menu/TeamStatusPanel.tsx#L1-L125)

### useTeamStatus.ts 团队状态钩子
**状态管理钩子**处理AgentTeam注解事件：
- **注解解析**：解析AgentTeam注解事件，映射到团队状态
- **兼容性支持**：支持规范对齐的注解事件和传统团队状态事件
- **状态更新**：实时更新团队成员状态和阶段信息
- **初始状态**：提供createInitialTeamState函数创建初始状态
- **事件映射**：将不同事件类型映射到相应的状态更新逻辑

**章节来源**
- [packages/plugin-ai/src/ai/menu/useTeamStatus.ts:1-138](file://packages/plugin-ai/src/ai/menu/useTeamStatus.ts#L1-L138)

### useSessionManager.ts 会话管理钩子
**持久化会话管理**提供会话和对话ID的管理：
- **会话ID存储**：使用localStorage存储会话ID和时间戳
- **对话ID存储**：存储对话ID以便关联消息
- **TTL过期处理**：会话30分钟自动过期清理
- **注解解析**：解析注解数据中的会话信息
- **会话保存**：保存新的会话和对话ID

**章节来源**
- [packages/plugin-ai/src/ai/menu/useSessionManager.ts:1-92](file://packages/plugin-ai/src/ai/menu/useSessionManager.ts#L1-L92)

### chat-persistence.ts 聊天持久化
**消息持久化管理**提供聊天历史的存储和检索：
- **本地存储**：使用localStorage存储聊天消息
- **消息限制**：最多存储50条消息，避免存储空间过大
- **AI历史限制**：最多保留20条AI相关消息
- **令牌预算**：AI上下文最多8000个令牌
- **令牌估算**：按字符数估算令牌数量（约4字符/令牌）

**章节来源**
- [packages/plugin-ai/src/ai/menu/chat-persistence.ts:1-66](file://packages/plugin-ai/src/ai/menu/chat-persistence.ts#L1-L66)

### chat-types.ts 类型定义
**完整的类型系统**定义聊天相关的所有类型：
- **消息类型**：Message接口定义消息的基本结构
- **执行步骤类型**：ExecutionStep接口定义工具执行步骤
- **用户选择类型**：PendingUserChoice接口定义用户选择状态
- **错误类型**：ChatError接口定义错误分类和信息
- **团队状态类型**：TeamState和TeamMember接口定义团队状态
- **注解事件类型**：定义AgentTeam注解事件的完整类型系统
- **会话类型**：SessionInfo接口定义会话信息
- **工具名格式化**：提供工具名格式化函数

**章节来源**
- [packages/plugin-ai/src/ai/menu/chat-types.ts:1-250](file://packages/plugin-ai/src/ai/menu/chat-types.ts#L1-L250)

## 依赖关系分析
- **内部依赖**
  - 插件入口依赖编辑器扩展与本地化资源
  - 节点扩展依赖React节点视图与工具函数
  - 工具函数依赖核心AI工具库与编辑器命令链
  - 加载装饰器扩展依赖编辑器插件系统与React渲染器
  - 标记扩展依赖编辑器Mark系统
  - **优化代理系统依赖完整的工具系统和工具包装器**
  - **AI设置面板依赖UI组件库和状态管理**
  - **AI内联助手系统依赖编辑器效果工具和工具元数据**
  - **AI助手面板依赖系统代理和工具调用可视化**
  - **格式化工具系统依赖ProseMirror编辑器和工具元数据**
  - **技能生态系统依赖SkillsMP客户端和API服务**
  - **技能注册表依赖技能API和存储系统**
  - **UI组件系统依赖现代化的React Hooks和状态管理**

- **外部依赖**
  - 插件包依赖 common、core、editor、ui、icon 等工作区包
  - 核心AI工具库依赖 @ai-sdk/deepseek 与 ai 流式生成库
  - **工具系统依赖zod进行输入验证，ProseMirror进行文档操作**
  - **环境变量依赖VITE_AI_IMAGE_API_KEY进行API密钥配置**
  - **技能生态系统依赖Skills API和SkillsMP平台**
  - **UI组件系统依赖现代化的React生态系统**

```mermaid
graph LR
A["插件入口<br/>index.tsx"] --> B["AI节点扩展<br/>ai.ts / ai-image.ts"]
B --> C["React节点视图<br/>AiView.tsx / AiImageView.tsx"]
C --> D["工具函数<br/>utils.ts"]
D --> E["核心AI工具库<br/>ai-utils.ts"]
C --> F["加载装饰器扩展<br/>text-loading.tsx"]
C --> G["加载标记扩展<br/>loading-mark.tsx"]
A --> H["插件管理器<br/>PluginManager.ts"]
H --> I["扩展解析<br/>use-extension.ts"]
I --> J["内置扩展集合<br/>build-in-extension.ts"]
K["静态菜单<br/>AiStaticMenu.tsx"] --> A
L["聊天视图<br/>Chat.tsx"] --> A
M["优化代理系统<br/>use-agent-optimized.tsx"] --> N["工具系统<br/>tools/*"]
N --> O["Markdown解析器<br/>markdown-parser.ts"]
N --> P["Web搜索<br/>web-search.ts"]
N --> Q["工具包装器<br/>tool-wrapper.ts"]
R["工具库<br/>utils/*"] --> N
S["AI设置面板<br/>AISettings.tsx"] --> T["UI组件库<br/>@kn/ui"]
S --> U["状态管理<br/>ahooks"]
S --> V["环境变量<br/>VITE_AI_IMAGE_API_KEY"]
W["SkillsMP集成<br/>use-skillsmp.ts"] --> X["Skills API<br/>skills-api.md"]
Y["技能注册表<br/>技能生命周期"] --> W
Z["渐进式工具发现<br/>PROGRESSIVE_TOOL_DISCOVERY"] --> N
AA["AI内联助手<br/>AiInlineMenu.tsx"] --> BB["编辑器效果工具<br/>editor-effects.ts"]
AA --> CC["工具元数据<br/>tool-metadata.ts"]
DD["嵌套列工具<br/>insertNestedColumns"] --> AA
EE["格式化工具<br/>format-tools.ts"] --> FF["ProseMirror编辑器<br/>@kn/editor"]
EE --> GG["工具元数据<br/>tool-metadata.ts"]
HH["AI助手面板<br/>AIAssistantPanel.tsx"] --> II["系统代理<br/>use-system-agent"]
II --> JJ["工具调用可视化<br/>ExecutionStepsDisplay.tsx"]
KK["UI组件系统<br/>Chat.tsx / MessageBubble.tsx"] --> FF
KK --> GG
KK --> HH
KK --> II
LL["流式缓冲<br/>use-streaming-buffer.ts"] --> FF
MM["执行步骤显示<br/>ExecutionStepsDisplay.tsx"] --> FF
NN["错误显示<br/>ErrorDisplay.tsx"] --> FF
OO["团队状态<br/>TeamStatusPanel.tsx"] --> FF
PP["会话管理<br/>useSessionManager.ts"] --> FF
QQ["聊天持久化<br/>chat-persistence.ts"] --> FF
RR["类型定义<br/>chat-types.ts"] --> FF
```

**图表来源**
- [packages/plugin-ai/src/index.tsx:1-35](file://packages/plugin-ai/src/index.tsx#L1-L35)
- [packages/plugin-ai/src/ai/ai.ts:1-55](file://packages/plugin-ai/src/ai/ai.ts#L1-L55)
- [packages/plugin-ai/src/ai/ai-image.ts:1-37](file://packages/plugin-ai/src/ai/ai-image.ts#L1-L37)
- [packages/plugin-ai/src/ai/AiView.tsx:1-76](file://packages/plugin-ai/src/ai/AiView.tsx#L1-L76)
- [packages/plugin-ai/src/ai/AiImageView.tsx:1-69](file://packages/plugin-ai/src/ai/AiImageView.tsx#L1-L69)
- [packages/plugin-ai/src/ai/utils.ts:1-126](file://packages/plugin-ai/src/ai/utils.ts#L1-L126)
- [packages/plugin-ai/src/ai/text-loading.tsx:1-146](file://packages/plugin-ai/src/ai/text-loading.tsx#L1-L146)
- [packages/plugin-ai/src/ai/marks/loading-mark.tsx:1-36](file://packages/plugin-ai/src/ai/marks/loading-mark.tsx#L1-L36)
- [packages/plugin-ai/src/ai/menu/AiStaticMenu.tsx:1-48](file://packages/plugin-ai/src/ai/menu/AiStaticMenu.tsx#L1-L48)
- [packages/plugin-ai/src/ai/menu/Chat.tsx:1-636](file://packages/plugin-ai/src/ai/menu/Chat.tsx#L1-L636)
- [packages/plugin-ai/src/ai/AISettings.tsx:1-182](file://packages/plugin-ai/src/ai/AISettings.tsx#L1-L182)
- [packages/common/src/core/PluginManager.ts:1-177](file://packages/common/src/core/PluginManager.ts#L1-L177)
- [packages/editor/src/editor/use-extension.ts:47-63](file://packages/editor/src/editor/use-extension.ts#L47-L63)
- [packages/editor/src/editor/build-in-extension.ts:1-56](file://packages/editor/src/editor/build-in-extension.ts#L1-L56)
- [packages/core/src/ai/use-agent-optimized.tsx:1-223](file://packages/core/src/ai/use-agent-optimized.tsx#L1-L223)
- [packages/core/src/ai/tools/read-tools.ts:1-208](file://packages/core/src/ai/tools/read-tools.ts#L1-L208)
- [packages/core/src/ai/utils/markdown-parser.ts:1-458](file://packages/core/src/ai/utils/markdown-parser.ts#L1-L458)
- [packages/core/src/ai/utils/web-search.ts:1-172](file://packages/core/src/ai/utils/web-search.ts#L1-L172)
- [packages/core/src/ai/utils/tool-wrapper.ts:1-68](file://packages/core/src/ai/utils/tool-wrapper.ts#L1-L68)
- [packages/core/src/ai/skills/skillsmp/use-skillsmp.ts:1-190](file://packages/core/src/ai/skills/skillsmp/use-skillsmp.ts#L1-L190)
- [docs/api/skills-api.md:1-777](file://docs/api/skills-api.md#L1-L777)
- [packages/core/src/ai/AiInlineMenu.tsx:1-435](file://packages/core/src/ai/AiInlineMenu.tsx#L1-L435)
- [packages/core/src/ai/utils/editor-effects.ts:1-12](file://packages/core/src/ai/utils/editor-effects.ts#L1-L12)
- [packages/common/src/ai/discovery/tool-metadata.ts:268-275](file://packages/common/src/ai/discovery/tool-metadata.ts#L268-L275)
- [packages/plugin-ai/src/ai/menu/use-streaming-buffer.ts:1-63](file://packages/plugin-ai/src/ai/menu/use-streaming-buffer.ts#L1-L63)
- [packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx:1-110](file://packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx#L1-L110)
- [packages/plugin-ai/src/ai/menu/ErrorDisplay.tsx:1-57](file://packages/plugin-ai/src/ai/menu/ErrorDisplay.tsx#L1-L57)
- [packages/plugin-ai/src/ai/menu/TeamStatusPanel.tsx:1-125](file://packages/plugin-ai/src/ai/menu/TeamStatusPanel.tsx#L1-L125)
- [packages/plugin-ai/src/ai/menu/useSessionManager.ts:1-92](file://packages/plugin-ai/src/ai/menu/useSessionManager.ts#L1-L92)
- [packages/plugin-ai/src/ai/menu/chat-persistence.ts:1-66](file://packages/plugin-ai/src/ai/menu/chat-persistence.ts#L1-L66)
- [packages/plugin-ai/src/ai/menu/chat-types.ts:1-250](file://packages/plugin-ai/src/ai/menu/chat-types.ts#L1-L250)
- [packages/core/src/ai/tools/format-tools.ts:1-505](file://packages/core/src/ai/tools/format-tools.ts#L1-L505)
- [packages/core/src/ai/system-agent/AIAssistantPanel.tsx:1-538](file://packages/core/src/ai/system-agent/AIAssistantPanel.tsx#L1-L538)

**章节来源**
- [packages/plugin-ai/package.json:1-31](file://packages/plugin-ai/package.json#L1-L31)
- [packages/plugin-ai/src/index.tsx:1-35](file://packages/plugin-ai/src/index.tsx#L1-L35)
- [packages/plugin-ai/src/ai/utils.ts:1-126](file://packages/plugin-ai/src/ai/utils.ts#L1-L126)
- [packages/core/src/ai/ai-utils.ts:1-20](file://packages/core/src/ai/ai-utils.ts#L1-L20)
- [packages/core/src/ai/use-agent-optimized.tsx:1-223](file://packages/core/src/ai/use-agent-optimized.tsx#L1-L223)

## 性能与可用性建议
- **流式渲染优化**
  - 对长文本生成采用增量更新策略，避免一次性插入导致的重排压力
  - 合理控制装饰器的DOM数量，避免过多widget节点影响滚动性能
  - **AI内联助手使用requestAnimationFrame优化流式渲染性能**
  - **集成渐进式工具发现，减少工具加载数量**
  - **UI组件系统使用React.memo优化重渲染性能**
  - **流式缓冲机制确保16fps的稳定刷新率**
  - **格式化工具系统使用精确的文本定位和滚动机制**
  - 参考路径：[packages/plugin-ai/src/ai/text-loading.tsx:1-146](file://packages/plugin-ai/src/ai/text-loading.tsx#L1-L146), [packages/plugin-ai/src/ai/AiView.tsx:1-76](file://packages/plugin-ai/src/ai/AiView.tsx#L1-L76), [packages/core/src/ai/AiInlineMenu.tsx:147-171](file://packages/core/src/ai/AiInlineMenu.tsx#L147-L171), [packages/plugin-ai/src/ai/menu/use-streaming-buffer.ts:10-62](file://packages/plugin-ai/src/ai/menu/use-streaming-buffer.ts#L10-L62)

- **并发与节流**
  - 在同一编辑器中限制同时进行的生成任务数量，防止UI卡顿与网络拥塞
  - 对图像生成接口调用进行去抖/节流，避免频繁请求
  - **对工具调用进行并发控制，避免多个工具同时操作文档导致冲突**
  - **使用技能注册表管理技能数量，避免技能过多影响性能**
  - **AI内联助手支持流式响应中断，避免长时间占用资源**
  - **UI组件系统使用状态管理避免不必要的重渲染**
  - **格式化工具系统使用精确的编辑器操作，避免不必要的重排**
  - 参考路径：[packages/plugin-ai/src/ai/utils.ts:1-126](file://packages/plugin-ai/src/ai/utils.ts#L1-L126), [packages/core/src/ai/AiInlineMenu.tsx:301-313](file://packages/core/src/ai/AiInlineMenu.tsx#L301-L313), [packages/plugin-ai/src/ai/menu/Chat.tsx:117-246](file://packages/plugin-ai/src/ai/menu/Chat.tsx#L117-L246)

- **工具系统优化**
  - 使用分块读取功能处理大文档，避免一次性读取造成内存压力
  - 合理使用Markdown解析器的分段插入功能，避免大量内容一次性处理
  - Web搜索结果数量限制，避免过多结果影响性能
  - **利用渐进式工具发现的按需加载机制，减少工具初始化开销**
  - **通过技能提供商的分类管理，减少技能搜索时间**
  - **嵌套列布局使用深度追踪和父路径机制，避免索引混乱**
  - **UI组件系统使用useMemo和React.memo优化性能**
  - **格式化工具系统使用精确的文本定位和表格操作，提升性能**
  - 参考路径：[packages/core/src/ai/tools/read-tools.ts:1-208](file://packages/core/src/ai/tools/read-tools.ts#L1-L208), [packages/core/src/ai/tools/insert-tools.ts:1-611](file://packages/core/src/ai/tools/insert-tools.ts#L1-L611), [packages/core/src/ai/utils/web-search.ts:1-172](file://packages/core/src/ai/utils/web-search.ts#L1-L172), [packages/core/src/ai/tools/columns-tools.ts:11-19](file://packages/core/src/ai/tools/columns-tools.ts#L11-L19)

- **技能生态系统优化**
  - 使用技能注册表的缓存机制，避免重复加载相同技能
  - 通过SkillsMP的分类和标签系统，精准定位所需技能
  - 利用工具提供商的工厂模式，延迟创建工具实例
  - **AI内联助手的工具执行步骤跟踪，便于性能监控和调试**
  - **UI组件系统提供完整的错误处理和用户反馈机制**
  - **格式化工具系统提供精确的表格操作和文本格式化**
  - 参考路径：[docs/api/skills-api.md:653-731](file://docs/api/skills-api.md#L653-L731), [packages/core/src/ai/skills/skillsmp/use-skillsmp.ts:1-190](file://packages/core/src/ai/skills/skillsmp/use-skillsmp.ts#L1-L190), [packages/core/src/ai/AiInlineMenu.tsx:174-200](file://packages/core/src/ai/AiInlineMenu.tsx#L174-L200)

- **错误恢复**
  - 对图像生成失败场景提供明确提示与重试入口；对流式文本生成异常中断时保留已生成片段
  - **AI内联助手支持AbortError处理，优雅中断流式响应**
  - **工具执行失败时提供详细的错误信息和回滚机制**
  - **技能加载失败时提供降级方案和错误提示**
  - **UI组件系统提供友好的错误提示和重试机制**
  - **格式化工具系统提供精确的错误处理和回退机制**
  - 参考路径：[packages/plugin-ai/src/ai/AiImageView.tsx:1-69](file://packages/plugin-ai/src/ai/AiImageView.tsx#L1-L69), [packages/core/src/ai/AiInlineMenu.tsx:301-313](file://packages/core/src/ai/AiInlineMenu.tsx#L301-L313), [packages/plugin-ai/src/ai/menu/ErrorDisplay.tsx:1-57](file://packages/plugin-ai/src/ai/menu/ErrorDisplay.tsx#L1-L57)

- **本地化与可访问性**
  - 保持多语言文案一致；为生成按钮与装饰器提供可读性标签
  - **工具系统提供完整的错误提示和用户反馈机制**
  - **技能生态系统提供多语言支持和本地化资源**
  - **AI内联助手提供键盘快捷键支持（Esc关闭）**
  - **UI组件系统提供无障碍访问支持**
  - **格式化工具系统提供精确的用户交互和反馈**
  - 参考路径：[packages/plugin-ai/src/index.tsx:1-35](file://packages/plugin-ai/src/index.tsx#L1-L35), [packages/core/src/ai/AiInlineMenu.tsx:256-261](file://packages/core/src/ai/AiInlineMenu.tsx#L256-L261), [packages/plugin-ai/src/ai/menu/Chat.tsx:34-40](file://packages/plugin-ai/src/ai/menu/Chat.tsx#L34-L40)

- **安全配置建议**
  - **移除了硬编码的DeepSeek API密钥，建议通过环境变量进行配置**
  - 使用AI设置面板进行API密钥的安全存储和管理
  - 定期轮换API密钥，避免长期使用同一密钥
  - **通过技能注册表管理技能密钥，避免技能泄露**
  - **AI内联助手支持用户选择处理，避免自动决策风险**
  - **UI组件系统提供安全的用户输入验证和处理**
  - **格式化工具系统提供精确的编辑器操作和安全验证**
  - 参考路径：[packages/plugin-ai/src/ai/AISettings.tsx:1-182](file://packages/plugin-ai/src/ai/AISettings.tsx#L1-L182), [packages/plugin-ai/src/ai/utils.ts:6-10](file://packages/plugin-ai/src/ai/utils.ts#L6-L10), [packages/core/src/ai/ai-utils.ts:5-7](file://packages/core/src/ai/ai-utils.ts#L5-L7), [packages/core/src/ai/AiInlineMenu.tsx:202-206](file://packages/core/src/ai/AiInlineMenu.tsx#L202-L206)

- **UI组件性能优化**
  - **使用React.memo优化组件重渲染**
  - **使用useCallback和useMemo稳定回调和计算结果**
  - **使用requestAnimationFrame优化动画性能**
  - **使用Collapsible组件优化折叠内容的渲染**
  - **使用TooltipProvider优化工具提示的性能**
  - **使用状态管理避免不必要的重渲染**
  - **格式化工具系统使用精确的编辑器操作，避免不必要的重排**
  - 参考路径：[packages/plugin-ai/src/ai/menu/MessageBubble.tsx:16-81](file://packages/plugin-ai/src/ai/menu/MessageBubble.tsx#L16-L81), [packages/plugin-ai/src/ai/menu/Chat.tsx:42-636](file://packages/plugin-ai/src/ai/menu/Chat.tsx#L42-L636), [packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx:10-110](file://packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx#L10-L110)

## 故障排查指南
- **文本生成无响应**
  - 检查是否正确切换"生成中"装饰器；确认流式生成回调是否被调用
  - 参考路径：[packages/plugin-ai/src/ai/text-loading.tsx:1-146](file://packages/plugin-ai/src/ai/text-loading.tsx#L1-L146), [packages/plugin-ai/src/ai/AiView.tsx:1-76](file://packages/plugin-ai/src/ai/AiView.tsx#L1-L76)

- **图像生成失败**
  - 检查网络请求头与鉴权信息；确认返回体结构与错误字段
  - **检查VITE_AI_IMAGE_API_KEY环境变量配置是否正确**
  - 参考路径：[packages/plugin-ai/src/ai/utils.ts:1-126](file://packages/plugin-ai/src/ai/utils.ts#L1-L126), [packages/plugin-ai/src/ai/AiImageView.tsx:1-69](file://packages/plugin-ai/src/ai/AiImageView.tsx#L1-L69)

- **工具执行失败**
  - 检查工具输入参数的有效性；确认工具执行回调是否正常触发
  - 查看工具包装器提供的详细错误信息和执行时间
  - **检查技能依赖是否正确加载，工具是否在技能中定义**
  - **AI内联助手的执行步骤跟踪，查看具体失败的工具和参数**
  - **UI组件系统提供详细的错误分类和处理**
  - **格式化工具系统提供精确的错误信息和回退机制**
  - 参考路径：[packages/core/src/ai/utils/tool-wrapper.ts:1-68](file://packages/core/src/ai/utils/tool-wrapper.ts#L1-L68), [packages/core/src/ai/tools/read-tools.ts:1-208](file://packages/core/src/ai/tools/read-tools.ts#L1-L208), [packages/core/src/ai/AiInlineMenu.tsx:174-200](file://packages/core/src/ai/AiInlineMenu.tsx#L174-L200), [packages/plugin-ai/src/ai/menu/ErrorDisplay.tsx:1-57](file://packages/plugin-ai/src/ai/menu/ErrorDisplay.tsx#L1-L57)

- **Markdown解析问题**
  - 检查Markdown格式的正确性；确认解析器的分段处理逻辑
  - 参考路径：[packages/core/src/ai/utils/markdown-parser.ts:1-458](file://packages/core/src/ai/utils/markdown-parser.ts#L1-L458)

- **Web搜索失败**
  - 检查网络连接和API密钥配置；确认备用搜索源是否正常工作
  - 参考路径：[packages/core/src/ai/utils/web-search.ts:1-172](file://packages/core/src/ai/utils/web-search.ts#L1-L172)

- **API密钥相关问题**
  - **检查VITE_AI_IMAGE_API_KEY环境变量是否正确配置**
  - **确认AI设置面板中的API密钥是否已保存并生效**
  - **验证DeepSeek API密钥的安全配置**
  - 参考路径：[packages/plugin-ai/src/ai/utils.ts:6-10](file://packages/plugin-ai/src/ai/utils.ts#L6-L10), [packages/plugin-ai/src/ai/AISettings.tsx:1-182](file://packages/plugin-ai/src/ai/AISettings.tsx#L1-L182), [packages/core/src/ai/ai-utils.ts:5-7](file://packages/core/src/ai/ai-utils.ts#L5-L7)

- **插件未生效**
  - 确认插件已注册到编辑器扩展列表；检查插件管理器是否正确合并扩展
  - **确认AI内联助手组件是否正确集成到AIExtension中**
  - **确认UI组件系统是否正确加载和渲染**
  - **确认格式化工具系统是否正确集成**
  - 参考路径：[packages/plugin-ai/src/index.tsx:1-35](file://packages/plugin-ai/src/index.tsx#L1-L35), [packages/common/src/core/PluginManager.ts:1-177](file://packages/common/src/core/PluginManager.ts#L1-L177), [packages/editor/src/editor/use-extension.ts:47-63](file://packages/editor/src/editor/use-extension.ts#L47-L63), [packages/plugin-ai/src/ai/index.tsx:29-30](file://packages/plugin-ai/src/ai/index.tsx#L29-L30)

- **技能市场访问失败**
  - 检查SkillsMP客户端配置；确认API密钥是否正确设置
  - 验证网络连接和Skills API的可用性
  - 参考路径：[packages/core/src/ai/skills/skillsmp/use-skillsmp.ts:42-50](file://packages/core/src/ai/skills/skillsmp/use-skillsmp.ts#L42-L50), [docs/api/skills-api.md:7-9](file://docs/api/skills-api.md#L7-L9)

- **技能加载失败**
  - 检查技能定义的完整性；确认必需工具是否正确注册
  - 验证技能版本兼容性和依赖关系
  - 参考路径：[docs/api/skills-api.md:13-58](file://docs/api/skills-api.md#L13-L58)

- **AI内联助手问题**
  - **检查Ask AI按钮是否正确触发；确认自定义事件AI_INLINE_EVENT是否正常发送**
  - **验证浮动面板是否正确挂载到document.body；检查CSS样式和z-index**
  - **确认流式缓冲机制是否正常工作；检查requestAnimationFrame调用**
  - **嵌套列布局插入失败时，检查父分栏索引和列索引的有效性**
  - **UI组件系统提供完整的错误处理和用户反馈**
  - 参考路径：[packages/core/src/ai/AiInlineMenu.tsx:77-115](file://packages/core/src/ai/AiInlineMenu.tsx#L77-L115), [packages/core/src/ai/AiInlineMenu.tsx:211-243](file://packages/core/src/ai/AiInlineMenu.tsx#L211-L243), [packages/core/src/ai/AiInlineMenu.tsx:147-171](file://packages/core/src/ai/AiInlineMenu.tsx#L147-L171), [packages/core/src/ai/tools/columns-tools.ts:548-556](file://packages/core/src/ai/tools/columns-tools.ts#L548-L556), [packages/plugin-ai/src/ai/menu/Chat.tsx:1-636](file://packages/plugin-ai/src/ai/menu/Chat.tsx#L1-L636)

- **聊天组件问题**
  - **检查Chat.tsx组件是否正确渲染；确认React Context是否正常提供**
  - **验证流式缓冲机制是否正常工作；检查requestAnimationFrame调用**
  - **确认执行步骤显示组件是否正确更新；检查状态管理**
  - **检查错误显示组件是否正确处理错误类型**
  - **验证会话管理钩子是否正确保存和加载会话信息**
  - 参考路径：[packages/plugin-ai/src/ai/menu/Chat.tsx:117-246](file://packages/plugin-ai/src/ai/menu/Chat.tsx#L117-L246), [packages/plugin-ai/src/ai/menu/use-streaming-buffer.ts:10-62](file://packages/plugin-ai/src/ai/menu/use-streaming-buffer.ts#L10-L62), [packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx:10-75](file://packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx#L10-L75), [packages/plugin-ai/src/ai/menu/ErrorDisplay.tsx:1-57](file://packages/plugin-ai/src/ai/menu/ErrorDisplay.tsx#L1-L57), [packages/plugin-ai/src/ai/menu/useSessionManager.ts:1-92](file://packages/plugin-ai/src/ai/menu/useSessionManager.ts#L1-L92)

- **嵌套列布局问题**
  - **检查嵌套深度是否超过支持范围；验证父路径计算的正确性**
  - **确认插入位置计算是否准确；检查scrollToPosition的调用**
  - **验证嵌套列索引更新机制；检查重新发现文档结构的逻辑**
  - 参考路径：[packages/core/src/ai/tools/columns-tools.ts:591-616](file://packages/core/src/ai/tools/columns-tools.ts#L591-L616), [packages/core/src/ai/utils/editor-effects.ts:1-12](file://packages/core/src/ai/utils/editor-effects.ts#L1-L12)

- **格式化工具问题**
  - **检查格式化工具的输入验证是否正确；确认zod schema定义**
  - **验证文本定位功能是否正常；检查findTextPosition的调用**
  - **确认表格操作工具是否正确处理单元格定位**
  - **检查编辑器命令是否正确执行；验证ProseMirror集成**
  - **UI组件系统提供完整的错误处理和用户反馈**
  - 参考路径：[packages/core/src/ai/tools/format-tools.ts:21-70](file://packages/core/src/ai/tools/format-tools.ts#L21-L70), [packages/core/src/ai/tools/format-tools.ts:103-143](file://packages/core/src/ai/tools/format-tools.ts#L103-L143), [packages/core/src/ai/tools/format-tools.ts:404-505](file://packages/core/src/ai/tools/format-tools.ts#L404-L505), [packages/core/src/ai/utils/editor-effects.ts:1-12](file://packages/core/src/ai/utils/editor-effects.ts#L1-L12)

- **AI助手面板问题**
  - **检查AIAssistantPanel组件是否正确渲染；确认React Context是否正常提供**
  - **验证工具调用可视化是否正确显示；检查executionSteps状态**
  - **确认流式响应机制是否正常工作；检查streamingContent状态**
  - **检查错误处理是否正确；验证error状态管理**
  - **确认会话管理是否正确；检查sessionId状态**
  - 参考路径：[packages/core/src/ai/system-agent/AIAssistantPanel.tsx:112-168](file://packages/core/src/ai/system-agent/AIAssistantPanel.tsx#L112-L168), [packages/core/src/ai/system-agent/AIAssistantPanel.tsx:357-400](file://packages/core/src/ai/system-agent/AIAssistantPanel.tsx#L357-L400), [packages/core/src/ai/system-agent/AIAssistantPanel.tsx:407-414](file://packages/core/src/ai/system-agent/AIAssistantPanel.tsx#L407-L414), [packages/common/src/ai/system-agent/context.tsx:336-339](file://packages/common/src/ai/system-agent/context.tsx#L336-L339)

- **UI组件渲染问题**
  - **检查React.memo是否正确阻止不必要的重渲染**
  - **验证useCallback和useMemo是否正确稳定回调和计算结果**
  - **确认requestAnimationFrame是否正确优化动画性能**
  - **检查Collapsible组件是否正确处理折叠状态**
  - **验证TooltipProvider是否正确优化工具提示性能**
  - 参考路径：[packages/plugin-ai/src/ai/menu/MessageBubble.tsx:16-81](file://packages/plugin-ai/src/ai/menu/MessageBubble.tsx#L16-L81), [packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx:10-110](file://packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx#L10-L110), [packages/plugin-ai/src/ai/menu/TeamStatusPanel.tsx:60-122](file://packages/plugin-ai/src/ai/menu/TeamStatusPanel.tsx#L60-L122)

**章节来源**
- [packages/plugin-ai/src/ai/text-loading.tsx:1-146](file://packages/plugin-ai/src/ai/text-loading.tsx#L1-L146)
- [packages/plugin-ai/src/ai/AiView.tsx:1-76](file://packages/plugin-ai/src/ai/AiView.tsx#L1-L76)
- [packages/plugin-ai/src/ai/utils.ts:1-126](file://packages/plugin-ai/src/ai/utils.ts#L1-L126)
- [packages/plugin-ai/src/ai/AiImageView.tsx:1-69](file://packages/plugin-ai/src/ai/AiImageView.tsx#L1-L69)
- [packages/plugin-ai/src/index.tsx:1-35](file://packages/plugin-ai/src/index.tsx#L1-L35)
- [packages/common/src/core/PluginManager.ts:1-177](file://packages/common/src/core/PluginManager.ts#L1-L177)
- [packages/editor/src/editor/use-extension.ts:47-63](file://packages/editor/src/editor/use-extension.ts#L47-L63)
- [packages/core/src/ai/utils/tool-wrapper.ts:1-68](file://packages/core/src/ai/utils/tool-wrapper.ts#L1-L68)
- [packages/core/src/ai/utils/markdown-parser.ts:1-458](file://packages/core/src/ai/utils/markdown-parser.ts#L1-L458)
- [packages/core/src/ai/utils/web-search.ts:1-172](file://packages/core/src/ai/utils/web-search.ts#L1-L172)
- [packages/plugin-ai/src/ai/AISettings.tsx:1-182](file://packages/plugin-ai/src/ai/AISettings.tsx#L1-L182)
- [packages/core/src/ai/ai-utils.ts:5-7](file://packages/core/src/ai/ai-utils.ts#L5-L7)
- [packages/core/src/ai/skills/skillsmp/use-skillsmp.ts:42-50](file://packages/core/src/ai/skills/skillsmp/use-skillsmp.ts#L42-L50)
- [docs/api/skills-api.md:1-777](file://docs/api/skills-api.md#L1-L777)
- [packages/core/src/ai/AiInlineMenu.tsx:77-115](file://packages/core/src/ai/AiInlineMenu.tsx#L77-L115)
- [packages/core/src/ai/AiInlineMenu.tsx:211-243](file://packages/core/src/ai/AiInlineMenu.tsx#L211-L243)
- [packages/core/src/ai/AiInlineMenu.tsx:147-171](file://packages/core/src/ai/AiInlineMenu.tsx#L147-L171)
- [packages/core/src/ai/tools/columns-tools.ts:520-616](file://packages/core/src/ai/tools/columns-tools.ts#L520-L616)
- [packages/core/src/ai/utils/editor-effects.ts:1-12](file://packages/core/src/ai/utils/editor-effects.ts#L1-L12)
- [packages/plugin-ai/src/ai/menu/Chat.tsx:1-636](file://packages/plugin-ai/src/ai/menu/Chat.tsx#L1-L636)
- [packages/plugin-ai/src/ai/menu/use-streaming-buffer.ts:1-63](file://packages/plugin-ai/src/ai/menu/use-streaming-buffer.ts#L1-L63)
- [packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx:1-110](file://packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx#L1-L110)
- [packages/plugin-ai/src/ai/menu/ErrorDisplay.tsx:1-57](file://packages/plugin-ai/src/ai/menu/ErrorDisplay.tsx#L1-L57)
- [packages/plugin-ai/src/ai/menu/TeamStatusPanel.tsx:1-125](file://packages/plugin-ai/src/ai/menu/TeamStatusPanel.tsx#L1-L125)
- [packages/plugin-ai/src/ai/menu/useSessionManager.ts:1-92](file://packages/plugin-ai/src/ai/menu/useSessionManager.ts#L1-L92)
- [packages/core/src/ai/tools/format-tools.ts:1-505](file://packages/core/src/ai/tools/format-tools.ts#L1-L505)
- [packages/core/src/ai/system-agent/AIAssistantPanel.tsx:1-538](file://packages/core/src/ai/system-agent/AIAssistantPanel.tsx#L1-L538)

## 结论
AI插件通过清晰的分层设计与可扩展的编辑器节点体系，实现了文本与图像的AI生成能力，并提供了流畅的交互体验。**全新的集中式目录系统显著提升了工具管理的智能化程度**。**AI助手面板提供全局悬浮访问和工具调用可视化，大幅增强了AI插件的交互性和实用性**。**格式化工具系统提供了完整的文本格式化和表格操作能力，满足复杂的文档编辑需求**。**AI内联助手系统显著增强了AI插件的交互性和可视化程度**。**AI内联助手提供浮动面板界面、实时流式响应、执行步骤跟踪、用户选择提示等功能，为用户提供沉浸式的AI交互体验**。**增强的列管理工具支持嵌套列布局，通过insertNestedColumns工具实现复杂的文档结构**。**全新的技能生态系统显著增强了AI插件的功能性和智能化水平**。**SkillsMP集成提供了完整的技能市场解决方案，技能注册表实现了技能生命周期管理，渐进式工具发现系统提升了工具使用的智能化程度**。**最重要的是，通过移除硬编码的DeepSeek API密钥，采用环境变量和设置面板进行安全配置，大幅提升了系统的安全性**。**现代化的UI组件系统提供了完整的用户交互体验，包括流式渲染、执行步骤跟踪、错误处理等功能**。结合插件管理器与扩展装配机制，可在不侵入主应用的情况下灵活集成与扩展。建议在生产环境中关注流式渲染性能、并发控制、工具执行监控与错误恢复，以及API密钥和技能安全的管理，以获得更稳定的用户体验。

## 附录：使用示例与最佳实践

### 在编辑器中插入AI文本块
- 使用节点命令插入空的AI文本块，随后在视图中输入提示语并点击生成
- 参考路径：[packages/plugin-ai/src/ai/ai.ts:1-55](file://packages/plugin-ai/src/ai/ai.ts#L1-L55), [packages/plugin-ai/src/ai/AiView.tsx:1-76](file://packages/plugin-ai/src/ai/AiView.tsx#L1-L76)

### 在编辑器中插入AI图像块
- 使用节点命令插入AI图像块，输入提示语后触发生成，预览并更新图片URL
- 参考路径：[packages/plugin-ai/src/ai/ai-image.ts:1-37](file://packages/plugin-ai/src/ai/ai-image.ts#L1-L37), [packages/plugin-ai/src/ai/AiImageView.tsx:1-69](file://packages/plugin-ai/src/ai/AiImageView.tsx#L1-L69)

### **使用AI内联助手系统**
- **在气泡菜单中点击"Ask AI"按钮，触发浮动面板**
- **在浮动面板中输入指令，支持实时流式响应和步骤跟踪**
- **使用Esc键快速关闭面板，支持点击空白处关闭**
- **嵌套列布局：在现有分栏列内插入嵌套分栏布局**
- **现代化UI组件：享受流畅的聊天体验和丰富的交互功能**
- 参考路径：[packages/core/src/ai/AiInlineMenu.tsx:77-115](file://packages/core/src/ai/AiInlineMenu.tsx#L77-L115), [packages/core/src/ai/AiInlineMenu.tsx:119-435](file://packages/core/src/ai/AiInlineMenu.tsx#L119-L435), [packages/core/src/ai/tools/columns-tools.ts:520-616](file://packages/core/src/ai/tools/columns-tools.ts#L520-L616), [packages/plugin-ai/src/ai/menu/Chat.tsx:1-636](file://packages/plugin-ai/src/ai/menu/Chat.tsx#L1-L636)

### **使用格式化工具系统**
- **文本格式化：使用formatText工具为文本应用内联格式**
- **表格操作：使用insertTable、getTableInfo、editTable、editTableCell、deleteTable工具管理表格**
- **精确定位：使用findTextPosition和findTablesInDocument进行精确操作**
- **编辑器集成：与ProseMirror编辑器无缝集成，支持滚动到可视区域**
- **错误处理：提供详细的错误信息和回退机制**
- 参考路径：[packages/core/src/ai/tools/format-tools.ts:11-71](file://packages/core/src/ai/tools/format-tools.ts#L11-L71), [packages/core/src/ai/tools/format-tools.ts:73-505](file://packages/core/src/ai/tools/format-tools.ts#L73-L505)

### **使用AI助手面板**
- **全局悬浮访问：使用AIAssistantTrigger组件提供全局悬浮面板**
- **工具调用可视化：实时显示工具执行步骤、参数和结果**
- **流式响应：支持实时流式文本生成和工具调用状态**
- **会话管理：支持持久化的会话和对话ID管理**
- **键盘快捷键：支持Ctrl+K快捷键打开面板**
- 参考路径：[packages/core/src/ai/system-agent/AIAssistantPanel.tsx:485-538](file://packages/core/src/ai/system-agent/AIAssistantPanel.tsx#L485-L538), [packages/core/src/ai/system-agent/AIAssistantPanel.tsx:357-400](file://packages/core/src/ai/system-agent/AIAssistantPanel.tsx#L357-L400)

### **使用优化的AI代理系统**
- 通过use-editor-agent-optimized钩子获取代理实例，支持停止生成和状态检查
- **集成技能生态系统，支持技能驱动的工具调用**
- 参考路径：[packages/core/src/ai/use-agent-optimized.tsx:1-223](file://packages/core/src/ai/use-agent-optimized.tsx#L1-L223)

### **利用工具元数据系统**
- 使用ESSENTIAL_TOOLS、CATEGORY_DESCRIPTIONS、BUILTIN_TOOL_METADATA进行工具管理
- **通过技能注册表管理技能依赖，实现智能工具选择**
- **AI内联助手的工具执行步骤跟踪，便于调试和监控**
- **现代化UI组件系统提供完整的工具执行可视化**
- 参考路径：[packages/common/src/ai/discovery/tool-metadata.ts:10-43](file://packages/common/src/ai/discovery/tool-metadata.ts#L10-L43), [packages/common/src/ai/discovery/tool-metadata.ts:45-375](file://packages/common/src/ai/discovery/tool-metadata.ts#L45-L375), [packages/core/src/ai/AiInlineMenu.tsx:174-200](file://packages/core/src/ai/AiInlineMenu.tsx#L174-L200), [packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx:10-75](file://packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx#L10-L75)

### **集成SkillsMP技能市场**
- 使用use-skillsmp Hook进行技能搜索和管理
- **通过技能提供商的分类和评价系统，选择合适的技能**
- **现代化UI组件系统提供完整的技能市场交互体验**
- 参考路径：[packages/core/src/ai/skills/skillsmp/use-skillsmp.ts:41-190](file://packages/core/src/ai/skills/skillsmp/use-skillsmp.ts#L41-L190)

### **利用完整的工具系统**
- 使用读取工具获取文档结构，插入工具执行内容操作，删除工具清理内容
- **通过工具提供商的动态注册机制，扩展新的工具能力**
- **嵌套列布局：使用insertNestedColumns在现有分栏内插入嵌套布局**
- **格式化工具：使用formatText、insertTable等工具进行文档格式化**
- **现代化UI组件系统提供完整的工具执行可视化**
- 参考路径：[packages/core/src/ai/tools/read-tools.ts:1-208](file://packages/core/src/ai/tools/read-tools.ts#L1-L208), [packages/core/src/ai/tools/insert-tools.ts:1-611](file://packages/core/src/ai/tools/insert-tools.ts#L1-L611), [packages/core/src/ai/tools/delete-tools.ts:1-253](file://packages/core/src/ai/tools/delete-tools.ts#L1-L253), [packages/core/src/ai/tools/columns-tools.ts:520-616](file://packages/core/src/ai/tools/columns-tools.ts#L520-L616), [packages/core/src/ai/tools/misc-tools.ts:122-196](file://packages/core/src/ai/tools/misc-tools.ts#L122-L196), [packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx:10-75](file://packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx#L10-L75)

### **集成插件至编辑器**
- 将插件的编辑器扩展注入到插件管理器中，确保扩展在运行时被解析与装配
- **通过技能注册表管理插件技能，实现插件驱动的扩展**
- **确认AI内联助手组件正确集成到AIExtension中**
- **现代化UI组件系统提供完整的用户交互体验**
- **确认格式化工具系统正确集成**
- 参考路径：[packages/plugin-ai/src/index.tsx:1-35](file://packages/plugin-ai/src/index.tsx#L1-L35), [packages/common/src/core/PluginManager.ts:1-177](file://packages/common/src/core/PluginManager.ts#L1-L177), [packages/editor/src/editor/use-extension.ts:47-63](file://packages/editor/src/editor/use-extension.ts#L47-L63), [packages/plugin-ai/src/ai/index.tsx:29-30](file://packages/plugin-ai/src/ai/index.tsx#L29-L30)

### **参数配置与本地化**
- 在插件配置中提供多语言文案与编辑器扩展数组，确保国际化与功能可用
- **通过技能生态系统实现插件的本地化和多语言支持**
- **AI内联助手支持键盘快捷键和无障碍访问**
- **现代化UI组件系统提供完整的本地化支持**
- **格式化工具系统提供精确的用户交互和反馈**
- 参考路径：[packages/plugin-ai/src/index.tsx:1-35](file://packages/plugin-ai/src/index.tsx#L1-L35)

### **错误处理与性能优化**
- 对图像生成失败进行提示；对长文本流式渲染采用增量更新与装饰器控制
- **使用工具包装器进行统一的错误处理和性能监控**
- **通过技能注册表的缓存机制，提升技能加载性能**
- **AI内联助手的流式缓冲机制，优化渲染性能**
- **嵌套列布局的深度追踪和父路径机制，避免索引混乱**
- **格式化工具系统的精确操作，提升性能和准确性**
- **现代化UI组件系统提供完整的错误处理和性能优化**
- **使用React.memo和useCallback优化组件性能**
- 参考路径：[packages/plugin-ai/src/ai/AiImageView.tsx:1-69](file://packages/plugin-ai/src/ai/AiImageView.tsx#L1-L69), [packages/plugin-ai/src/ai/text-loading.tsx:1-146](file://packages/plugin-ai/src/ai/text-loading.tsx#L1-L146), [packages/core/src/ai/utils/tool-wrapper.ts:1-68](file://packages/core/src/ai/utils/tool-wrapper.ts#L1-L68), [packages/core/src/ai/AiInlineMenu.tsx:147-171](file://packages/core/src/ai/AiInlineMenu.tsx#L147-L171), [packages/core/src/ai/tools/columns-tools.ts:11-19](file://packages/core/src/ai/tools/columns-tools.ts#L11-L19), [packages/plugin-ai/src/ai/menu/ErrorDisplay.tsx:1-57](file://packages/plugin-ai/src/ai/menu/ErrorDisplay.tsx#L1-L57), [packages/plugin-ai/src/ai/menu/MessageBubble.tsx:16-81](file://packages/plugin-ai/src/ai/menu/MessageBubble.tsx#L16-L81), [packages/core/src/ai/tools/format-tools.ts:21-70](file://packages/core/src/ai/tools/format-tools.ts#L21-L70)

### **Markdown内容处理最佳实践**
- 使用insertSegmentedMarkdown进行大文档的分段插入，避免性能问题
- **通过技能注册表管理Markdown处理技能，提升处理效率**
- **现代化UI组件系统提供完整的Markdown解析和显示功能**
- **格式化工具系统提供精确的Markdown表格操作**
- 参考路径：[packages/core/src/ai/tools/insert-tools.ts:521-609](file://packages/core/src/ai/tools/insert-tools.ts#L521-L609), [packages/core/src/ai/utils/markdown-parser.ts:1-458](file://packages/core/src/ai/utils/markdown-parser.ts#L1-L458)

### **Web搜索集成示例**
- 使用webSearch工具获取最新信息，结合fetchWebPage获取网页内容
- **通过技能生态系统集成专业的搜索技能，提升搜索质量**
- **现代化UI组件系统提供完整的Web搜索集成**
- **格式化工具系统提供精确的文本搜索和定位**
- 参考路径：[packages/core/src/ai/tools/misc-tools.ts:122-196](file://packages/core/src/ai/tools/misc-tools.ts#L122-L196), [packages/core/src/ai/utils/web-search.ts:1-172](file://packages/core/src/ai/utils/web-search.ts#L1-L172)

### **API密钥安全配置最佳实践**
- **移除了硬编码的DeepSeek API密钥，建议通过环境变量进行配置**
- 使用AI设置面板进行API密钥的安全存储和管理
- 在开发环境使用不同的API密钥，在生产环境使用独立的密钥
- 定期轮换API密钥，避免长期使用同一密钥
- **通过技能注册表管理技能密钥，实现细粒度的权限控制**
- **AI内联助手支持用户选择处理，避免自动决策风险**
- **现代化UI组件系统提供安全的用户输入验证和处理**
- **格式化工具系统提供精确的编辑器操作和安全验证**
- 参考路径：[packages/plugin-ai/src/ai/AISettings.tsx:1-182](file://packages/plugin-ai/src/ai/AISettings.tsx#L1-L182), [packages/plugin-ai/src/ai/utils.ts:6-10](file://packages/plugin-ai/src/ai/utils.ts#L6-L10), [packages/core/src/ai/ai-utils.ts:5-7](file://packages/core/src/ai/ai-utils.ts#L5-L7), [packages/core/src/ai/AiInlineMenu.tsx:202-206](file://packages/core/src/ai/AiInlineMenu.tsx#L202-L206)

### **技能生态系统集成最佳实践**
- **通过SkillsMP集成技能市场，实现技能的发现和安装**
- **使用技能注册表管理技能生命周期，确保技能的正确加载和卸载**
- **利用渐进式工具发现系统，智能选择和加载所需的工具**
- **通过工具提供商的动态注册机制，扩展编辑器的功能**
- **AI内联助手的工具执行步骤跟踪，便于性能监控和调试**
- **现代化UI组件系统提供完整的技能生态系统集成**
- **格式化工具系统提供精确的工具调用和可视化**
- 参考路径：[docs/api/skills-api.md:1-777](file://docs/api/skills-api.md#L1-L777), [packages/core/src/ai/PROGRESSIVE_TOOL_DISCOVERY.md:1-389](file://packages/core/src/ai/PROGRESSIVE_TOOL_DISCOVERY.md#L1-L389), [packages/core/src/ai/skills/skillsmp/use-skillsmp.ts:1-190](file://packages/core/src/ai/skills/skillsmp/use-skillsmp.ts#L1-L190), [packages/core/src/ai/AiInlineMenu.tsx:174-200](file://packages/core/src/ai/AiInlineMenu.tsx#L174-L200), [packages/common/src/ai/discovery/tool-metadata.ts:1-404](file://packages/common/src/ai/discovery/tool-metadata.ts#L1-L404)

### **现代化UI组件系统最佳实践**
- **使用Chat.tsx组件提供完整的聊天界面**
- **使用MessageBubble.tsx组件提供丰富的消息显示功能**
- **使用use-streaming-buffer.ts钩子优化流式渲染性能**
- **使用ExecutionStepsDisplay.tsx组件提供详细的执行步骤可视化**
- **使用ErrorDisplay.tsx组件提供友好的错误处理**
- **使用TeamStatusPanel.tsx组件提供团队状态可视化**
- **使用useSessionManager.ts钩子管理会话和对话ID**
- **使用chat-persistence.ts组件提供聊天历史持久化**
- **使用chat-types.ts类型定义确保类型安全**
- **现代化UI组件系统提供完整的用户体验和性能优化**
- **格式化工具系统提供精确的用户交互和反馈**
- 参考路径：[packages/plugin-ai/src/ai/menu/Chat.tsx:1-636](file://packages/plugin-ai/src/ai/menu/Chat.tsx#L1-L636), [packages/plugin-ai/src/ai/menu/MessageBubble.tsx:1-82](file://packages/plugin-ai/src/ai/menu/MessageBubble.tsx#L1-L82), [packages/plugin-ai/src/ai/menu/use-streaming-buffer.ts:1-63](file://packages/plugin-ai/src/ai/menu/use-streaming-buffer.ts#L1-L63), [packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx:1-110](file://packages/plugin-ai/src/ai/menu/ExecutionStepsDisplay.tsx#L1-L110), [packages/plugin-ai/src/ai/menu/ErrorDisplay.tsx:1-57](file://packages/plugin-ai/src/ai/menu/ErrorDisplay.tsx#L1-L57), [packages/plugin-ai/src/ai/menu/TeamStatusPanel.tsx:1-125](file://packages/plugin-ai/src/ai/menu/TeamStatusPanel.tsx#L1-L125), [packages/plugin-ai/src/ai/menu/useSessionManager.ts:1-92](file://packages/plugin-ai/src/ai/menu/useSessionManager.ts#L1-L92), [packages/plugin-ai/src/ai/menu/chat-persistence.ts:1-66](file://packages/plugin-ai/src/ai/menu/chat-persistence.ts#L1-L66), [packages/plugin-ai/src/ai/menu/chat-types.ts:1-250](file://packages/plugin-ai/src/ai/menu/chat-types.ts#L1-L250)