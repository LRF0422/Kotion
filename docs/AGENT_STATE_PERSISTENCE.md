# Agent 运行时状态持久化（存算分离，全链路可恢复）

> **目标**：关掉软件（刷新、关窗、退出、崩溃、换设备）再打开，能回到上次的工作：
> 同一个会话、同一轮 run、同一个待执行的工具/审批/表单、同一个后台任务、同一份草稿。
>
> **原则**：不是把所有东西都塞进一个库，而是给**每一个运行时状态**指定
> **owner（谁拥有）+ store（存哪）+ recovery（怎么恢复）**。
>
> - **服务端存"领域事实"**：会话、run、checkpoint、事件、待执行动作、表单、审批、任务、订阅。
> - **客户端存"设备/执行状态"**：工作区（tab/草稿/路由/面板）、run 句柄、工具执行日志、UI 缓存。
> - **主进程存"能力描述"**：dev/SSH/定时器的元数据；连接本身不持久化，启动时对账成 disconnected。
> - **不可持久化的东西**（Promise、socket、子进程）不假装能恢复；持久化它的**意图/断点/租约**，
>   启动时 resume 或明确失败。

## 1. 现状盘点

### 1.1 已经持久化的（服务端）

| 状态 | 载体 | 关闭后 | 备注 |
| --- | --- | --- | --- |
| 会话元数据 + 规范消息日志 | `agent_chat_session.model_messages_json` | 在 | UI transcript 是纯投影 |
| UI transcript | `agent_chat_session.messages_json` | 在 | 可重建缓存 |
| run 状态 | `agent_run` | 在 | QUEUED/RUNNING/WAITING_TOOLS/SUSPENDED/... |
| run 快照 | `agent_run_checkpoint` | 在 | 崩溃恢复 = 快照 + 事件重放 |
| run 事件 | `agent_run_event`（Redis 热 + MySQL 冷） | 在 | 每 run 只保留最近 2000 条 |
| 会话任务清单 | `agent_session_task` | 在 | `update_todos` 快照 |
| 后台任务 | `agent_bg_task` 等（V47） | 在 | 客户端执行、服务端存储 |
| 记忆/画像/技能/用量 | 各自表 | 在 | — |

这些是"继续上次工作"的**基础**，但只覆盖了模型侧；下面这些仍然会丢。

### 1.2 关闭后会丢的（关键缺口）

| 状态 | 现在存哪 | 关闭后 | 后果 |
| --- | --- | --- | --- |
| **表单请求**（`requestUserForm`） | 客户端内存 `FormRequestRegistry` | 丢 | 用户填到一半的表单消失；run 恢复后重新建一张，旧答案永远回不来 |
| **工具审批** | 客户端内存 `ToolApprovalRegistry` | 丢 | 重新执行 pending 工具会再弹一次；已批准但没执行的意图丢失 |
| **工具执行日志** | localStorage（`agentcore:tool-results:*`） | 有限 TTL/quota；`started` 状态会 fail-closed | 上次执行到一半的工具无法安全重试，只能报错 |
| **run 句柄** | localStorage，30 分钟 TTL | 超过 TTL 后靠 `thread.activeRunId` 兜底 | 兜底失败就找不到正在跑的 run |
| **草稿输入** | 组件内存 | 丢 | 关窗前写了一半的消息没了 |
| **当前路由 / 滚动位置 / 大部分面板布局** | 路由缓存内存（少量宽度等已有零散 localStorage） | 丢 | 回到应用是默认页，不是上次的工作现场 |
| **待发消息队列** | 组件内存 | 丢 | 已显示但还没发出去的消息消失 |
| **主进程 dev 会话** | `DevSession` Map | 丢（子进程也没了） | 开发台不知道上次在跑什么；只能靠日志/工程根重开 |
| **SSH shell / tunnel** | 主进程 Map | 丢（socket 没了） | 任务板/插件不知道上次连了哪台机、哪条隧道 |
| **`background.*` 定时器** | 每个 renderer 的 Map | 丢 | 周期性任务停止，直到插件重新注册 |
| **加载过的技能缓存** | localStorage | 在（设备级） | 可接受，但应迁到统一 store |

### 1.3 服务端也还不够的

| 缺口 | 现状 | 目标 |
| --- | --- | --- |
| **启动恢复慢** | reconcile 每 15s 扫，要求 `update_time < now-60s`；重启后最长 60-75s 空窗 | 启动即扫非终态 run，按 checkpoint 恢复/置 `SUSPENDED/client_detached` |
| **活动 run 发现** | 客户端靠 `thread.activeRunId`；没有"列出本会话非终态 run"的接口 | `GET /runs?conversationId=&status=active`（或 `pending`） |
| **pending 工具** | 只在 checkpoint 里，`RunView.pendingTools` 有列表但没有执行状态 | `agent_tool_call` 表 + started/completed/uncertain |
| **审批/表单** | 客户端内存 | 服务端 `agent_form_request` / 审批状态，跨设备可填 |
| **计划/预算挂起** | `SUSPENDED` 持久化，但无 TTL | 加 TTL + 明确过期原因；UI 按 run 恢复 |
| **事件裁剪** | 2000 条后 gap | gap 时从 checkpoint + transcript 全量重建，而不是放弃 |
| **跨设备工作区** | 只有 localStorage | 可选 `agent_workspace_state`（设备维度） |

## 2. 状态所有权矩阵

| 层 | 拥有什么 | 存储 | 恢复方式 |
| --- | --- | --- | --- |
| **Server（领域事实）** | 会话/消息、run、checkpoint、事件、pending tool、审批、表单、计划/预算、任务、订阅、产物引用 | MySQL（+ Redis 热层） | 启动扫描 + 快照/事件重放 + pending action |
| **Client（设备/执行）** | 工作区（tab/active/draft/route/panel/scroll）、run 句柄、工具执行日志、UI 缓存 | 桌面 SQLite（`StorageService`）/ Web IndexedDB；localStorage 仅做同步缓存/迁移 | 启动读本地 → 拉服务端 → 按会话重建 |
| **Host（能力）** | dev 会话描述、SSH 会话描述、定时器描述、插件运行时 | 主进程 SQLite/JSON 描述文件 | 启动对账：连接没了 → disconnected；定时器重挂 |
| **Plugin** | 配置/密钥、插件自己的 UI 状态、长任务 | `StorageService` / 服务端任务 | 配置读回；任务按服务端状态恢复 |

**一个状态只能有一个权威 owner。** UI 投影、产物、列表排序等派生状态不重复存，启动时重建。

## 3. 目标架构

```
┌──────────────────────── 客户端（设备） ────────────────────────┐
│ AgentStateStore（SQLite / IndexedDB）                          │
│   workspace / draft / route / panel / run-handle / tool-journal │
│   ↑ 启动恢复                         ↓ 变更防抖写              │
│ Agent SDK：attach(run) / pending actions / UI                  │
└───────────────────────────────┬────────────────────────────────┘
                                │ HTTPS + SSE（JWT）
┌───────────────────────────────▼────────────────────────────────┐
│ 服务端（领域事实）                                              │
│ agent_chat_session / agent_run / checkpoint / event             │
│ agent_tool_call / agent_form_request / agent_tool_approval      │
│ agent_bg_task / watch / note                                    │
│ agent_workspace_state（可选，跨设备）                            │
│ 启动：reconcile 非终态 run；replay checkpoint + events           │
└───────────────────────────────┬────────────────────────────────┘
                                │ 描述/租约（不是 socket）
┌───────────────────────────────▼────────────────────────────────┐
│ 主进程（能力）                                                  │
│ dev/ssh/timer 描述 → 启动对账：disconnected / 重挂 / 用户恢复     │
└─────────────────────────────────────────────────────────────────┘
```

### 3.1 客户端 `AgentStateStore`

统一替代散落的 localStorage：

```ts
interface AgentStateStore {
    get<T>(scope: string, key: string): Promise<T | null>
    set<T>(scope: string, key: string, value: T, opts?: { ttlMs?: number }): Promise<void>
    delete(scope: string, key: string): Promise<void>
    list<T>(scope: string, prefix?: string): Promise<Array<{ key: string; value: T }>>
}
```

命名空间：

| scope | key | 内容 |
| --- | --- | --- |
| `workspace` | `device` | 最近路由、dock 开合/宽度、面板展开、主题 |
| `workspace` | `tabs` | open tabs、active session、分组折叠 |
| `draft` | `<conversationId>` | 输入框文本、图片引用、@页面、更新时间 |
| `run` | `<conversationId>` | runId、lastSeq、status、updatedAt（无 30min TTL） |
| `tool` | `<runId>` | callId → `{status, argsHash, result, error, updatedAt}` |
| `ui` | `<surface>` | 滚动位置、展开的任务、临时筛选 |

桌面端落 `StorageService` 的 SQLite（`app.agent-state` 命名空间）；Web 端用 IndexedDB，localStorage 只做首屏同步缓存和旧数据迁移。**不再用 30 分钟 TTL**；过期由服务端 run 状态决定。

### 3.2 服务端新增表

#### `agent_tool_call`（工具执行账本）

```sql
CREATE TABLE `agent_tool_call` (
    `id`              BIGINT       NOT NULL AUTO_INCREMENT,
    `call_id`         VARCHAR(64)  NOT NULL,
    `run_id`          VARCHAR(64)  NOT NULL,
    `conversation_id` VARCHAR(128) DEFAULT NULL,
    `tenant_id`       BIGINT       NOT NULL,
    `user_id`         BIGINT       NOT NULL,
    `tool_name`       VARCHAR(128) NOT NULL,
    `args_hash`       VARCHAR(64)  NOT NULL,
    `args_json`       TEXT         COMMENT '可选；敏感工具只存 hash/摘要',
    `status`          VARCHAR(24)  NOT NULL DEFAULT 'pending'
        COMMENT 'pending|awaiting_approval|approved|started|completed|failed|cancelled|uncertain',
    `approval_json`   TEXT,
    `result_json`     TEXT         COMMENT '≤16KB；超限只存引用/摘要',
    `result_truncated` TINYINT     NOT NULL DEFAULT 0,
    `error`           TEXT,
    `idempotency_key` VARCHAR(128) NOT NULL,
    `attempt`         INT          NOT NULL DEFAULT 1,
    `started_at`      BIGINT       DEFAULT NULL,
    `finished_at`     BIGINT       DEFAULT NULL,
    `create_time`     BIGINT       NOT NULL,
    `update_time`     BIGINT       NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_run_call` (`run_id`, `call_id`),
    UNIQUE KEY `uk_idem` (`idempotency_key`),
    KEY `idx_run_status` (`run_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='前端工具执行账本';
```

#### `agent_form_request`（表单）

```sql
CREATE TABLE `agent_form_request` (
    `id`              BIGINT       NOT NULL AUTO_INCREMENT,
    `form_id`         VARCHAR(64)  NOT NULL,
    `conversation_id` VARCHAR(128) NOT NULL,
    `run_id`          VARCHAR(64)  DEFAULT NULL,
    `call_id`         VARCHAR(64)  DEFAULT NULL,
    `tenant_id`       BIGINT       NOT NULL,
    `user_id`         BIGINT       NOT NULL,
    `schema_json`     TEXT         NOT NULL COMMENT '字段/批量/标题等',
    `status`          VARCHAR(16)  NOT NULL DEFAULT 'pending'
        COMMENT 'pending|answered|cancelled|expired',
    `values_json`     TEXT,
    `rows_json`       TEXT,
    `created_at`      BIGINT       NOT NULL,
    `answered_at`     BIGINT       DEFAULT NULL,
    `delivered_at`    BIGINT       DEFAULT NULL,
    `expires_at`      BIGINT       DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_form_id` (`form_id`),
    KEY `idx_pending` (`tenant_id`, `user_id`, `status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='动态表单请求（服务端收件箱）';
```

审批可以并到 `agent_tool_call.approval_json/status`（`awaiting_approval`），不必单独建表；计划/预算继续用 `agent_run.suspend_reason`，加 `pending_action_json`/`expires_at` 即可。

#### `agent_workspace_state`（可选，跨设备）

```sql
CREATE TABLE `agent_workspace_state` (
    `tenant_id`  BIGINT       NOT NULL,
    `user_id`    BIGINT       NOT NULL,
    `device_id`  VARCHAR(128) NOT NULL,
    `state_json` LONGTEXT     NOT NULL,
    `version`    BIGINT       NOT NULL DEFAULT 1,
    `updated_at` BIGINT       NOT NULL,
    PRIMARY KEY (`tenant_id`, `user_id`, `device_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备级 agent 工作区快照（可选）';
```

同设备恢复不需要它；跨设备/重装才有价值。写有防抖（≥2s），冲突按 `version` 乐观锁，last-write-wins 并在 UI 提示。

### 3.3 API 增量

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/runs?conversationId=&status=active` | 启动时发现非终态 run（不只靠 thread.activeRunId） |
| GET | `/runs/{id}/pending` | 返回 pending tools / approvals / plan / budget / forms |
| POST | `/runs/{id}/tool-calls/{callId}/started` | 执行前写意图（幂等） |
| POST | `/runs/{id}/tool-calls/{callId}/completed` | 写结果/错误（幂等） |
| POST | `/runs/{id}/tool-calls/{callId}/uncertain` | 启动时发现 started 但无法确认 |
| POST | `/forms` | 创建表单（工具调用时） |
| GET | `/forms/pending?conversationId=` | 服务端收件箱 |
| POST | `/forms/{id}/answer` | 提交答案；等待者/后续 run 消费 |
| GET/PUT | `/workspace` | 可选跨设备工作区 |

### 3.4 启动恢复协议

**客户端启动顺序（必须按顺序）：**

1. **读本地工作区**：`workspace/device`、`workspace/tabs`、`draft:*`、`ui:*`。
   先渲染壳层，避免白屏。
2. **拉服务端索引**：`GET /sessions` + `GET /runs?status=active`（并行的）。
3. **对齐 tab**：服务端已删除的会话从 tab 移除；有 active run 但本地没 tab 的补进来；
   active session 不存在则回退到最近会话。
4. **恢复每个会话**：
   - 有 runId → `attach(runId, lastSeq)`；SSE 从 `lastSeq` 重放；
   - 没有 runId 但有 active run → `GET /runs?...` 找出来再 attach；
   - run 终态 → 只读 transcript；
   - `SUSPENDED` → 展示 pending action（工具/审批/表单/计划/预算）。
5. **恢复 pending 工具**：
   - `pending`：正常执行；
   - `approved`：跳过审批直接执行；
   - `completed`：把缓存结果重新提交，不重复执行；
   - `started` / `uncertain`：按工具声明的 `sideEffect` 决定：
     `readOnly` / `idempotent` 自动重试；`unsafe` 弹「上次执行中断，是否重试」，
     并显示 args 摘要；用户拒绝则提交 `cancelled`。
6. **恢复表单/审批/计划**：从服务端读，不再依赖客户端内存。
7. **恢复后台任务/订阅**：`GET /bg-tasks` + pending notes；任务继续显示。
8. **恢复草稿/队列**：草稿填回输入框；已排队未发送的消息按顺序发出（或提示用户确认）。
9. **对账主进程能力**：dev/SSH/定时器 → `disconnected` / 重挂 / 等用户恢复。
10. **失败要可见**：服务端状态过期、checkpoint 缺失、工具结果丢失 → 明确的错误 +
    「重试/新开一轮」，不要静默转圈。

**服务端启动顺序：**

1. 扫 `agent_run` 非终态：
   - 有 checkpoint → 重建 loop（或置 `SUSPENDED/client_detached` 等客户端 attach）；
   - 无 checkpoint → `FAILED/unrecoverable`，保留事件与 transcript。
2. 扫 `agent_tool_call`：`started` 且 run 已非活跃 → `uncertain`；
   `awaiting_approval` 过期 → `failed`（reason: approval_timeout）。
3. 扫 `agent_form_request`：过期 → `expired`；
   仍 pending 且有人等待 → 保持，等用户填写或 run 超时。
4. 扫 `agent_bg_task`：租约过期 → `disconnected`（已有 P1 sweeper）。

## 4. 工具执行账本与幂等

这是"关软件再继续"最容易踩坑的地方：**副作用不能重放**。

### 4.1 工具声明

```ts
interface AgentToolDefinition {
    // ...
    /** none: 只读；idempotent: 重复执行安全；unsafe: 有不可逆副作用（默认） */
    sideEffect?: 'none' | 'idempotent' | 'unsafe'
}
```

- `readOnly` 工具默认 `none`；
- 删除/发布/写文件默认 `unsafe`；
- 写操作如果能带幂等键（HTTP `Idempotency-Key`、文件覆盖、upsert），声明 `idempotent`。

### 4.2 执行协议

```
1. 工具调用到达
2. POST /tool-calls/{callId}/started   { argsHash, idempotencyKey }
   - 服务端按 (runId, callId) 幂等；已 completed 直接返回结果
3. 需要审批 → status=awaiting_approval，等服务端决策
4. 执行
5. POST /tool-calls/{callId}/completed { result | error }
6. 把结果提交给 run（resume tool_results）
```

- `argsHash` 防止同一 callId 被不同参数重放；
- `idempotencyKey = sha256(runId + callId + argsHash)`，工具可传给下游；
- 结果 >16KB 只存摘要/引用，原文由工具自己的存储负责；
- 敏感参数（token/密码）不入库，只存 hash + 字段名；需要展示时由客户端本地缓存。

### 4.3 重启判定

| 服务端状态 | 客户端动作 |
| --- | --- |
| `pending` | 执行 |
| `awaiting_approval` | 恢复审批卡；已批准则执行 |
| `approved` | 执行 |
| `started` | `none`/`idempotent` 自动重试；`unsafe` 让用户确认 |
| `completed` | 直接重提交结果 |
| `failed/cancelled` | 不执行，按错误展示 |

**绝不**在 `unsafe + started` 时静默重试。当前 `TOOL_EXECUTION_UNCERTAIN` 的 fail-closed 是正确方向，
但现在没有"用户确认后重试"的出口——补上它才算"能继续"。

## 5. 表单 / 审批 / 计划

### 5.1 表单迁移到服务端

- `requestUserForm` 不再只写客户端注册表：创建时 `POST /forms`，把 `formId` 返回给工具；
- 表单面板从 `GET /forms/pending` 读（跨会话、跨设备）；
- 用户提交 `POST /forms/{id}/answer`；等待中的工具通过 attach/resume 拿到答案；
- 答案投递仍保持"恰好一次"：`delivered_at` 由服务端记，客户端 ack；
- 关软件/刷新：表单还在，答案还在，不会重新建一张。

### 5.2 审批

- 审批请求写 `agent_tool_call.approval_json`，status=`awaiting_approval`；
- 用户决策 `POST /approvals/{callId}`（或 tool-call 子资源）；
- 重启后按 status 恢复审批卡；已批准的直接执行，不再问第二遍；
- 超时由服务端置 `failed`，不依赖客户端定时器。

### 5.3 计划/预算

- 已有 `agent_run.suspend_reason`；补 `expires_at` 与 `pending_action_json`；
- `GET /runs/{id}` 带回 pending plan/budget，客户端重开即可恢复卡片；
- 过期 → `CANCELLED(timeout)`，避免永久 `SUSPENDED`。

## 6. UI / 工作区

| 状态 | 目标存储 | 说明 |
| --- | --- | --- |
| open tabs / active session / 分组折叠 | 本地 `workspace/tabs`（服务端索引兜底） | 现有 localStorage 迁移 |
| 草稿（文本/图片引用/@页面） | 本地 `draft:<conv>`，500ms 防抖 | 不进 transcript；不发就不算消息 |
| 当前路由 / dock 开合/宽度 / 面板展开 | 本地 `workspace/device` | 启动先渲染壳层 |
| 滚动位置 / 展开的任务 / 筛选 | 本地 `ui:<surface>` | 不必服务端 |
| 已加载技能 | 本地 `ui/skills` | 现有 localStorage 迁移 |
| 待发队列 | 本地 `workspace/outbox`，发送成功即删 | 启动提示"有 N 条未发出" |

**为什么 UI 不全部上服务端**：滚动位置/草稿每个设备不同，写服务端会放大写放大与隐私面；
本地 SQLite 已满足"关软件再打开"。如果要做**跨设备续作**，再把 `workspace` 快照可选同步到
`agent_workspace_state`，按 `device_id` 区分，不覆盖另一台设备的视图。

## 7. 主进程 / 插件能力状态

| 资源 | 持久化什么 | 启动对账 |
| --- | --- | --- |
| dev 会话 | `{root, watch, externals, lastBuildAt, lastLogSeq}` | 子进程已死 → `disconnected`；用户/agent 可重启，日志保留 |
| SSH shell/pty | `{host, kind, command, openedAt}` | socket 已死 → `disconnected`；不自动重连（避免无声副作用） |
| SSH tunnel/proxy | `{host, kind, target, localPort}` | 同上；端口释放，需重新授权 |
| `background.*` 定时器 | `{taskId,name,intervalMs,nextAt,keepAwake}` | 重挂 timer；`missed` 按 `nextAt` 计算 |
| 插件长任务 | 已在 `agent_bg_task` | P1 sweeper |
| 插件配置/密钥 | `StorageService`（safeStorage） | 原样恢复 |

**连接类资源永远不持久化 socket**。持久化"它曾经是什么/断在哪"，启动后由用户或插件决定
是否重连；自动重连只允许对 `readOnly`/明确可恢复的资源。

## 8. 迁移顺序（按"关软件能不能继续"的阻塞程度）

| 阶段 | 内容 | 解决什么 |
| --- | --- | --- |
| **S1** | 服务端 `agent_tool_call` + started/completed API；`GET /runs?status=active`；启动即 reconcile | 关在"等工具"时能找回 run；工具不静默重放 |
| **S2** | 服务端 `agent_form_request` + 表单收件箱 API；审批状态入 `agent_tool_call` | 表单/审批不再随刷新消失 |
| **S3** | 客户端 `AgentStateStore`（SQLite/IndexedDB）：run 句柄、工具日志、workspace、草稿、路由 | 关软件后工作现场还在；去掉 30min TTL |
| **S4** | 启动恢复协议 + UI：tab/草稿/pending action/scroll 重建；`unsafe started` 的用户确认 | 真正"回到上次的工作" |
| **S5** | 主进程 dev/SSH/timer 描述 + 对账；插件 UI 状态 | 开发台/SSH 任务也能解释"上次在跑什么" |
| **S6** | 可选 `agent_workspace_state` 跨设备同步；事件 gap 全量重建 | 换设备/重装也能续 |

S1/S2 是后端，S3/S4 是前端；可以并行。每一步都要有 kill/restart 测试。

## 9. 验收清单

**关软件再打开：**

- [ ] 生成中关闭 → 重开：会话自动 attach，从 `lastSeq` 续流，不重复已显示内容。
- [ ] 等前端工具时关闭 → 重开：pending 工具恢复；`pending` 直接执行；
      `started + unsafe` 弹确认；`completed` 只重提交结果。
- [ ] 表单填到一半关闭 → 重开：表单还在，答案还在；提交后只回一次。
- [ ] 审批卡关闭 → 重开：审批还在；已批准的直接执行，不再问。
- [ ] 计划/预算挂起关闭 → 重开：卡片恢复；过期有明确提示。
- [ ] 草稿关闭 → 重开：输入框内容/图片/@页面还在。
- [ ] 后台任务关闭 → 重开：任务显示 disconnected/可恢复，不是消失。
- [ ] SSH/dev 关闭 → 重开：显示上次连接/工程 + disconnected，不假装还在跑。
- [ ] 定时器关闭 → 重开：重新挂上，`missed` 正确。
- [ ] 崩溃（kill -9）→ 重开：同上；不出现重复副作用。
- [ ] 服务端重启 → 客户端重连：run 恢复或明确失败，无 60-75s 静默。

**反向：**

- [ ] 同一工具 `started` 后重复 attach 不会执行两次。
- [ ] 表单答案不会投递两次。
- [ ] 删除会话后本地 tab/草稿/句柄被清理。
- [ ] 存储损坏/超限时降级，不阻塞发消息。

## 10. 风险与边界

1. **不能持久化 Promise/socket/子进程**：只能持久化意图、断点、租约；启动时 resume 或失败。
2. **副作用重放**：必须靠 `sideEffect` + 幂等键 + 用户确认；默认 `unsafe`，不要乐观重试。
3. **存储增长**：run 事件、工具结果、草稿、工作区都要 TTL/配额；默认 2000 事件、16KB 结果、
   30 天工作区、7 天草稿（可配）。
4. **隐私**：工具参数/结果可能含密钥；默认只存 hash/摘要，敏感字段由工具自己用
   `storage.secret*`；不要把 token 写进 `agent_tool_call`。
5. **多设备冲突**：工作区是设备维度；跨设备只同步"会话/run/任务"等事实，不同步滚动位置；
   可选同步时用 `version` 乐观锁，冲突提示而不是静默覆盖。
6. **不要把 UI 投影当事实**：transcript 的 UI 投影、产物架、列表排序都是派生状态；
   启动时从规范日志重建，避免两份真相。
7. **不要为了恢复而恢复**：`checkpoint` 缺失、工具结果丢失、审批过期，明确失败比假装成功好。

## 11. 与现有文档的关系

- 会话/引擎日志：[AGENT_CHAT_SESSION_PERSISTENCE.md](AGENT_CHAT_SESSION_PERSISTENCE.md)
- 中断/恢复现状：[AGENT_SESSION_INTERRUPTION_AUDIT.md](AGENT_SESSION_INTERRUPTION_AUDIT.md)
- 表单：[AGENT_FORM_REQUESTS.md](AGENT_FORM_REQUESTS.md)（本文把它从客户端内存迁到服务端）
- 审批：[AGENT_TOOL_APPROVAL.md](AGENT_TOOL_APPROVAL.md)（本文把决策持久化）
- 后台任务：[AGENT_TASK_FRAMEWORK.md](AGENT_TASK_FRAMEWORK.md) / [AGENT_TASK_SERVER.md](AGENT_TASK_SERVER.md)
- 本地存储：[STORAGE.md](STORAGE.md)（`StorageService` 是客户端持久化底座）
- 路由缓存：[ROUTE_CACHE.md](ROUTE_CACHE.md)（启动恢复的 UI 部分）

## 12. 实现状态（2026-11-26）

**已完成 S1 + S2 的服务端部分**：

- `script/migration/V48__agent_state_actions.sql`：`agent_tool_call`、`agent_form_request`。
- `AgentToolCallStore`：`started / completed / uncertain / approval-request / approval-decision`；
  16KB 结果上限（超限存截断标记）、`sideEffect` 所需的 started/uncertain 状态、
  审批持久化、owner + run 归属校验。
- `AgentFormRequestStore`：创建、待填写列表、回答、取消、ack、过期收敛；
  `agent_form_request` 成为服务端表单收件箱。
- `AgentRunDiscoveryController`：`GET /api/agent/v1/runs?conversationId=&limit=`，
  启动时可发现非终态 run，不再只靠 `thread.activeRunId`。
- `AgentRunStartupReconciler`：`ApplicationReadyEvent` 后立即跑一次 reconcile，
  缩短重启后的 60–75s 空窗。
- 19 个新增后端测试（tool ledger 8、form inbox 7、URL 映射 4）。

**已建表但尚未接客户端**：

- `use-pending-tools` 仍写 localStorage；要改成先调 `started`、完成后调 `completed`，
  `started/uncertain` 走用户确认。
- `FormRequestRegistry` / `ToolApprovalRegistry` 仍以内存为准；要改成服务端 store 的缓存，
  UI 从 `GET /forms/pending`、tool-call 行读取。
- `AgentStateStore`（客户端 SQLite/IndexedDB）、草稿/路由/工作区、`unsafe` 重试 UI、
  主进程 dev/SSH/timer 描述属于 S3–S5。

**部署**：先执行 V48；这些接口是新增的，没有开关，旧客户端不会调用。等 S3 客户端接入时，
再按 `agent.state.*` 配置做灰度。
