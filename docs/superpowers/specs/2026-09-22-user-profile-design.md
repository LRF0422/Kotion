# 用户画像（User Profile）设计规范

> 状态：设计稿（待评审）
> 日期：2026-09-22
> 范围：AgentCore 后端画像能力（知识画像服务）+ 画像消费方（内容推荐）+ 前端画像中心
> 关联文档：CLAUDE.md、backend/knowledgecloud/CLAUDE.md、docs/AGENT_CHAT_SESSION_PERSISTENCE.md、docs/agent-redesign.md、docs/ZHIHU_CONNECTOR_PLAN.md、docs/XIAOHONGSHU_CONNECTOR_PLAN.md

---

## 1. 概述

### 1.1 背景

Kotion 的 AI 会话已经由 AgentCore 引擎完整落库：agent_chat_session.model_messages_json 是引擎拥有的**规范会话日志**，
agent_run / agent_run_checkpoint / agent_run_event 是事实来源（见 docs/AGENT_CHAT_SESSION_PERSISTENCE.md）。

这些会话已经隐含了用户稳定的属性与偏好：他在做什么职业、关注哪些领域、用什么技术栈、偏好什么形式的内容。
但目前这些信息只在单次会话内被消费（agent_thread.summary 会话记忆、agent_long_memory 长期记忆、
agent_saved_skill 技能），**没有任何一份“跨会话、结构化、可被推荐系统消费”的用户画像**。

本规范定义一套全新的**用户画像（User Profile）**能力：从会话中抽取低敏感维度，聚合为结构化 trait，
供推荐系统做内容排序，同时向用户完全透明、可编辑、可删除。

### 1.2 本次决策基线（已确认）

| 决策点 | 结论 |
|---|---|
| 交付形态 | **先出设计规格**，评审通过后再实现 |
| 生成位置 | **后端服务**消费 agent_chat_session，跨端一致、可批量回填 |
| 敏感边界 | **只做低敏感维度**：职业/行业/内容兴趣/偏好等；**不做精神状态、性格推断，不推断性别** |
| 数据来源 | 一期 = AI 会话（agent_chat_session）；评论/浏览行为留待 P2 |

### 1.3 画像是什么 / 不是什么

这是本设计最重要的一节。仓库已有一套成熟的三层记忆，**画像不能与之重叠**，否则会重复建设、互相打架。

| 能力 | 载体 | 形态 | 作用域 | 生命周期 | 消费方 |
|---|---|---|---|---|---|
| 工作记忆 | agent_run_checkpoint.scratchpad | 自由文本 | 单 run | run 级 | Agent 循环 |
| 会话记忆 | agent_thread.summary（ThreadSummarizer） | 自由文本摘要 | 单会话（conversationId） | 滚动覆盖 | Agent 系统提示 |
| 长期记忆 | agent_long_memory（MemoryStore） | 自由文本 fact/preference/note/episode | 用户 / 用户+空间 / 用户+空间+页面 | 长期，人工 forget | Agent 系统提示 |
| 已保存技能 | agent_saved_skill | 可执行技能 | 用户 | 长期 | Agent 工具/技能 |
| **用户画像（本设计）** | **agent_user_profile** | **结构化 trait（维度 + 值 + 置信度 + 证据）** | **用户（租户内）** | **置信度衰减 + 过期** | **推荐系统 / 画像中心** |

一句话边界：

> **长期记忆是“Agent 要记住的一句话”，画像是“推荐系统能查询的一个特征”。**
> 画像由会话**派生**，只读、可重建；它不是 Agent 的记忆来源，也不写入 agent_long_memory。

### 1.4 目标与非目标

**目标**

- 从已有 AI 会话中抽取**低敏感、可解释、带证据**的结构化用户特征。
- 跨会话聚合、去重、衰减，形成一份稳定的用户画像快照。
- 提供用户端 API：查看 / 编辑 / 删除 / 关闭画像。
- 提供推荐消费接口，让首页信息流可以按画像排序。
- 全程满足 PIPL「告知同意 + 最小必要 + 可撤回」要求。

**非目标（本设计不做）**

- 不推断性别、精神状态、性格、健康、宗教、政治倾向、性取向、精确位置、财务、生物特征。
- 不做实时在线特征服务（P0 是准实时：run 结束后异步更新）。
- 不做模型训练 / 微调 / 对外共享。
- 不改 agent_long_memory、agent_thread 的现有语义。
- 不引入第三方画像 SDK 或独立画像微服务（一期落在 knowledge-agent-skills 内）。

---

## 2. 合规与隐私硬约束

> 以下条款是**实现门禁**，不是建议。任何维度或字段若违反，必须在上线前移除。

### 2.1 允许 / 禁止维度

**允许（P0 allowlist，见 §3.1）**

- 职业与职能角色（如「后端工程师」「产品经理」）
- 行业 / 领域（如「企业软件」「教育」）
- 专业主题兴趣（如「分布式系统」「交互设计」）
- 内容形式偏好（如「偏好长文」「偏好图表」「偏好代码示例」）
- 交互偏好（如「偏好简洁回答」「偏好中文」）
- 工具与技术栈（如「Java」「React」）
- 粗粒度活跃时段（按用户本地时区的小时段，不落精确位置）

**禁止（任何来源都不得推断或存储）**

- 性别（**不推断**；如业务确需，只能由用户主动填写并单独同意，见 §3.1 备注）
- 精神状态 / 情绪 / 心理状况 / 性格
- 健康、医疗、残障
- 政治倾向、宗教信仰
- 性取向、婚恋
- 精确位置、行踪
- 财务、征信、收入
- 生物特征（人脸、声纹）
- 身份证件、账号密码等直接标识（SecretRedactor 已覆盖密钥类）

### 2.2 用户权利（必须在 P0 落地）

| 权利 | 实现 |
|---|---|
| 告知同意 | 首次进入画像中心弹窗说明；consent.enabled 默认 false，用户主动开启才开始抽取 |
| 查看 | 「我的画像」列出全部 trait + 置信度 + 证据摘要 + 来源（推断/自述） |
| 编辑 | 用户修改某 trait → source=user、locked=1，后续抽取不得覆盖 |
| 删除 | 删除单条 trait → 写 status=suppressed 墓碑，抽取不得复活 |
| 一键重置 | 清空全部 trait 与证据 |
| 关闭 | consent.enabled=false → 停止抽取并清空全部画像数据 |
| 撤回 | 关闭后所有派生数据物理删除（含证据、水位线） |

### 2.3 数据最小化与脱敏

- 抽取输入**只取规范会话日志中的 user / assistant 可见文本**，跳过 tool 消息（工具结果噪声大、易含敏感内容）。
- 送 LLM 前对整段文本调用 SecretRedactor.redact(...)（com.knowledge.agent.core.savedskill.SecretRedactor）。
- 证据摘要单条截断（默认 200 字符），且已脱敏。
- **自我强化防护**：抽取时必须跳过本系统注入的上下文块（【用户画像】【关于用户的长期记忆】【本次会话的近期进展（会话记忆）】），否则画像会被自己注入的内容反复强化。

### 2.4 租户隔离与访问

- tenantId / userId 一律来自 SecurityContextUtil（参考 ChatSessionController.identity()），**绝不接受客户端传入**。
- 所有 Mapper 查询强制带 tenant_id + user_id 条件。
- 内部特征接口仅限服务间调用（网关鉴权 + 服务凭证），不对外暴露。

### 2.5 保留与衰减

- 证据默认保留 90 天（agent.profile.evidence-retention-days），到期清理。
- trait 按类型衰减（§7.4），低置信度自动失效。
- 用户关闭后立即物理删除，不等保留期。

### 2.6 不用于训练

- 画像数据不得进入任何训练 / 微调 / 评测数据集，不得共享给第三方。
- 对外统计只允许聚合到租户级且不可反推个体。

---

## 3. 画像维度模型

### 3.1 维度 allowlist（P0）

维度以**受控枚举**定义，代码里做硬校验；不在 allowlist 内的维度直接丢弃，不落库。

| dimension | 含义 | 时效类型 | 多值 | 示例 value |
|---|---|---|---|---|
| occupation | 职业/职能角色 | stable | 否 | 后端工程师 |
| industry | 行业/领域 | stable | 否 | 企业软件 |
| expertise | 专业主题 | evolving | 是 | 分布式系统、交互设计 |
| tech_stack | 工具/技术栈 | evolving | 是 | Java、React |
| content_topic | 内容兴趣主题 | evolving | 是 | AI Agent、知识管理 |
| content_format | 内容形式偏好 | evolving | 是 | 长文、图表、代码示例 |
| interaction_pref | 交互/表达偏好 | evolving | 是 | 简洁回答、中文 |
| active_hours | 活跃时段（粗粒度） | ephemeral | 是 | 09-12、20-23 |

> **性别备注**：本设计**不包含** gender 维度。如果未来产品确需，只能新增为「用户自述维度」：
> 不参与 LLM 抽取、只能由用户在画像中心主动填写、且需要独立同意开关。本规范默认不实现。

### 3.2 trait 结构

一条 trait = 一个 (dimension, value) 断言：

~~~json
{
  "traitId": "tp_01J...",
  "dimension": "occupation",
  "value": "后端工程师",
  "confidence": 82,
  "source": "inferred",
  "status": "active",
  "locked": false,
  "evidenceCount": 3,
  "firstSeen": 1758000000000,
  "lastSeen": 1758600000000,
  "expiresAt": 1761192000000
}
~~~

- source：inferred（LLM 抽取）| user（用户自述/编辑）。
- status：active | suppressed（用户删除的墓碑，阻止复活）。
- locked：用户编辑后为 true，抽取器跳过该维度。

### 3.3 置信度

confidence 取值 [0,100]，只代表**证据强度**，不代表价值判断：

- 单次弱证据（如一句「我最近在看 Kafka」）→ 30~45
- 多次一致证据 → 60~85
- 用户自述 → 100（source=user 直接锁定）

抽取器给初始分，合并器按 §7.2 累积，衰减器按 §7.4 递减。

### 3.4 时效类型

| 类型 | 半衰期 | 用途 |
|---|---|---|
| stable | 180 天 | 职业、行业 |
| evolving | 45 天 | 兴趣、技术栈、形式偏好 |
| ephemeral | 14 天 | 活跃时段 |

---

## 4. 总体架构与数据流

~~~text
                    ┌─────────────────────────────────────────────┐
  用户与 AI 对话  ──▶│ agent_chat_session.model_messages_json      │  (已有，规范会话日志)
                    └───────────────────┬─────────────────────────┘
                                        │ run 终态触发（DefaultRunSupervisor.onLoopExit）
                                        ▼
                    ┌─────────────────────────────────────────────┐
                    │ ProfileExtractionService                    │
                    │  1) 取增量消息（水位线去重）                 │
                    │  2) SecretRedactor 脱敏 + 跳过注入块         │
                    │  3) LlmGateway.infer 严格 JSON 抽取          │
                    │  4) allowlist / 敏感词 / 证据校验（硬过滤）   │
                    └───────────────────┬─────────────────────────┘
                                        ▼
                    ┌─────────────────────────────────────────────┐
                    │ ProfileMerger（维度级合并 + 冲突 + 衰减）     │
                    └───────────────────┬─────────────────────────┘
                                        ▼
        ┌───────────────────────────────────────────────────────────┐
        │ agent_user_profile (trait)                                │  MySQL 权威
        │ agent_user_profile_evidence (证据)                        │
        │ agent_profile_extraction (会话水位线)                      │
        └───────────────┬───────────────────────────────┬───────────┘
                        │                               │
                        ▼                               ▼
        ┌───────────────────────────┐     ┌─────────────────────────────┐
        │ ProfileInjector           │     │ 推荐服务 / 首页信息流        │
        │  → ContextManager         │     │  GET profile / score(candidate)│
        │  volatile tail 注入        │     │  （画像消费方）              │
        └───────────────────────────┘     └─────────────────────────────┘
~~~

**为什么放后端**：会话规范日志在后端；跨设备一致；用户删除/关闭必须有一个权威数据源；
批量回填和历史会话只有后端能高效处理。

---

## 5. 数据模型（迁移 V39）

> 命名与时间戳口径沿用 AgentCore 既有约定（epoch millis、utf8mb4_general_ci、IF NOT EXISTS），
> 见 script/migration/V26__agent_chat_session.sql。最新迁移为 V38，本设计新增 **V39**。

### 5.1 agent_user_profile — trait 表

~~~sql
CREATE TABLE IF NOT EXISTS agent_user_profile (
    id             BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    trait_id       VARCHAR(64)  NOT NULL COMMENT 'Trait id (UUID)',
    tenant_id      BIGINT       NOT NULL COMMENT 'Owning tenant',
    user_id        BIGINT       NOT NULL COMMENT 'Owning user',
    dimension      VARCHAR(32)  NOT NULL COMMENT 'Allowlisted dimension',
    trait_value    VARCHAR(128) NOT NULL COMMENT 'Trait value',
    confidence     INT          NOT NULL DEFAULT 0 COMMENT 'Confidence 0-100',
    source         VARCHAR(16)  NOT NULL DEFAULT 'inferred' COMMENT 'inferred | user',
    status         VARCHAR(16)  NOT NULL DEFAULT 'active' COMMENT 'active | suppressed',
    locked         TINYINT      NOT NULL DEFAULT 0 COMMENT 'User-owned; extractor must not overwrite',
    evidence_count INT          NOT NULL DEFAULT 0 COMMENT 'Number of supporting observations',
    first_seen     BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    last_seen      BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    expires_at     BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis; 0 = never',
    create_time    BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    update_time    BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    PRIMARY KEY (id),
    UNIQUE KEY uk_profile_owner_dim_value (tenant_id, user_id, dimension, trait_value),
    KEY idx_profile_owner_status (tenant_id, user_id, status),
    KEY idx_profile_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='AgentCore derived user profile traits';
~~~

设计要点：

- **唯一键** (tenant,user,dimension,trait_value) 天然去重；suppressed 墓碑占用同一唯一键，从而阻止复活。
- locked=1 的行抽取器只更新 evidence_count，不覆盖 value。
- 不存 JSON 大字段，便于按维度查询与推荐侧筛选。

### 5.2 agent_user_profile_evidence — 证据与来源

~~~sql
CREATE TABLE IF NOT EXISTS agent_user_profile_evidence (
    id          BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    tenant_id   BIGINT       NOT NULL COMMENT 'Owning tenant',
    user_id     BIGINT       NOT NULL COMMENT 'Owning user',
    trait_id    VARCHAR(64)  NOT NULL COMMENT 'Owning trait id',
    session_id  VARCHAR(128) DEFAULT NULL COMMENT 'Source chat session',
    run_id      VARCHAR(64)  DEFAULT NULL COMMENT 'Source run',
    excerpt     VARCHAR(255) DEFAULT NULL COMMENT 'Redacted + truncated supporting text',
    observed_at BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    create_time BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    PRIMARY KEY (id),
    KEY idx_evidence_trait (tenant_id, user_id, trait_id),
    KEY idx_evidence_created (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Supporting evidence for profile traits (redacted)';
~~~

### 5.3 agent_profile_extraction — 会话水位线

~~~sql
CREATE TABLE IF NOT EXISTS agent_profile_extraction (
    id                        BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    tenant_id                 BIGINT       NOT NULL COMMENT 'Owning tenant',
    user_id                   BIGINT       NOT NULL COMMENT 'Owning user',
    session_id                VARCHAR(128) NOT NULL COMMENT 'Chat session',
    extracted_message_count   INT          NOT NULL DEFAULT 0 COMMENT 'model log length already processed',
    last_run_id               VARCHAR(64)  DEFAULT NULL COMMENT 'Run that produced the last extraction',
    model                     VARCHAR(64)  DEFAULT NULL COMMENT 'Model used',
    status                    VARCHAR(16)  NOT NULL DEFAULT 'ok' COMMENT 'ok | failed',
    create_time               BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    update_time               BIGINT       NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    PRIMARY KEY (id),
    UNIQUE KEY uk_profile_extract_session (tenant_id, user_id, session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Per-session extraction watermark';
~~~

### 5.3b agent_user_profile_consent — 同意开关

画像的全部派生都以用户主动授权为前提；缺失/关闭即派生零数据。

~~~sql
CREATE TABLE IF NOT EXISTS agent_user_profile_consent (
    id          BIGINT  NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
    tenant_id   BIGINT  NOT NULL COMMENT 'Owning tenant',
    user_id     BIGINT  NOT NULL COMMENT 'Owning user',
    enabled     TINYINT NOT NULL DEFAULT 0 COMMENT 'Whether the user opted in',
    agreed_at   BIGINT  NOT NULL DEFAULT 0 COMMENT 'Epoch millis of the latest opt-in',
    create_time BIGINT  NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    update_time BIGINT  NOT NULL DEFAULT 0 COMMENT 'Epoch millis',
    PRIMARY KEY (id),
    UNIQUE KEY uk_profile_consent_owner (tenant_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='User consent for profile derivation (opt-in)';
~~~

### 5.4 与 agent_long_memory 的关系

- **不合并**：agent_long_memory 是 Agent 的自由文本记忆，画像不写入它。
- **可能语义重叠**（例如「用户是 Java 后端工程师」），P0 允许共存，注入时用不同标题块区分；
  P2 再做一次「画像 ↔ 记忆」去重（按规范化 value 匹配）。
- 用户关闭画像**不影响** agent_long_memory（两者独立授权）。

---

## 6. 抽取流水线

### 6.1 触发时机

| 触发 | 说明 |
|---|---|
| run 终态 | DefaultRunSupervisor.onLoopExit(...) 中，status=COMPLETED 且 parentRunId == null 时，在现有 threadSummarizer.summarizeAsync(...) 旁新增 profileExtractor.extractAsync(run) |
| 节流 | 同一 session 新增可抽取消息 < min-new-messages（默认 8）时跳过，避免每轮都调 LLM |
| 静默降级 | agent.profile.enabled=false 或用户未同意 → 直接返回，不产生任何写入 |
| 批量回填 | 独立 Job（手动/定时）遍历历史会话，按水位线补齐，建议低峰执行 |

### 6.2 输入构造

1. 读取 agent_chat_session.model_messages_json（规范日志，**唯一来源**）。
2. 只保留 role 属于 {user, assistant} 且 content 非空的文本消息。
3. 跳过注入块（内容以 【用户画像】/【关于用户的长期记忆】/【本次会话的近期进展（会话记忆）】 开头）。
4. 对每段文本 SecretRedactor.redact(...)。
5. 取最近 max-transcript-chars（默认 24000）字符，超出按最早截断。
6. 附带已知画像摘要（仅 dimension+value，**不附带置信度**），让模型避免重复输出。

### 6.3 Prompt 与输出 Schema

系统提示（草案）：

~~~text
你是用户画像抽取器。请从对话中只提取“有明确证据支持”的低敏感用户特征。
允许的维度（只能用这些，值用简短中文短语）：
occupation 职业/职能角色；industry 行业/领域；expertise 专业主题；
tech_stack 工具与技术栈；content_topic 内容兴趣主题；content_format 内容形式偏好；
interaction_pref 交互/表达偏好；active_hours 活跃时段（如 09-12）。

严格规则：
1. 禁止推断性别、年龄、精神状态、性格、健康、政治宗教、性取向、位置、财务等敏感属性；
   即使对话中明确提到，也不要输出。
2. 每个特征必须能在对话中找到证据；没有证据就不要输出。
3. 不确定就用较低 confidence（0-100 整数），不要编造。
4. 只输出 JSON，不要解释、不要 Markdown 代码块。
5. 输出格式：{"traits":[{"dimension":"...","value":"...","confidence":0,"evidence":"不超过50字的原文依据"}]}
6. 没有任何可提取特征时输出 {"traits":[]}。
~~~

调用：LlmGateway.infer(LlmInferRequest.builder().model(model).messages(prompt).temperature(0.0).maxTokens(1024).build())。

### 6.4 解析与硬过滤（关键防线）

LLM 输出**不可信**，落库前必须逐条过滤：

1. JSON 解析失败 → 整批丢弃并记 status=failed。
2. dimension 不在 allowlist → 丢弃。
3. 命中敏感黑名单（性别/年龄/情绪/健康/政治/宗教/性取向/位置/财务等词表）→ 丢弃并打 warn 日志（用于调 prompt）。
4. value 为空 / 超长（超过 128）/ 含控制字符 → 丢弃。
5. confidence clamp 到 [0,100]；evidence 走 SecretRedactor 后截断到 50 字。
6. evidence 为空 → 视为无证据，丢弃。

> **测试门禁**：必须有一条单测，喂入含「我是女生/我最近抑郁/我性格内向」的对话，断言 agent_user_profile 零写入。

### 6.5 异步与并发

- 参考 ThreadSummarizer 的模式：独立 daemon ExecutorService（命名 agentcore-profile-extract），
  单线程或小线程池，避免与 run 循环争用。
- 水位线更新用**CAS 语义**（读取时拿 extracted_message_count，写入时条件更新），
  多实例下重复抽取不会产生副作用（唯一键天然幂等）。
- 失败不阻塞 run，仅记日志 + status=failed，下次重试。

### 6.6 成本记账

- 复用 ThreadSummarizer.accountUsage 的旁路记账思路：把抽取的 promptTokens/completionTokens
  记到触发它的 agent_run（RunStore.persist + saveHot），保证 AI 用量口径完整。
- 批量回填无触发 run：单独计数并打日志，不污染用户 run 用量。

### 6.7 批量回填

- 入口：管理端触发或 @Scheduled 低峰任务。
- 遍历 agent_chat_session，对每个已同意用户、每个会话按水位线增量抽取。
- 支持 dry-run 与限速，避免打爆 LLM 配额。

---

## 7. 合并、冲突与衰减

### 7.1 合并规则

- 同 (dimension, value) 再次出现 → evidence_count 加 1，last_seen 更新为当前时间，confidence 按 §7.2 提升。
- 用户 locked 的行 → 只更新证据，不覆盖 value/confidence。
- status=suppressed 的行 → **绝对不复活**，证据也不追加（隐私优先）。

### 7.2 置信度计算

~~~text
newConfidence = clamp(0, 100,
    oldConfidence + alpha * (1 - oldConfidence / 100) * recencyFactor
)
alpha = 18, recencyFactor = 1 天内为 1，之后线性衰减到 0.3（30 天）
~~~

直觉：新证据不断累加且有上限；久远的旧证据提升有限；用户自述直接置 100。

### 7.3 冲突处理

- 同一 dimension 若为**单值维度**（occupation/industry）且出现新值：
  - 不删除旧值，新增新值 trait；推荐侧取 confidence 高者。
  - 若新值 confidence 显著更高（差值不低于 20）且 last_seen 更新，旧值降权。
- 多值维度（expertise/tech_stack/…）直接并存，按置信度排序。

### 7.4 衰减与过期

- 每日定时任务按 §3.4 半衰期对所有 active trait 衰减。
- confidence 低于 25 且超过 60 天未更新 → status 保持 active 但不参与注入/推荐（软失效）。
- expires_at 到期 → 删除并清理证据。

### 7.5 用户编辑锁定

- 用户新增/修改 → source=user, locked=1, confidence=100。
- 用户删除 → status=suppressed，保留墓碑直至用户重置。
- 重置 → 物理删除该用户全部 trait/证据/水位线。

---

## 8. 上下文注入（Agent 侧）

画像注入是**可选增强**，不是 Agent 存在的必要条件。

### 8.1 注入位置

复用 ContextManager.buildVolatileContext(...)（per-turn、cache-friendly 的尾部注入），
**不放进 system 前缀**，避免破坏上下文缓存（现有注释已明确该原则：ContextManager.java 第 150-159 行）。

新增签名：

~~~java
public String buildVolatileContext(List<String> memoryLines,
                                   List<String> profileLines,   // 新增
                                   List<String> skillFragments,
                                   List<ToolSpec> deferredTools,
                                   String sessionSummary)
~~~

保留现有重载（委托到新签名，profileLines 传 null），避免破坏测试。

### 8.2 渲染

~~~text
【用户画像（低置信度仅供参考）】
- 职业: 后端工程师 (82)
- 技术栈: Java, React (74)
- 内容偏好: 长文, 图表 (68)
~~~

### 8.3 预算

- 只注入 confidence 不低于 agent.profile.inject-min-confidence（默认 55）的 trait。
- 最多 agent.profile.inject-top-k（默认 6）条，按 confidence 降序。
- agent.profile.inject-max-chars 上限（默认 600），超出即截断。

### 8.4 与长期记忆去重

P0：两块独立渲染，文案明确区分「长期记忆」与「画像」。
P2：对规范化 value 做交集去重，优先画像（结构化），记忆保留补充信息。

### 8.5 代码改动点

| 文件 | 改动 |
|---|---|
| core/memory/MemoryInjector.java | 不改；新增并列的 ProfileInjector |
| core/context/ContextManager.java | 新增 profileLines 重载与渲染 |
| core/supervisor/DefaultRunSupervisor.java | create 阶段构建 profile lines；onLoopExit 触发抽取 |
| core/loop/AgentLoop.java | buildVolatileContext 调用处传 profile lines |

---

## 9. 推荐消费

画像的最终目的是内容推荐。仓库目前**没有**推荐服务（后端仅搜到 landing 推荐码与空间动态 feed），
因此本设计给出推荐侧的**消费契约**，P0 先做规则匹配。

### 9.1 P0：规则匹配

- 候选内容（知识库页面 / 知乎/B站/小红书 connector 内容）带 tags、title、summary。
- 打分：候选 tag 命中用户 content_topic/expertise/tech_stack 则加分，权重随置信度。
- 首页 packages/plugin-main/src/pages/Home/index.tsx 增加「为你推荐」区块，排在「最近」之上。

### 9.2 内部特征接口（服务间）

~~~http
GET /api/agent/internal/v1/profile/{userId}
Header: X-Tenant-Id / 服务凭证
返回 { "traits": [ { "dimension": "...", "value": "...", "confidence": 82 } ], "consent": true }
~~~

- 只返回 active 且未软失效的 trait，不回传证据（证据只给用户本人）。
- 推荐服务可用 Feign 调用；P0 可先由前端直接读用户端接口做本地排序。

### 9.3 排序公式（P0 草案）

~~~text
score(content) = 匹配 trait 求和: w[dimension] * (confidence/100)
               + beta * freshness(content)
               - gamma * alreadySeen
~~~

权重 w：content_topic 1.0、expertise 0.9、tech_stack 0.6、industry 0.4、content_format 0.3。

### 9.4 冷启动

- 无画像 / 未同意：退回现有「最近 + 收藏」排序，不改变行为。
- 新用户：可用 onboarding 让用户主动选 2-3 个感兴趣主题（source=user），立即获得可解释推荐。

### 9.5 可解释性

每条推荐展示理由，如「因为你关注 **AI Agent**」。理由来自命中的 trait，而不是黑盒。

---

## 10. 后端 API 契约

所有用户端接口挂在 /api/agent/v1/profile，身份从 SecurityContextUtil 取（参考 ChatSessionController），
统一返回 R<...>（com.knowledge.core.tool.api.R）。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/agent/v1/profile | 读取本人画像（trait 列表 + consent 状态） |
| GET | /api/agent/v1/profile/traits/{traitId}/evidence | 读取某 trait 的证据（脱敏） |
| POST | /api/agent/v1/profile/traits | 新增用户自述 trait（source=user, locked=1） |
| PUT | /api/agent/v1/profile/traits/{traitId} | 编辑 trait（锁定） |
| DELETE | /api/agent/v1/profile/traits/{traitId} | 删除 trait（写 suppressed 墓碑） |
| DELETE | /api/agent/v1/profile | 重置全部画像与证据 |
| GET | /api/agent/v1/profile/consent | 查询同意状态 |
| PUT | /api/agent/v1/profile/consent | 开启/关闭；关闭即清空 |
| GET | /api/agent/internal/v1/profile/{userId} | 内部特征接口（服务间，不回证据） |

约束：

- 路径参数 traitId 必须校验归属（tenant_id + user_id），否则 R.fail。
- 请求体 value 长度不超过 128，dimension 必须在 allowlist。
- 关闭同意后的清空操作必须幂等。

---

## 11. 前端设计

### 11.1 画像中心

- 位置：设置 → 个人中心 → 「我的画像」（packages/core/src/components/settings）。
- 内容：同意开关 + trait 列表（维度/值/置信度/来源）+ 编辑/删除 + 证据查看 + 一键重置。
- 文案必须直白说明：数据来自 AI 会话、只做低敏感维度、可随时删除。

### 11.2 首页推荐位

- packages/plugin-main/src/pages/Home/index.tsx 新增「为你推荐」区块。
- 卡片展示命中理由；无画像时整块隐藏。

### 11.3 首次告知

- 用户开启画像前弹一次性说明（目的、维度、来源、权利），确认后才写 consent.enabled=true。

---

## 12. 配置项

新增 AgentCoreProperties.Profile（前缀 agent.profile），沿用现有配置风格：

~~~yaml
agent:
  profile:
    enabled: false                 # 总开关，灰度期默认关
    model: ""                      # 空 = 跟随触发 run 的模型
    max-transcript-chars: 24000
    max-output-tokens: 1024
    min-new-messages: 8            # 会话新增消息少于此值不抽取
    inject-min-confidence: 55
    inject-top-k: 6
    inject-max-chars: 600
    evidence-retention-days: 90
    decay-cron: "0 30 3 * * ?"     # 每日衰减
    max-traits-per-user: 200
    max-evidence-per-trait: 20
    backfill-batch-size: 50
~~~

---

## 13. 兼容、灰度与迁移

- 新增迁移 **V39__agent_user_profile.sql**，纯新增表，不改动现有表。
- agent.profile.enabled 默认 false，无画像时所有现有行为**完全不变**。
- 上线顺序：DB 迁移 → 后端（开关关）→ 用户画像中心（P0 只读/同意）→ 开启抽取 → 首页推荐位。
- 关闭开关只停止新抽取，已抽取数据按用户意愿保留/删除。

---

## 14. 分阶段落地

| 阶段 | 范围 |
|---|---|
| **P0** | 同意与数据模型（V39）、抽取流水线 + 硬过滤、用户端读/编辑/删除/关闭 API、ProfileInjector 注入、画像中心 UI、单测与合规门禁 |
| **P1** | 证据展示、衰减定时任务、批量回填 Job、首页「为你推荐」规则排序、内部特征接口 |
| **P2** | 画像 ↔ 长期记忆去重、向量/学习排序、更多数据源（评论、浏览行为）、管理端可观测量、跨端同步优化 |

---

## 15. 测试策略

| 层 | 用例 |
|---|---|
| 抽取器单测 | JSON 解析成功/失败；allowlist 过滤；**敏感词零写入**；空证据丢弃 |
| 脱敏单测 | SecretRedactor 命中后证据不含密钥 |
| 注入块防护单测 | 输入含【用户画像】等注入块时不被二次抽取 |
| 合并单测 | 置信度累加、locked 不被覆盖、suppressed 不复活、冲突降权 |
| 衰减单测 | 半衰期计算、软失效、过期删除 |
| Controller 映射单测 | 参考 ChatSessionControllerMappingTest，覆盖每个路由与身份校验 |
| 集成测试 | mock LlmGateway，run completed → 异步抽取 → trait 落库；账务计数正确 |
| 合规测试 | 未同意用户零写入；关闭后物理删除；租户隔离（A 租户读不到 B） |

参考后端测试命令（backend/knowledgecloud/CLAUDE.md）：

~~~bash
cd backend/knowledgecloud
JAVA_HOME=../../.toolchain/jdk-17.0.20+8/Contents/Home mvn -o -pl knowledge-service/knowledge-agent-skills -am test
~~~

---

## 16. 风险与开放问题

| 风险 | 应对 |
|---|---|
| LLM 幻觉出无证据特征 | §6.4 硬过滤 + 要求 evidence + confidence 门槛 |
| 画像自我强化 | 跳过注入块 + 抽取输入不含画像置信度 |
| 敏感属性被间接推断 | allowlist + 敏感词黑名单 + 合规单测 |
| 抽取成本 | 节流 + 低峰回填 + 旁路记账 |
| 用户不信任 | 默认关、完全透明、可删除、可解释推荐 |
| 与长期记忆语义重叠 | P0 文案区分，P2 去重 |

**开放问题（待评审确认）**

1. 抽取模型用便宜小模型还是跟随 run 模型？（建议：默认小模型，可配置）
2. active_hours 需要精确到时区吗，还是只记用户本地小时段？（建议后者）
3. P0 推荐位是否先只做前端本地规则，还是直接建内部特征接口？
4. 批量回填只回填已同意用户，历史同意状态无法追溯时是否一律跳过？（建议一律跳过）

---

## 17. 附录：涉及文件清单

**新增（后端 knowledge-service/knowledge-agent-skills）**

~~~text
script/migration/V39__agent_user_profile.sql
core/entity/AgentUserProfileEntity.java
core/entity/AgentUserProfileEvidenceEntity.java
core/entity/AgentProfileExtractionEntity.java
core/entity/AgentUserProfileConsentEntity.java
core/mapper/AgentUserProfileMapper.java
core/mapper/AgentUserProfileEvidenceMapper.java
core/mapper/AgentProfileExtractionMapper.java
core/mapper/AgentUserProfileConsentMapper.java
core/profile/ProfileDimension.java          # allowlist + 敏感黑名单
core/profile/ProfileTrait.java
core/profile/ProfileTraitDraft.java
core/profile/ProfileSensitivity.java
core/profile/ProfileStore.java
core/profile/ProfileExtractionService.java  # 异步触发 + 水位线
core/profile/ProfileMerger.java             # 合并/冲突/衰减
core/profile/ProfileInjector.java
core/web/UserProfileController.java
core/web/dto/ProfileTraitView.java
core/web/dto/UpsertProfileTraitRequest.java
core/web/dto/ProfileConsentRequest.java
~~~

**修改（后端）**

~~~text
core/config/AgentCoreProperties.java        # 新增 Profile 配置块
core/context/ContextManager.java            # 新增 profileLines 重载与渲染
core/supervisor/DefaultRunSupervisor.java   # 触发抽取 + 构建注入行
core/loop/AgentLoop.java                    # 传 profile lines
src/main/resources/application.yml / application-dev.yml
~~~

**修改（前端）**

~~~text
packages/core/src/components/settings/components/MyProfile.tsx  # 「我的画像」面板
packages/common/src/ai/agent/types.ts          # AgentProfile / AgentProfileTrait / AgentProfileEvidence
packages/common/src/ai/agent/client.ts         # AgentClient 画像读写方法
packages/common/src/utils/request.tsx           # 复用现有请求层（若需新增 API）
packages/plugin-main/src/pages/Home/index.tsx   # 「为你推荐」区块（P1）
~~~

**测试（新增，参考现有命名）**

~~~text
core/profile/ProfileExtractionServiceTest.java
core/profile/ProfileMergerTest.java
core/profile/ProfileInjectorTest.java
core/web/UserProfileControllerMappingTest.java
~~~

---

*本规格为设计稿，实现前请先在评审中确认 §16 的开放问题。*
