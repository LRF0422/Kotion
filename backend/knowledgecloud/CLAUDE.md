# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Knowledge Cloud is a Java-based knowledge management system with AI Agent capabilities, built on Spring Cloud microservices architecture.

## Build Commands

```bash
# Build all modules
make build
# or: mvn clean package

# Build without tests (faster)
make build-fast
# or: mvn clean package -DskipTests

# Build specific module
make build-module MODULE=knowledge-gateway

# Run all tests
make test
# or: mvn test

# Run tests for specific module
make test-module MODULE=knowledge-gateway

# Clean build artifacts
make clean
# or: mvn clean
```

## Service Ports

| Service      | Port |
|--------------|------|
| gateway      | 1889 |
| auth         | 8100 |
| system       | 8106 |
| wiki         | 7778 |
| file-center  | 7004 |
| resource     | 8010 |
| widget-hub   | 6667 |

## Architecture

### Module Structure

- **knowledge-gateway**: API Gateway (Spring Cloud Gateway)
- **knowledge-auth**: Authentication service
- **knowledge-service**: Core business services
  - `knowledge-agent-skills`: AI Agent with skills (DeepSeek integration, annotation-driven skills/tools)
  - `knowledge-system`: System management
  - `knowledge-wiki`: Wiki knowledge management
  - `knowledge-file-center`: File management
  - `knowledge-message`: Messaging
  - `knowledge-log`: Logging
- **knowledge-service-api**: API definitions (interfaces, DTOs, enums)
  > `knowledge-agent-api`: ChatMessage/ChatCompletionRequest 等消息 DTO（被 AgentCore 复用）。
- **knowledge-tool**: Core frameworks and utilities
  - `knowledge-core-agent`: Agent SDK — 其它微服务用 `@AgentSkill` 注册远程技能（保留）；agent 侧消费端已重写为 `com.knowledge.agent.core.skill.*`
  - `knowledge-core-boot`: Spring Boot extensions
  - `knowledge-core-common`: Common utilities
  - `knowledge-core-mybatis`: MyBatis extensions
  - `knowledge-core-secure`: Security utilities
  - Other core modules (feign, loadbalancer, oss, permission, etc.)
- **knowledge-ops**: Operations services (admin, swagger, resource, develop, report)
- **knowledge-common**: Shared common code

### AgentCore（从 0 重设计，替代 V1/V2/V3）

`knowledge-service/knowledge-agent-skills` 内新包 `com.knowledge.agent.core.*`（位于应用扫描基包
`com.knowledge.agent` 之内，由应用自带组件扫描注册，**无 spring.factories、无额外 @ComponentScan**）；旧包
`com.knowledge.agent.{channel,core,config,observability,registry,store,tool,controller,v2,v3}` 已删除
（仅保留 `com.knowledge.agent.llm.*` 的 LlmClientFactory 基础设施）。设计文档：
仓库根 `docs/agent-redesign.md`。

> 注意：不要修改 knowledge-core-* 基础架构模块（组件扫描等机制由平台自行管理）；
> agent 模块对平台安全栈的依赖只有一个 `@ConditionalOnMissingBean` 的
> `JwtTokenProvider` 兜底 Bean（见 `AgentCoreAutoConfiguration`），绝不覆盖平台注册。

- **Run（一次执行单元）**：状态机 QUEUED→RUNNING⇄WAITING_TOOLS/SUSPENDED→COMPLETED|FAILED|CANCELLED；
  supervisor 负责生命周期/租约/配额，loop（同步驱动、每 run 一线程）负责执行。
- **断点恢复**：事件先落 Redis ZSET 再推流（Redis 失败时同步写 MySQL 冷层兜底，保证"先落盘"）；
  MySQL `agent_run_event` 异步镜像 + `event.retention-days` 保留清理；`agent_run_checkpoint` 每轮推理前落快照，
  hot/cold 取较新者；租约过期后 reconcile 从快照+事件日志重建 loop。
- **记忆三层**：工作记忆（checkpoint 内 scratchpad + 工具）、会话记忆（`agent_thread` 摘要，
  ThreadSummarizer 完成时异步生成）、长期记忆（`agent_long_memory`，页面/空间/用户分级 scope，
  KeywordMemoryRetriever 打分，MemoryRetriever 接口预留 embedding）。
- **子 agent**：`delegate` 工具 → 子 run（parent_run_id 关联、独立预算/事件日志；继承父系统提示/技能片段/记忆/采样参数，
  受租户配额与 `run.max-children-per-run` 上限）；子 run 在独立执行器上自驱，前端 `SubRunWorker` 直接流式并执行其前端工具
  （支持嵌套孙 run）；父日志只有 sub.spawned/sub.completed/sub.failed；取消递归级联。
- **Plan 模式**：read-only 工具门禁 + `present_plan` 拦截 → plan.proposed + suspend(plan_approval)。
- **API**：`/api/agent/v1/**`（EditorAgentController，SSE 事件协议 {seq,type,...}）；管理端
  `/admin/ai/**` 用量聚合改读 `agent_run`；模型列表 `/api/v1/models` 不变；远程技能注册
  `/api/v1/skills/*` 契约不变（RemoteSkillController）。
- **DB 迁移 V7**（`script/migration/V7__agentcore.sql`）：agent_run / agent_run_event /
  agent_run_checkpoint / agent_long_memory / agent_thread。旧表保留数据不删。
- **会话日志 + 投影（V26–V28）**：`agent_chat_session.model_messages_json` 是引擎维护的
  **规范会话日志**（`SessionTranscriptProjector` 跨 run 累积），**是模型上下文的唯一来源** —— 客户端只发本轮
  用户消息，不再回传历史；`messages_json` 是由规范日志纯推导的 UI 投影缓存。事实来源仍是 run 日志
  （`agent_run_checkpoint` + `agent_run_event`）。`ChatSessionController` 对客户端只读 transcript，
  PUT 仅 UI 元数据，`/import` 迁移、`DELETE /transcript` 清空。与 `agent_thread`（运行时摘要）职责分离。
  详见 `docs/AGENT_CHAT_SESSION_PERSISTENCE.md`。

### Key Patterns

- **远程技能注册**: 其它微服务用 knowledge-core-agent SDK 的 `@AgentSkill` 注解注册；
  agent 侧 `RemoteSkillRegistry` Redis 持久化 + 启动恢复 + 心跳保鲜。心跳按 **skillId**
  匹配（一个 skill 多个 tool），SDK 每 300s 周期重注册兜底；运维见
  `knowledge-service/knowledge-agent-skills/REMOTE_SKILLS.md`。
- **LLM Abstraction**: `LlmClient`/`LlmClientFactory`（OpenAI 兼容 provider，`agent.providers.*` 配置）；
  AgentCore 的 `LlmGateway` 是唯一调用入口（同步驱动 + 流式工具调用累积）。
- **Multi-agent**: `delegate` 工具创建子 run，父 loop 阻塞等待子终态并聚合结果。
- **Plan Mode**: mode=plan 时工具门禁只读；`present_plan` 由 loop 拦截为计划审批挂起；
  `POST /runs/{id}/resume` 携带 {action: approve_plan, planDecision}。
- **Session Persistence**: 事件溯源（Redis ZSET 热 + MySQL 冷）+ `agent_run_checkpoint` 快照；
  不再使用旧 `agent_message`/`agent_task_event`（旧表保留备查）。

### Technology Stack

- Java 1.8
- Spring Boot 2.7.1
- Spring Cloud 2021.0.3
- MyBatis
- Nacos (service discovery/config)
- MapStruct (bean mapping)
- Lombok

### Important Notes

- MapStruct annotation processor is configured - rebuild after adding/changing mappers
- Use `mvn clean package` when MapStruct changes don't reflect
