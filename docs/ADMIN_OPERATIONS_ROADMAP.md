# Admin 模块持续运营功能规划（Roadmap）

> 面向项目上线后的持续运营，围绕四大方向规划 admin（`apps/admin`）能力建设：
> **数据分析与增长、AI 用量与成本管控、内容治理与审核、系统稳定性与安全**，
> 并补充**空间/页面（Space / Page）治理与运营**能力。
>
> 本文档为规划基线，各期功能实施时单独立项，接口与 DDL 以实施时评审为准。

---

## 1. 现状基线

### 1.1 前端现状（apps/admin）

技术栈：React 18 + Vite + TypeScript + `@kn/ui`（Radix + Tailwind）+ `@kn/icon`，请求层 `src/lib/request.ts`，API 定义集中于 `src/api/index.ts`。

| 页面 | 路径 | 现有能力 |
| --- | --- | --- |
| 仪表盘 | `pages/dashboard` | 用户/空间/页面/评论总量卡片、页面状态饼图、最近 API 日志（均为"取 total"的拼凑统计，无趋势） |
| 用户管理 | `pages/users` | 分页列表、搜索、新增/编辑、删除、授权角色、重置密码 |
| 角色管理 | `pages/roles` | 列表/树、新增/编辑、删除、授权 |
| 空间管理 | `pages/spaces` | 分页列表、按类型筛选、搜索（**只读，无任何操作**） |
| 页面管理 | `pages/pages` | 分页列表、按状态筛选、单条回收站恢复 |
| 评论审核 | `pages/comments` | 列表、解决/重开、删除 |
| 插件管理 | `pages/plugins` | 列表、按分类筛选（生命周期操作待补） |
| 日志中心 | `pages/logs` | API / 业务 / 异常 三类日志分页查看 |
| AI 配置 | `pages/ai` | 模型参数配置（基于系统参数 `/param`） |
| 系统设置 | `pages/settings` | 系统参数管理 |
| 登录 | `pages/login` | OAuth2 password 模式（`/knowledge-auth/oauth2/token`） |

### 1.2 后端现状（backend/knowledgecloud）

| 模块 | 已有能力（与运营相关） |
| --- | --- |
| knowledge-system | 用户/角色/租户/部门/岗位 CRUD、系统参数 `/param`；`knowledge_user` 表**已有 `status` 列但 `User` 实体未映射**，无禁用/启用接口 |
| knowledge-wiki | 空间/页面/评论/插件接口；`wiki_space_activity` 空间活动流（PAGE_CREATED / PAGE_EDITED / MEMBER_JOINED / COMMENT_ADDED 等）+ `/space/{spaceId}/activity/list`；Space 实体已有 `archived`、`status` 字段 |
| knowledge-agent-skills | `agent_conversation.total_tokens`、`agent_message.tokens` 已记录用量；`ExecutionState` 有 prompt/completion token 累计；`MetricsInterceptor` / `AgentMetrics` 目前仅日志输出，未接 Micrometer |
| knowledge-log | `knowledge_log_api` / `knowledge_log_usual` / `knowledge_log_error` 三表 + 分页查询接口（`AbstractLog` 含 remoteIp、userAgent、time、createBy） |
| knowledge-message | 站内信 `knowledge_message`、即时消息 `knowledge_instant_message`、WebSocket 单发 `/notification/send` 与批量 `/notification/send-batch`、在线用户统计 |
| knowledge-auth | OAuth2 登录；**无登录成功/失败日志落库** |
| knowledge-file-center | 文件/附件存储；无按空间聚合的占用统计 |

### 1.3 关键缺口汇总

1. **统计聚合**：无按天聚合的运营指标接口（注册数、内容生产、DAU、留存）。
2. **AI 成本**：有 token 记录，无按天/用户/模型的聚合查询，无模型单价与成本折算，无限额。
3. **安全审计**：无登录日志（成功/失败/IP/UA）、无用户禁用/封禁、无 admin 操作审计。
4. **内容治理**：无举报机制、无敏感词库、评论审核缺上下文。
5. **运营触达**：无全员/定向公告能力。
6. **Space/Page 治理**：空间页只读；页面仅单条恢复；无详情、归档、批量操作、内容核查、版本回滚。

---

## 2. 第一期：运营看板 + 基础管控（上线即需）

> 目标：上线当天运营侧能"看得见数据、管得住用户、护得住内容"。
> 优先级：P0。预估以周为粒度排期，前后端可并行。

### 2.1 数据分析与增长

**功能**
- Dashboard 重构：注册趋势、内容生产趋势（页面创建/编辑）、DAU 趋势折线图（7/30/90 天切换）；TOP 活跃空间榜单。

**接口缺口**

| 能力 | 现有接口 | 需新增 |
| --- | --- | --- |
| 按天注册数 | 无 | `GET /knowledge-system/admin/stats/user-registrations?days=30` |
| 按天内容生产 | `wiki_space_activity` 有原始数据，无聚合 | `GET /knowledge-wiki/admin/stats/content-trend?days=30`（按 action_type 聚合） |
| DAU | 无 | `GET /knowledge-system/admin/stats/dau?days=30`（`knowledge_log_api.create_by` 按天去重，近似口径） |
| TOP 活跃空间 | 无 | `GET /knowledge-wiki/admin/stats/top-spaces?days=7&limit=10` |

**实现要点**
- 后端 `knowledge-system` 新增 `AdminStatsController`，`knowledge-wiki` 新增 `WikiStatsController`（管理端接口统一 `/admin/stats/*` 前缀，网关侧限制 admin 角色）。
- 聚合 SQL 直接 `GROUP BY DATE(create_time)`，量级可控；后续量大再引入日汇总表。
- 前端复用 `@kn/ui` 的 ChartContainer（Dashboard 已用 PieChart，补 LineChart/BarChart）。

### 2.2 AI 用量与成本管控

**功能**
- 「AI 用量」新页面：用量趋势图（按天）、按用户 TOP 消耗榜、按模型用量/成本分布、模型单价维护表单。

**接口缺口**

| 能力 | 现有 | 需新增 |
| --- | --- | --- |
| 用量按天聚合 | `agent_conversation.total_tokens`、`agent_message.tokens`（原始数据） | `GET /knowledge-agent-skills/admin/ai/usage/trend?days=30` |
| 按用户聚合 | 无 | `GET /knowledge-agent-skills/admin/ai/usage/by-user?days=30&limit=20` |
| 按模型聚合 | `agent_conversation.model` 可用 | `GET /knowledge-agent-skills/admin/ai/usage/by-model?days=30` |
| 模型单价 CRUD | 无 | `GET/POST /knowledge-agent-skills/admin/ai/model-price` |

**表结构草案**

```sql
CREATE TABLE IF NOT EXISTS agent_model_price (
    id            BIGINT PRIMARY KEY AUTO_INCREMENT,
    model_name    VARCHAR(128) NOT NULL UNIQUE COMMENT '模型名，与 agent_conversation.model 对应',
    prompt_price  DECIMAL(12,6) NOT NULL DEFAULT 0 COMMENT '输入单价（每 1K token）',
    completion_price DECIMAL(12,6) NOT NULL DEFAULT 0 COMMENT '输出单价（每 1K token）',
    currency      VARCHAR(8)   NOT NULL DEFAULT 'CNY',
    remark        VARCHAR(255),
    create_time   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted    TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='模型单价表';
```

**实现要点**
- 成本 = Σ(prompt_tokens × prompt_price + completion_tokens × completion_price) / 1000；`agent_message` 目前只有合计 `tokens`，一期按合计口径折算（取两单价均值或以 completion 单价保守估计），实施时在 `agent_message` 增列 `prompt_tokens` / `completion_tokens` 精确化。

### 2.3 空间与页面治理（Space / Page）

**功能**
- 空间详情抽屉：成员列表（含角色）、空间活动流、页面数/评论数统计。
- 空间治理操作：归档/取消归档、停用/启用；列表增加状态筛选与操作列。
- 页面管理增强：回收站批量恢复/彻底删除、页面内容只读预览（管理员核查）、按空间/作者/时间筛选。

**接口缺口**

| 能力 | 现有 | 需新增 |
| --- | --- | --- |
| 空间详情聚合 | `GET /space/list`（列表） | `GET /knowledge-wiki/space/{id}/admin-detail`（基本信息 + 成员数 + 页面数 + 评论数） |
| 空间成员列表 | 客户端有成员接口（面向本空间成员） | `GET /knowledge-wiki/admin/space/{id}/members`（管理端，越过成员身份校验） |
| 空间活动流 | `GET /space/{spaceId}/activity/list` 已有 | 直接复用 |
| 归档/取消归档 | Space 实体已有 `archived` | `PUT /knowledge-wiki/admin/space/{id}/archive`、`.../unarchive` |
| 停用/启用 | Space 实体已有 `status` | `PUT /knowledge-wiki/admin/space/{id}/status?value=ACTIVE|IN_ACTIVE` |
| 页面批量恢复 | `PUT /space/page/{id}/restore`（单条） | `PUT /knowledge-wiki/admin/page/batch-restore`（body: ids） |
| 页面彻底删除 | 无 | `DELETE /knowledge-wiki/admin/page/batch`（body: ids，仅允许 TRASH 状态） |
| 页面只读预览 | 客户端页面详情接口已有 | 管理端复用详情接口 + 前端只读 Editor（`@kn/editor` readonly 模式）渲染 |
| 页面筛选增强 | `GET /space/page/list`（已支持 status/spaceId/searchValue） | 补充 `createUser`、`startTime/endTime` 查询参数 |

**实现要点**
- 管理端接口统一放 `/admin/**` 路径，网关 + 服务双层校验 admin 角色，避免与客户端接口的空间成员权限逻辑混用。
- 彻底删除为高危操作：前端二次确认 + 后端仅允许 TRASH 状态页面，操作落审计（三期审计表就绪前先写 usual log）。

### 2.4 用户管控与安全

**功能**
- 用户禁用/启用（状态列 + 操作），被禁用用户无法登录。
- 登录日志（成功/失败、IP、UA、时间），日志中心新增「登录日志」Tab。

**接口缺口**

| 能力 | 现有 | 需新增 |
| --- | --- | --- |
| 用户状态 | `knowledge_user.status` 列已存在，实体未映射 | `User` 实体补 `status` 字段；`POST /knowledge-system/user/enable`、`/user/disable`（传 userIds） |
| 登录校验 | 无状态校验 | `knowledge-auth` 登录链路校验 `status`，禁用返回明确错误码 |
| 登录日志 | 无 | 新表 `knowledge_log_login` + `GET /knowledge-log/login/list` |

**表结构草案**

```sql
CREATE TABLE IF NOT EXISTS knowledge_log_login (
    id          BIGINT NOT NULL COMMENT '主键',
    tenant_id   VARCHAR(12) DEFAULT '000000',
    account     VARCHAR(45) COMMENT '登录账号',
    user_id     BIGINT COMMENT '用户ID（登录成功时）',
    success     TINYINT(1) NOT NULL COMMENT '1=成功 0=失败',
    fail_reason VARCHAR(255) COMMENT '失败原因：BAD_CREDENTIALS/USER_DISABLED/...',
    remote_ip   VARCHAR(64),
    user_agent  VARCHAR(1000),
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_account_time (account, create_time),
    KEY idx_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='登录日志表';
```

**实现要点**
- 登录日志同时是二期留存分析、三期防暴力破解的数据基础，一期必须落地。
- 前端 `LogList.tsx` 已是多 Tab 结构（api/usual/error），扩展 `login` 一类即可。

---

## 3. 第二期：内容治理 + 运营触达

> 目标：UGC 风险可控，运营可主动触达用户。优先级：P1。

### 3.1 内容治理

**功能**
- 举报：客户端对页面/评论发起举报；admin「举报处理」页查看目标内容、处理（封禁内容/驳回）。
- 敏感词库：词库 CRUD；评论/页面发布时同步过滤（命中策略：拦截或替换，走系统参数配置）。
- 评论审核增强：查看所在页面上下文、批量删除、按用户筛选。

**接口缺口**

| 能力 | 现有 | 需新增 |
| --- | --- | --- |
| 举报提交 | 无 | `POST /knowledge-wiki/report`（客户端） |
| 举报列表/处理 | 无 | `GET /knowledge-wiki/admin/report/list`、`PUT /admin/report/{id}/resolve`、`/reject` |
| 敏感词 CRUD | 无 | `GET/POST/DELETE /knowledge-system/admin/sensitive-word` |
| 敏感词校验 | 无 | 公共校验组件（knowledge-common），评论/页面保存链路调用，词库热加载 |
| 评论批量删除 | `DELETE /comment/{id}`（单条） | `POST /knowledge-wiki/admin/comment/batch-remove` |
| 评论按用户筛选 | `GET /comment/list`（searchValue/resolved） | list 增加 `userId` 参数 |

**表结构草案**

```sql
CREATE TABLE IF NOT EXISTS wiki_content_report (
    id          BIGINT NOT NULL COMMENT '主键',
    target_type VARCHAR(20) NOT NULL COMMENT 'PAGE | COMMENT',
    target_id   BIGINT NOT NULL,
    reason_type VARCHAR(32) NOT NULL COMMENT 'SPAM|ABUSE|ILLEGAL|OTHER',
    reason_text VARCHAR(500),
    reporter_id BIGINT NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING|RESOLVED|REJECTED',
    handler_id  BIGINT COMMENT '处理人',
    handle_note VARCHAR(500),
    handle_time DATETIME,
    tenant_id   VARCHAR(12) DEFAULT '',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_deleted  INT DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_status_time (status, create_time),
    KEY idx_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='内容举报表';

CREATE TABLE IF NOT EXISTS knowledge_sensitive_word (
    id          BIGINT NOT NULL,
    word        VARCHAR(128) NOT NULL,
    category    VARCHAR(32) DEFAULT 'GENERAL',
    action      VARCHAR(16) NOT NULL DEFAULT 'BLOCK' COMMENT 'BLOCK=拦截 REPLACE=替换',
    enabled     TINYINT(1) NOT NULL DEFAULT 1,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_deleted  INT DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uk_word (word)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='敏感词表';
```

### 3.2 运营触达（公告）

**功能**
- admin「公告管理」页：发布（标题、正文、生效区间、目标 ALL/指定租户）、下线、触达统计（送达/已读数）。
- 用户侧：在线用户 WebSocket 实时推送 + 站内信落库（离线用户登录后可见）。

**接口缺口**

| 能力 | 现有 | 需新增 |
| --- | --- | --- |
| 公告 CRUD | 无 | `GET/POST /knowledge-message/admin/announcement`、`PUT /{id}/offline` |
| 推送 | `/notification/send-batch`（需显式 userIds） | 公告发布时服务端查询目标用户集合 → 复用批量推送 + 站内信落库 |
| 触达统计 | `knowledge_message.status`（READ/UNREAD） | `GET /knowledge-message/admin/announcement/{id}/stats` |

**表结构草案**

```sql
CREATE TABLE IF NOT EXISTS knowledge_announcement (
    id           BIGINT NOT NULL,
    title        VARCHAR(255) NOT NULL,
    body         TEXT NOT NULL,
    target_scope VARCHAR(16) NOT NULL DEFAULT 'ALL' COMMENT 'ALL | TENANT',
    target_tenant_id VARCHAR(12) COMMENT 'target_scope=TENANT 时有效',
    start_time   DATETIME COMMENT '生效开始',
    end_time     DATETIME COMMENT '生效结束',
    status       VARCHAR(16) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT|PUBLISHED|OFFLINE',
    publisher_id BIGINT,
    publish_time DATETIME,
    create_time  DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_deleted   INT DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_status (status, start_time, end_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公告表';
```

### 3.3 增长深化

- 留存分析：基于 `knowledge_log_login` 计算次日/7 日留存曲线，`GET /knowledge-system/admin/stats/retention`。
- 静默用户：N 天未登录用户列表 + CSV 导出，`GET /knowledge-system/admin/stats/silent-users?days=14`，配合公告定向召回。

### 3.4 空间与页面运营

| 功能 | 说明 | 接口缺口 |
| --- | --- | --- |
| 空间所有权转让 | 成员离职/流失场景，管理员将 owner 转给指定成员 | `PUT /knowledge-wiki/admin/space/{id}/transfer-owner?userId=` |
| 僵尸空间识别 | N 天无 `wiki_space_activity` 记录的空间列表，支持批量归档 | `GET /knowledge-wiki/admin/space/inactive?days=90`、`PUT /admin/space/batch-archive` |
| 热门内容榜 | 最近 7/30 天编辑/评论最活跃的页面与空间（`wiki_space_activity` 聚合），供运营选材与首页推荐 | `GET /knowledge-wiki/admin/stats/hot-pages`、`/hot-spaces` |
| 孤儿页面清理 | 无有效 parentId / 所属空间已删除的页面扫描，批量移入回收站 | `GET /knowledge-wiki/admin/page/orphans`、`PUT /admin/page/batch-trash` |
| 页面版本管理 | 管理端查看页面版本历史（复用已有块版本/封版能力）并回滚到指定版本，用于误删/恶意篡改恢复 | `GET /knowledge-wiki/admin/page/{id}/versions`、`PUT /admin/page/{id}/rollback?versionId=` |

---

## 4. 第三期：精细化与稳定性

> 目标：成本可约束、故障可定位、操作可追责。优先级：P2。

### 4.1 AI 限额

- 新表 `agent_quota`（维度：用户/租户；每日 token 预算；超限动作：拦截/告警）。
- Agent 执行链路（`ExecutionState.addTokenUsage` 处）前置检查当日累计用量，超限中断并返回明确错误事件。
- admin 新增限额管理：查看当日用量/预算比例、调整预算。

```sql
CREATE TABLE IF NOT EXISTS agent_quota (
    id           BIGINT PRIMARY KEY AUTO_INCREMENT,
    subject_type VARCHAR(16) NOT NULL COMMENT 'USER | TENANT',
    subject_id   VARCHAR(64) NOT NULL,
    daily_token_limit BIGINT NOT NULL DEFAULT 0 COMMENT '0=不限',
    action       VARCHAR(16) NOT NULL DEFAULT 'BLOCK' COMMENT 'BLOCK | WARN',
    enabled      TINYINT(1) NOT NULL DEFAULT 1,
    create_time  DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_subject (subject_type, subject_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 用量限额表';
```

### 4.2 可观测性与稳定性

- `MetricsInterceptor` / `AgentMetrics` 从日志输出升级为 Micrometer 指标，接 Prometheus（QPS、LLM 延迟、token、错误率）。
- 慢接口分析：`knowledge_log_api.time` 聚合 TOP 慢接口、按 URI 的错误率看板（`GET /knowledge-log/admin/stats/slow-api`）。
- 异常聚合：`knowledge_log_error` 按 `exception_name + method_class` 聚合去重展示，突出新增异常。

### 4.3 操作审计

- 新表 `knowledge_log_audit`（操作人、操作类型、目标、before/after 摘要、IP、时间）。
- admin 所有写操作（删用户、禁用用户、删评论、改参数、彻底删页面、公告发布等）通过注解 AOP 落审计。
- admin 新增「操作审计」查询页（按操作人/类型/时间筛选）。

### 4.4 租户与权限

- 租户管理页：后端 `/knowledge-system/tenant/*` 接口已具备，前端补页面（列表、新增/编辑、状态）。
- 角色权限细化：菜单级权限点，admin 左侧导航按权限渲染，接口按权限校验。

### 4.5 存储治理

- 按空间统计附件/文件占用（knowledge-file-center 聚合），TOP 占用榜与清理入口。
- `GET /knowledge-file-center/admin/stats/storage-by-space`；为后续容量配额策略做数据准备。

---

## 5. 优先级与依赖关系

```
第一期（P0，上线即需）
├── 统计聚合接口 ──────────┐
│                          ├──> Dashboard 重构
├── 登录日志（表+落库）────┤
│         │                └──> 「登录日志」Tab
│         └──（数据基础）──────> 二期留存分析 / 三期防暴力破解
├── 用户禁用/启用（status 映射 + auth 校验）
├── AI 用量聚合 + 模型单价 ───> 「AI 用量」页 ───>（数据基础）三期 AI 限额
└── Space/Page 治理（详情抽屉、归档、批量恢复/删除、只读预览）

第二期（P1）
├── 举报 + 敏感词 + 评论增强（内容治理闭环）
├── 公告（依赖 knowledge-message 既有推送能力）
├── 留存/静默用户（依赖一期登录日志）
└── 空间运营（转让、僵尸空间、热门榜、孤儿页、版本回滚）

第三期（P2）
├── AI 限额（依赖一期用量聚合口径）
├── Micrometer/Prometheus + 慢接口 + 异常聚合
├── 操作审计（覆盖一二期全部写操作）
├── 租户管理页 + 菜单级权限
└── 存储治理
```

**横切约束**
- 所有管理端新接口统一 `/admin/**` 前缀，网关 + 服务双层 admin 角色校验。
- 高危操作（彻底删除、封禁、回滚）：前端二次确认，后端状态校验，全部纳入审计范围。
- 分页参数口径遵循现状：system/log 用 `current+size`，wiki 用 `current+pageSize`（见 `apps/admin/src/api/index.ts` 头部注释）。

## 6. 假设与口径说明

- 统计接口放在各自所属服务（stats 在 system/wiki、AI 用量在 agent-skills），不新建独立统计服务；量级增大后再考虑日汇总表或独立 OLAP。
- DAU 一期以 `knowledge_log_api.create_by` 按天去重为近似口径，登录日志上线后切换为"登录+API 活跃"复合口径，前端埋点方案另行评估。
- AI 成本一期按 `agent_message.tokens` 合计口径折算，精确拆分 prompt/completion 需为 `agent_message` 增列，随一期实施评审决定。
