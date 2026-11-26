# Agent 后台任务：服务端存储设计（存算分离）

> **一句话：客户端负责执行，服务端负责存储。**
>
> - **算**：插件/工具在客户端（渲染进程）执行，持有 `AbortSignal`，把进度、日志、结果通过 API 上报。
> - **存**：任务记录、日志、订阅、待投递的更新通知全部落在服务端 MySQL；UI 和 agent 都从服务端读。
> - **控制面**：HTTP + 租约/心跳；取消是服务端置位、客户端在下一次心跳/轮询时响应。
> - **恢复**：客户端掉线后任务进入 `disconnected`；插件声明了 `resume` 就能重新接管，否则按策略置 failed。
>
> **范围之外**：`TaskMonitorEngine`（看板实时日志/规则，纯 UI 观测）、`background.*`（定时调度）、
> 跨重启的进程托管（服务端不执行、也不拉起客户端进程）。

## 1. 为什么是"客户端执行 + 服务端存储"

| 维度 | 客户端执行 | 服务端存储 |
| --- | --- | --- |
| 能力 | SSH/Jenkins/HTTP/文件都在客户端，天然靠近用户环境 | 服务端没有这些能力，也不该有 |
| 生命周期 | 随页面/窗口，可能被刷新、关闭、休眠 | 跨设备、跨会话、跨重启可查 |
| 一致性 | 单写者（一个 client 持租约），本地顺序简单 | 多端只读；写通过租约串行化 |
| 通知 | 客户端空闲时才能起新一轮 | 服务端可以生成待投递 note，客户端空闲时取 |
| 成本 | 不占服务端 CPU/连接 | 只存状态与近期日志，可保留/清理 |

所以服务端**不执行插件任务**，只做四件事：**记录、日志、订阅、通知 outbox**。

## 2. 数据模型（V47）

四张表。时间统一 epoch millis（与现有 `agent_*` 表一致），不建外键（仓库既有约定）。

### 2.1 `agent_bg_task`：任务记录

```sql
CREATE TABLE IF NOT EXISTS `agent_bg_task` (
    `id`                BIGINT       NOT NULL AUTO_INCREMENT,
    `task_id`           VARCHAR(64)  NOT NULL COMMENT '服务端任务 id（bt_ + uuid）',
    `client_task_id`    VARCHAR(64)  NOT NULL COMMENT '客户端幂等键（重试 create 不重复建）',
    `client_id`         VARCHAR(128) DEFAULT NULL COMMENT '发起/可接管它的客户端安装 id',
    `tenant_id`         BIGINT       NOT NULL,
    `user_id`           BIGINT       NOT NULL,
    `conversation_id`   VARCHAR(128) DEFAULT NULL COMMENT '会话任务；插件级任务为空',
    `run_id`            VARCHAR(64)  DEFAULT NULL COMMENT '发起它的 run（审计）',
    `plugin_key`        VARCHAR(128) DEFAULT NULL COMMENT '哪个插件起的（元数据，不是身份）',
    `tool_name`         VARCHAR(128) DEFAULT NULL,
    `kind`              VARCHAR(80)  NOT NULL COMMENT '任务种类，如 ssh-docker-logs / jenkins-build',
    `title`             VARCHAR(512) NOT NULL,
    `mode`              VARCHAR(16)  NOT NULL DEFAULT 'job' COMMENT 'job|watch',
    `state`             VARCHAR(24)  NOT NULL DEFAULT 'running'
        COMMENT 'running|cancelling|disconnected|succeeded|failed|cancelled',
    `progress_json`     TEXT         COMMENT 'TaskProgress：percent/current/total/message',
    `result_json`       TEXT         COMMENT '结果；服务端硬顶 16KB',
    `result_truncated`  TINYINT      NOT NULL DEFAULT 0,
    `error`             TEXT         COMMENT '失败原因；硬顶 4KB',
    `meta_json`         TEXT         COMMENT '插件自定义元数据；硬顶 32KB',
    `checkpoint_json`   TEXT         COMMENT '插件断点（Jenkins build 号 / 日志时间戳…）；硬顶 32KB',
    `resumable`         TINYINT      NOT NULL DEFAULT 0,
    `resume_policy`     VARCHAR(16)  NOT NULL DEFAULT 'never' COMMENT 'never|manual|auto',
    `attempt`           INT          NOT NULL DEFAULT 1 COMMENT '第几次执行（resume 时 +1）',
    `lease_token_hash`  VARCHAR(64)  DEFAULT NULL COMMENT '当前租约 token 的 sha256',
    `lease_expires_at`  BIGINT       DEFAULT NULL,
    `last_heartbeat_at` BIGINT       DEFAULT NULL,
    `cancel_requested`  TINYINT      NOT NULL DEFAULT 0,
    `cancel_deadline`   BIGINT       DEFAULT NULL COMMENT 'cancelling 后多久强制收敛',
    `consumed_at`       BIGINT       DEFAULT NULL COMMENT 'agent 已拿到终态结果',
    `log_seq`           BIGINT       NOT NULL DEFAULT 0 COMMENT '已分配的最大日志 seq',
    `log_first_seq`     BIGINT       NOT NULL DEFAULT 0 COMMENT '仍保留的最小 seq',
    `created_at`        BIGINT       NOT NULL,
    `updated_at`        BIGINT       NOT NULL,
    `finished_at`       BIGINT       DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_task_id` (`task_id`),
    UNIQUE KEY `uk_client_task` (`tenant_id`, `user_id`, `client_task_id`),
    KEY `idx_owner_state` (`tenant_id`, `user_id`, `state`, `updated_at`),
    KEY `idx_conversation` (`tenant_id`, `conversation_id`, `updated_at`),
    KEY `idx_lease` (`state`, `lease_expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent 后台任务（客户端执行，服务端存储）';
```

要点：

- `client_task_id` 是**幂等键**：客户端网络重试时不会建出两个任务；重复 create 返回已有任务并换发新租约。
- `lease_token_hash` 只存哈希；租约 token 只在 create/attach 响应里返回一次。
- `log_seq` 单调递增，**不随日志清理回退**；`log_first_seq` 用于计算 `dropped`。
- `consumed_at` 让 agent 拿过终态结果后不再补完成通知。
- `resume_policy`：`auto`（安全轮询/重连）、`manual`（UI 按钮）、`never`（有副作用的任务，默认）。

### 2.2 `agent_bg_task_log`：增量日志

```sql
CREATE TABLE IF NOT EXISTS `agent_bg_task_log` (
    `id`         BIGINT       NOT NULL AUTO_INCREMENT,
    `task_id`    VARCHAR(64)  NOT NULL,
    `seq`        BIGINT       NOT NULL COMMENT '任务内单调序号，从 1 开始',
    `batch_id`   VARCHAR(64)  NOT NULL COMMENT '客户端批次幂等键',
    `batch_seq`  INT          NOT NULL COMMENT '批内序号（0..n-1）',
    `kind`       VARCHAR(16)  NOT NULL DEFAULT 'log' COMMENT 'log|summary|state',
    `level`      VARCHAR(8)   NOT NULL DEFAULT 'info' COMMENT 'debug|info|warn|error',
    `message`    VARCHAR(2000) NOT NULL,
    `at`         BIGINT       NOT NULL COMMENT '客户端产生时间',
    `create_time` BIGINT      NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_task_seq` (`task_id`, `seq`),
    UNIQUE KEY `uk_batch_seq` (`task_id`, `batch_id`, `batch_seq`),
    KEY `idx_task_seq` (`task_id`, `seq`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台任务增量日志（环形保留）';
```

- `kind='summary'` 对应作者 API 的 `task.notify(...)`；看板/订阅优先用 summary，
  原始 `log` 只做详细展开。
- 唯一键 `(task_id,batch_id,batch_seq)` 让重试天然幂等；`INSERT IGNORE` + 返回当前 `log_seq`。
- `message` 2000 字符；单批 ≤200 行、≤64KB。

### 2.3 `agent_bg_task_watch`：更新订阅

```sql
CREATE TABLE IF NOT EXISTS `agent_bg_task_watch` (
    `id`              BIGINT       NOT NULL AUTO_INCREMENT,
    `watch_id`        VARCHAR(64)  NOT NULL,
    `task_id`         VARCHAR(64)  NOT NULL,
    `tenant_id`       BIGINT       NOT NULL,
    `user_id`         BIGINT       NOT NULL,
    `conversation_id` VARCHAR(128) NOT NULL,
    `policy_json`     TEXT         NOT NULL COMMENT 'level/match/minIntervalMs/maxNotes/maxDurationMs…',
    `state`           VARCHAR(16)  NOT NULL DEFAULT 'active' COMMENT 'active|ended',
    `notes`           INT          NOT NULL DEFAULT 0,
    `last_seq`        BIGINT       NOT NULL DEFAULT 0 COMMENT '已消费到的日志 seq',
    `last_note_at`    BIGINT       DEFAULT NULL,
    `created_at`      BIGINT       NOT NULL,
    `updated_at`      BIGINT       NOT NULL,
    `expires_at`      BIGINT       DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_watch_id` (`watch_id`),
    UNIQUE KEY `uk_task_conversation` (`task_id`, `conversation_id`),
    KEY `idx_active` (`state`, `expires_at`),
    KEY `idx_owner` (`tenant_id`, `user_id`, `state`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台任务的 agent 更新订阅';
```

### 2.4 `agent_bg_task_note`：待投递通知 outbox

```sql
CREATE TABLE IF NOT EXISTS `agent_bg_task_note` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT,
    `note_id`       VARCHAR(64)  NOT NULL,
    `task_id`       VARCHAR(64)  NOT NULL,
    `watch_id`      VARCHAR(64)  DEFAULT NULL,
    `tenant_id`     BIGINT       NOT NULL,
    `user_id`       BIGINT       NOT NULL,
    `conversation_id` VARCHAR(128) NOT NULL,
    `kind`          VARCHAR(16)  NOT NULL COMMENT 'update|completion|ended',
    `seq_from`      BIGINT       DEFAULT NULL,
    `seq_to`        BIGINT       DEFAULT NULL,
    `payload_json`  TEXT         NOT NULL COMMENT '渲染好的 note 文本 + 结构化摘要',
    `dedupe_key`    VARCHAR(160) NOT NULL COMMENT 'watch:from:to:kind / task:done',
    `created_at`    BIGINT       NOT NULL,
    `delivered_at`  BIGINT       DEFAULT NULL,
    `attempts`      INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_note_id` (`note_id`),
    UNIQUE KEY `uk_dedupe` (`dedupe_key`),
    KEY `idx_pending` (`tenant_id`, `user_id`, `conversation_id`, `delivered_at`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台任务通知 outbox（客户端 ack 后才算投递）';
```

`dedupe_key` 是多实例调度器的去重保险：同一个 `(watch, seqFrom, seqTo, kind)` 只会有一行。

## 3. 状态机与租约

```
                 create
                   │
                   ▼
              ┌─────────┐  heartbeat 续租
              │ running │◀──────────────┐
              └────┬────┘               │
      cancel 置位  │  lease 过期        │ attach（resume）
                   ▼                    │
             ┌───────────┐             │
             │ cancelling│             │
             └─────┬─────┘             │
                   │ 客户端确认         │
                   ▼                    │
             ┌───────────┐   attach    │
             │ cancelled │◀── ─ ─ ─ ─ ─┘
             └───────────┘
                   ▲
                   │ 租约过期
              ┌────┴──────┐
              │disconnected│── grace 到期/无 resume ──▶ failed
              └────────────┘
```

| 迁移 | 触发 | 说明 |
| --- | --- | --- |
| → `running` | create / attach | create 时发租约；attach 时 `attempt+1`、换租约 |
| `running` → `cancelling` | agent/UI `cancel` | 只置位；客户端心跳看到后 abort |
| `cancelling` → `cancelled` | 客户端 `finish(cancelled)` | 正常路径 |
| `cancelling` → `cancelled` | `cancel_deadline` 到期 | 客户端不响应也收敛；迟到结果丢弃 |
| `running` → `disconnected` | 租约过期（sweeper） | 不是失败：外部工作可能还在跑（Jenkins） |
| `disconnected` → `running` | attach/resume | 插件提供 `resume`，从 checkpoint 接着来 |
| `disconnected` → `failed` | grace 到期或 `resume_policy=never` | 无法恢复，明确失败 |
| `running` → `succeeded/failed/cancelled` | 客户端 `finish` | 终态幂等；重复 finish 返回当前快照 |

**租约**：

- 客户端 create 拿到 `leaseToken`（只返回一次），之后每次写（logs/progress/heartbeat/finish）都带上。
- 心跳间隔由任务声明（默认 15s，范围 5s–5min）；服务端 `lease_expires_at = now + 3 × interval`。
- `sweeper` 每 10s 把 `state='running' AND lease_expires_at < now` 置 `disconnected`；
  置位时写一条 `state` 日志（`客户端已断开`），不直接置 failed。
- 同一 `client_id` 可以在租约未过期时 `attach` 接管（例如页面刷新后立即重连），
  换发新 token、`attempt+1`；其他 client 必须等租约过期。
- `disconnected` 保留 24h（可配）供手动恢复；到期后置 failed 并保留日志。

**取消**：

- `cancel` 只把 `cancel_requested=1`、`state='cancelling'`，并设 `cancel_deadline = now + 60s`。
- 客户端心跳/日志响应里带 `cancelRequested`；SDK abort `signal`，`run` 退出后 `finish('cancelled')`。
- 客户端不响应：`cancel_deadline` 到期，sweeper 置 `cancelled`，`error='客户端未确认取消'`；
  之后迟到的 `finish` 被忽略（终态幂等）。
- `cancel` 不承诺杀进程；UI/工具文案必须写清楚。

## 4. API

统一前缀 `/api/agent/v1/bg-tasks`，`R<T>` 包装，JWT 取 `tenant_id/user_id`。
所有写接口都要 `leaseToken`（create/attach 除外），所有读接口都按 owner 过滤。

| 方法 | 路径 | 作用 | 关键约束 |
| --- | --- | --- | --- |
| POST | `/` | 创建任务 | `clientTaskId` 幂等；返回 `taskId + leaseToken + state` |
| POST | `/{taskId}/attach` | 接管/恢复 | 同 `client_id` 或租约已过期；返回新 token + `lastSeq` |
| PATCH | `/{taskId}` | 更新 progress/meta/checkpoint/title | 租约校验；字段限长 |
| POST | `/{taskId}/logs` | 追加日志 | 批次幂等；≤200 行/批 |
| GET | `/{taskId}/logs` | 读增量 | `sinceSeq`、`limit`、`level`、`grep`；返回 `dropped` |
| POST | `/{taskId}/heartbeat` | 续租 | 返回 `state/cancelRequested/leaseExpiresAt/logSeq` |
| POST | `/{taskId}/finish` | 终态 | 幂等；结果 16KB，超限拒绝并返回错误 |
| POST | `/{taskId}/cancel` | 请求取消 | 置位，不直接杀；disconnected 可直接 cancelled |
| GET | `/` | 列出任务 | `state/conversationId/pluginKey/clientId`；owner 过滤 |
| GET | `/{taskId}` | 详情 | owner 过滤 |
| POST | `/{taskId}/watch` | 建/替换订阅 | `(task, conversation)` 唯一 |
| DELETE | `/watches/{watchId}` | 停通知 | 不停任务 |
| GET | `/notes/pending` | 取待投递 note | 按 conversation + owner |
| POST | `/notes/{noteId}/ack` | 确认投递 | 客户端起完新一轮后调用 |
| GET | `/stream` | UI 推送（可选） | SSE；没有就轮询 |

### 4.1 create

```json
POST /api/agent/v1/bg-tasks
{
  "clientTaskId": "c-8f2a…",
  "clientId": "install-7d3…",
  "kind": "ssh-docker-logs",
  "title": "监控 api 容器日志",
  "mode": "watch",
  "conversationId": "s-175…",
  "runId": "run_…",
  "pluginKey": "plugin-ssh",
  "tool": "watchContainerLogs",
  "meta": { "host": "prod-1", "container": "api" },
  "heartbeatMs": 15000,
  "resumable": true,
  "resumePolicy": "manual"
}
```

返回：

```json
{
  "code": 200,
  "data": {
    "taskId": "bt_9c1…",
    "leaseToken": "lt_…",
    "state": "running",
    "attempt": 1,
    "logSeq": 0,
    "heartbeatMs": 15000,
    "leaseExpiresAt": 1790000015000
  }
}
```

重复 `clientTaskId`：返回已有任务 + 新租约（同一 client），不新建。
`conversationId` 必须属于当前用户；否则 403。

### 4.2 logs

```json
POST /api/agent/v1/bg-tasks/bt_9c1/logs
{
  "leaseToken": "lt_…",
  "batchId": "b-17",
  "entries": [
    { "kind": "log", "level": "info", "message": "container started", "at": 1790000000000 },
    { "kind": "summary", "level": "error", "message": "错误: connection refused", "at": 1790000000100 }
  ]
}
```

服务端在一个事务里：`SELECT log_seq ... FOR UPDATE` → 插入 `seq+1..seq+n` → `UPDATE log_seq`。
`batchId` 重复直接返回当前 `logSeq`，不重复插。

### 4.3 heartbeat

```json
POST /api/agent/v1/bg-tasks/bt_9c1/heartbeat
{ "leaseToken": "lt_…" }

→ { "data": { "state": "running", "cancelRequested": false,
              "leaseExpiresAt": 1790000030000, "logSeq": 42 } }
```

`state` 可能是 `cancelling`；SDK 立即 abort。
如果 `state` 已是 `cancelled/failed`（例如服务端宽限到期），SDK 停止上报并结束本地。

### 4.4 finish

```json
POST /api/agent/v1/bg-tasks/bt_9c1/finish
{
  "leaseToken": "lt_…",
  "state": "succeeded",
  "message": "监控已停止",
  "result": { "lines": 1200 },
  "error": null
}
```

- 终态幂等：重复调用返回当前快照，不覆盖第一次的 result。
- `result` 序列化后 >16KB：返回 `TASK_RESULT_TOO_LARGE`，**任务保持原状态**；SDK 必须降级为
  `message` 再 finish（不能本地先 finished）。
- `finish` 成功时，若 `consumed_at` 为空，入队一条 `completion` note（除非有 active watch 且
  `notifyOnFinish=false`）。

## 5. 日志保留与背压

- 每任务保留最近 **5000** 行（可配）；超出由 retention job 分批删 `seq < log_seq-5000`，
  更新 `log_first_seq`。`logsSince` 返回 `dropped = max(0, log_first_seq - 1 - sinceSeq)`。
- 单行 ≤2000 字符；超长截断并标 `truncated`（payload 里加标记）。
- 单批 ≤200 行 / 64KB；客户端 100ms 或 200 行 flush 一次。
- 客户端队列上限 5000 行；超过丢最旧并在下一条 `summary` 里写"已丢弃 N 行"。
- 高吞吐 watch（Docker 日志）：作者应该只把 `warn/error` 或匹配行 `notify`，其余 `log`；
  服务端仍会保留最近 5000 行，但订阅只按策略取匹配行。
- 日志写入 429（限流）时客户端指数退避；不阻塞 `run` 的执行，但会丢最旧行。

## 6. 更新订阅与 note 调度

### 6.1 订阅

`POST /{taskId}/watch`：

```json
{
  "conversationId": "s-175…",
  "policy": {
    "level": "warn",
    "match": ["error", "exception"],
    "minIntervalMs": 120000,
    "maxNotes": 30,
    "maxDurationMs": 7200000,
    "maxLinesPerNote": 40,
    "notifyOnFinish": true
  }
}
```

- `(task_id, conversation_id)` 唯一；重复 watch 替换 policy，不叠加。
- `watch` 任务的工具可以自动建订阅；job 任务不自动建，靠完成 note。
- `stopWatch` 只把 `state='ended'`，任务继续。

### 6.2 调度器

`BgTaskWatchScheduler` 每 10s：

1. 取 `state='active' AND (expires_at IS NULL OR expires_at > now)` 的 watch；
2. `SELECT` 该任务 `seq > last_seq` 的日志，按 policy 过滤（level rank + 子串/正则）；
3. 若没有命中：更新 `last_seq`（避免下次重复扫），结束；
4. 若命中且 `now - last_note_at >= minIntervalMs`：
   - 组 note（seqFrom/seqTo、各级别计数、最多 40 行、summary 优先）；
   - `INSERT IGNORE` 到 outbox（`dedupe_key` 去重）；
   - `UPDATE watch SET last_seq=?, last_note_at=?, notes=notes+1 WHERE watch_id=? AND last_seq=?`
     （乐观锁；多实例只有一个成功）；
   - `notes >= maxNotes` 或 `now > expires_at`：`state='ended'`，入队一条 `ended` note。
5. 任务终态：若有 active watch，按 `notifyOnFinish` 入队完成 note 并结束 watch；
   没有 watch 且 `consumed_at` 为空，也入队 `completion` note（agent 的完成通知）。

**多实例安全**：所有状态推进都用条件 `UPDATE`（`WHERE state='active' AND last_seq=?`），
outbox 用 `dedupe_key` 唯一键；抢不到就跳过，下一轮再来。不要求 Redis 锁。

### 6.3 note 内容

```json
{
  "noteId": "n_…",
  "taskId": "bt_…",
  "kind": "update",
  "conversationId": "s-…",
  "text": "【任务更新】监控 api 日志\n过去 2 分钟新增 42 行（seq 880–921）…",
  "summary": { "from": 880, "to": 921, "error": 3, "warn": 6 },
  "createdAt": 1790000123000
}
```

客户端只在**会话空闲**时取 `notes/pending`，把 `text` 作为一条用户消息发一轮，再 `ack`。
`ack` 之前客户端崩溃 → note 仍在，下次重投（至少一次）；`noteId` 可用于去重。

**积压合并**：一次最多取 20 条，按 `conversationId` 分组、同一任务只保留最新/完成态，
合成一条 note 后起一轮，再 `ack` 全部。否则面板关两小时会攒出几十条，一开就连续跑几十轮。
`GET /notes/pending` 的返回里带 `count` 与 `hasMore`，客户端按批处理。

## 7. Agent 工具（服务端内置）

这六个工具是 **BackendTool**，直接查库，不走客户端：

| 工具 | 行为 |
| --- | --- |
| `listTasks` | 本会话任务 + 本用户的插件任务；`state/kind/store` 过滤 |
| `getTask` | 详情/结果；`wait` 默认 true，服务端最长等 60s（轮询 DB 500ms） |
| `getTaskLogs` | `sinceSeq/limit/level/grep`；返回 `nextSeq/dropped` |
| `cancelTask` | 置 `cancelling`；返回"已请求，客户端会停止"；disconnected 直接 cancelled |
| `watchTask` | 建/替换订阅；返回 `watchId + effective policy` |
| `stopWatch` | 停通知，不停任务 |

为什么放服务端：

- 没有客户端 90s 读工具死线；`wait` 可以真的等 60s。
- 客户端断开/刷新后，agent 仍能查到 `disconnected` 和日志。
- 不需要为"看任务"再走一轮 frontend tool 往返。

可见性：`conversationId` 的任务只在该会话可见；`pluginKey` 任务对 owner 全局可见。
`getTask` 拿到终态时写 `consumed_at`，不再补完成 note。

## 8. 客户端 SDK

`ServerTaskStore` 实现统一 `TaskStore`：

| 方法 | HTTP |
| --- | --- |
| `start(spec)` | `POST /`；保存 `leaseToken` |
| `progress(p)` | `PATCH /{id}`（500ms 节流） |
| `log(level,msg)` | 缓冲 → `POST /logs`（100ms/200 行） |
| `heartbeat()` | `POST /heartbeat`；看到 `cancelRequested` 就 abort |
| `finish(state,detail)` | `POST /finish`；失败重试，绝不本地先 finished |
| `cancel()` | `POST /cancel` + 本地 abort |
| `get/list` | `GET` + 本地缓存；面板打开时 2s 轮询/SSE |
| `logsSince` | `GET /logs` |

客户端行为：

- **租约丢失**（心跳 409 `LEASE_EXPIRED`）：停止上报，标记本地 `disconnected`；
  可走 `attach` 恢复，不要无限重试。
- **finish 前先 drain**：把日志队列 flush 完再 `finish`；崩溃最多丢最后一个批次
  （100ms / 200 行），不会丢整个任务的状态。
- **create 重试**：同 `clientTaskId`，服务端幂等；拿到同一个 task + 新租约。
- **离线**：create 失败 → 明确报错"任务服务不可用，未启动"；不要静默跑一个不持久化的长任务。
  Web/旧宿主可以显式选择 `LocalTaskStore`（内存，刷新即丢），但 UI 必须标注"不持久化"。
- **恢复**：启动时 `GET /?clientId=…&state=disconnected`；按 `kind` 找插件注册的 `resume`
  处理器；`auto` 直接接管，`manual` 在 UI 显示"恢复"按钮。
- **日志队列**：有界 5000 行；flush 失败退避重试；丢弃时在 summary 里注记。

## 9. 恢复/续跑

- 插件作者可以给 `defineTaskTool` 提供：
  ```ts
  resume: async (task, ctx) => {
      // task.checkpoint / task.meta / task.lastSeq 都在
      // 重新接上 Jenkins build 或 docker logs --since
  }
  ```
- `resume_policy`：
  - `auto`：安全的外部轮询/重连（Jenkins build 号、Docker `--since`）；
  - `manual`：UI 显示"恢复"，用户点了才跑；
  - `never`：抓取/有副作用的 job，掉线即 failed，不自动重跑。
- `attempt` 每次 attach +1；日志 seq 不回退，客户端从 `lastSeq` 继续。
- 服务端 `disconnected` 的宽限（默认 24h）内可恢复；超时置 failed。
- 恢复失败：`finish('failed', { error })`；不要留下 `running` 幽灵。

## 10. 安全与限额

- **owner 隔离**：所有查询带 `tenant_id + user_id`；`conversationId` 必须属于该 owner。
- **`plugin_key` 不是身份**：它只是元数据，服务端只信 JWT；插件不能借它读别人的任务。
- **租约 token**：随机 32 字节，存 sha256；只在 create/attach 返回一次；日志/进度/finish 必须带。
- **日志脱敏**：任务标题/日志会进看板和通知；作者不要把密钥写进去；服务端做长度/控制字符清洗，
  不做内容级密钥扫描（明确边界）。
- **限额**（可配）：
  - 每用户活跃任务 50、保留任务 500；
  - 每任务日志 5000 行、结果 16KB、meta/checkpoint 各 32KB；
  - create 10/min、logs 120/min、notes 60/min；
  - 超限返回 429，客户端退避/丢弃，不阻塞执行。
- **审计**：`run_id/plugin_key/tool_name` 保留；任务删除只允许 owner 且仅终态。

## 11. 定时任务

| Job | 频率 | 作用 |
| --- | --- | --- |
| `BgTaskLeaseSweeper` | 10s | running 且租约过期 → disconnected；cancelling 超 deadline → cancelled |
| `BgTaskWatchScheduler` | 10s | 按订阅生成 update/completion/ended note |
| `BgTaskRetention` | 1h | 删旧日志（保留 5000 行）、过期终态任务、已投递 note |
| `BgTaskNoteJanitor` | 10min | 未投递 note 超过 7 天 → 标记 expired，避免无限堆积 |

多实例：全部条件更新/唯一键，幂等；不依赖单实例内存。

## 12. 测试

后端：

- `BgTaskStoreTest`：create 幂等、租约校验、日志 seq/批次幂等、finish 幂等/超限、
  cancel 状态机、attach/attempt、owner 隔离。
- `BgTaskControllerTest`：参数/权限/错误码。
- `BgTaskLeaseSweeperTest`：过期、取消 deadline、并发抢同一任务。
- `BgTaskWatchSchedulerTest`：合并窗口、level/match、maxNotes、去重、多实例抢锁。
- `BgTaskNoteOutboxTest`：pending/ack、重投、completion/consumed。

客户端：

- `ServerTaskStore` 用假 HTTP/内存服务跑契约：start/logs/heartbeat/finish/cancel/attach。
- 断网、429、重复 batch、租约丢失、服务端重启。
- 恢复：kill 客户端 → disconnected → attach → seq 继续。

E2E：SSH watch 启动 → 杀渲染进程 → 服务端 disconnected → 重开恢复 → note 投递。

## 13. 迁移与灰度

1. V47 建表；配置 `agent.bg-task.*`（保留行数/宽限/限额/开关）。
2. 后端 `BgTaskStore` + Controller + 六个 BackendTool；先只读/创建，watch 关闭。
3. 客户端 `ServerTaskStore` + `runAsTask`（job）；`defineTaskTool` 默认走服务端。
4. 打开 watch/notes；客户端 `useTaskNotes` 轮询并起 run。
5. UI 看板切到服务端列表/日志；`desktop.tasks` 保留为 offline/legacy，不再作为主路径。
6. 删除旧的 `backgroundTasks` 注册表/`backgroundToolRunner`（在迁移窗口后）。

**回滚**：开关 `agent.bg-task.enabled=false` 时，客户端 `defineTaskTool` 回退到
`LocalTaskStore`（内存）并明确提示"未持久化"；服务端表保留，不影响旧功能。

## 14. 实现状态（2026-11-26）

**已完成 P1**：

- `script/migration/V47__agent_bg_task.sql`（四张表）。
- `AgentBgTaskEntity` / `AgentBgTaskLogEntity`、`AgentBgTaskMapper` / `AgentBgTaskLogMapper`。
- `BgTaskStore`：create 幂等、租约、attach、progress/meta/checkpoint、日志 seq/批次幂等/
  环形保留（5000 行）、heartbeat、finish（16KB 预校验）、cancel、`disconnected`/取消超时 sweep。
- `BgTaskController`：create/attach/update/logs/heartbeat/finish/cancel/list/get。
- `BgTaskLeaseSweeper`（10s）与 `agent.bg-task.*` 配置（默认 `enabled=false`，跑完 V47 再开）。
- 27 个后端测试（store 契约、sweeper、URL 映射）。

**P1 未覆盖（按后续阶段）**：

- `level/grep` 过滤（当前 `GET /logs` 只支持 `sinceSeq/limit`），随 P3 的 `getTaskLogs` 一起补。
- `agent_bg_task_watch` / `agent_bg_task_note` 的实体、调度器、outbox、`watchTask`。
- 终态任务自动清理（`maxRetainedPerUser` 超限目前直接拒绝新任务）。
- `attach` 后的插件 `resume` 注册与 `resume_policy` 执行。
- 客户端 `ServerTaskStore`、`useTasks`/`useTaskNotes`、服务端 agent 工具。
