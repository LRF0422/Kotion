# 会话任务清单持久化（Agent Session Tasks）

## 一句话

agent 用 `update_todos` 维护的**任务清单**不再只活在某一轮 transcript 的回复里，而是**单独存一份**到
`agent_session_task` 表；用户离开会话、关掉页面后仍能在一个跨会话的「未完成任务」入口里找回它们，
并一键跳回对应会话。

## 问题

今天任务清单的持久化路径是：

```
update_todos 工具 → checkpoint.todos → todo.updated 事件（仅 live SSE）
                                    └→ run 终态时 SessionTranscriptProjector 把最后一个
                                       update_todos 结果写进该轮 assistant 消息的 todos 字段
```

也就是说：

- 只有 run **走到终态**才会落进 transcript；用户在 run 进行中/挂起（等审批、等工具）时离开，
  这一轮的任务清单在恢复后不存在；
- 即便落了库，清单是**某一条回复的附属数据**：要找回「我还没做完的任务」必须自己翻会话、
  翻到具体那一轮，且跨会话没有聚合视图。

## 方案

| 层 | 载体 | 谁写 |
|----|------|------|
| 事实（任务清单） | `agent_session_task`（每会话最新整表快照，逐项一行） | 引擎：`SessionTaskRecorder`（`update_todos` 执行完即写） |
| 读取 | `GET /api/agent/v1/session-tasks`（owner-scoped，仅未完成） | — |
| UI | 聊天头部的「未完成任务」入口（popover / 移动端 sheet） | AI 插件 |

### 1. 数据模型

迁移：`backend/knowledgecloud/script/migration/V44__agent_session_task.sql`

```sql
CREATE TABLE IF NOT EXISTS `agent_session_task` (
    `id`           BIGINT       NOT NULL AUTO_INCREMENT,
    `tenant_id`    BIGINT       NOT NULL,
    `user_id`      BIGINT       NOT NULL,
    `session_id`   VARCHAR(128) NOT NULL COMMENT '会话 id（== conversationId）',
    `item_id`      VARCHAR(64)  NOT NULL COMMENT 'update_todos 的 item.id',
    `title`        VARCHAR(512) NOT NULL,
    `status`       VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT 'pending|in_progress|completed',
    `sort_index`   INT          NOT NULL DEFAULT 0 COMMENT '在整表快照中的顺序',
    `run_id`       VARCHAR(64)  DEFAULT NULL COMMENT '最近一次写入它的 run（审计用）',
    `create_time`  BIGINT       NOT NULL DEFAULT 0,
    `update_time`  BIGINT       NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_session_task_item` (`tenant_id`, `user_id`, `session_id`, `item_id`),
    KEY `idx_session_task_open` (`tenant_id`, `user_id`, `status`, `update_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent 会话任务清单（update_todos 快照）';
```

要点：

- **一个会话只保留最新整表快照**。`update_todos` 是整表覆盖语义，所以写入 = upsert 快照里的每一项 +
  删除本会话里不在快照中的行。
- 空清单（`items: []`）= 清空该会话的任务行。
- 已完成（`completed`）行保留（便于以后做历史/统计），但读取接口默认只返回 `pending` / `in_progress`。
- 不新增 FK：`agent_chat_session` 的主键是自增 id，业务键是 `(tenant_id,user_id,session_id)`；
  会话删除时由接口显式清理任务行（见 §3）。

### 2. 写入时机（后端）

`UpdateTodosTool.execute()` 在把清单交给 `TodoHolder` 之后，调用 `SessionTaskRecorder.record(...)`：

- 只在**根 run** 写入：`ToolContext.delegateDepth == 0`。子 run 的任务清单是子任务内部的计划，
  不能覆盖父会话的任务清单。
- 身份缺失（tenant / user / conversationId 任一为空）时跳过。
- 写入是**尽力而为**：任何异常只 `log.warn`，绝不能让 `update_todos` 本身失败（任务清单是辅助功能，
  不能因存储抖动打断 run）。

> 为什么不在 `onRunTerminal` 投影时写？那正是当前丢失场景的根因——run 没到终态就没有这次写入。
> `update_todos` 是清单唯一的写入者，在工具执行点落库可以让「离开会话」与「任务丢失」解耦。

### 3. 清理

| 事件 | 处理 |
|------|------|
| `DELETE /api/agent/v1/sessions/{id}`（删除会话） | `SessionTaskStore.deleteSession(...)`（尽力而为，失败只记日志） |
| `DELETE /api/agent/v1/sessions/{id}/transcript`（清空对话） | 同上：清空对话后旧任务不应再出现在总览里 |

### 3.1 历史数据回填（一次性）

上面 §2 只索引升级**之后**发生的 `update_todos`。升级前用户"已经丢掉"的未完成任务其实还躺在
`agent_chat_session.messages_json` 里（每轮 `ai` 节点的 `todos` 字段），所以另有一次回填：

- 迁移 `V45__agent_session_task_backfill.sql` 给 `agent_chat_session` 加 `tasks_indexed`
  （`DEFAULT 1`，之后新建的行永不扫描），并把**存量行**置为 `0` = "待回填"；
- `SessionTaskBackfill` 在 `ApplicationReadyEvent` 后用一条 daemon 线程分批处理
  `tasks_indexed = 0` 的会话：取该会话**最后一轮** `ai` 节点的 `todos`，走
  `SessionTaskStore.replaceSnapshot(..., runId=null, ...)` 写入索引，然后无论成功失败都置 1
  （坏数据不在每次启动重试）；
- 有上限（`agent.session-tasks.backfill-limit` 默认 500 / 批 50），可 `backfill-enabled=false` 关闭；
  单实例多实例并发回填是幂等的（整表快照覆盖），不阻塞启动。

### 4. 读取接口

```
GET /api/agent/v1/session-tasks?limit=200
```

- owner-scoped（`tenant_id` + `user_id` 来自 JWT），只返回 `status IN ('pending','in_progress')`。
- 按 `update_time DESC` 排序，`limit` 默认 200、上限 500。
- `sessionTitle` 从 `agent_chat_session` 的会话索引补齐（同一 owner）；没有会话行/没有标题时为 `""`。

响应（`R.data`）：

```json
{
  "count": 3,
  "items": [
    {
      "sessionId": "s-175...",
      "sessionTitle": "整理第三季度周报",
      "taskId": "t2",
      "title": "补充竞品对比表",
      "status": "in_progress",
      "position": 1,
      "updatedAt": 1759999999999
    }
  ]
}
```

### 5. 前端契约（@kn/common）

```ts
export interface AgentSessionTask {
    sessionId: string
    sessionTitle: string
    taskId: string
    title: string
    status: 'pending' | 'in_progress' | 'completed'
    position?: number
    updatedAt?: number
}

class AgentClient {
    /** 跨会话的未完成任务（pending / in_progress），按最近更新倒序。 */
    listOpenSessionTasks(limit = 200): Promise<AgentSessionTask[]>
}
```

UI：`packages/plugin-ai/src/ai/menu/chat/SessionTasksPanel.tsx`，挂在 `ChatHeader` 右侧动作区
（列表图标 + 未完成数量角标）：

- 点开 → 按会话分组的未完成任务列表（桌面用 `Popover`，移动端用底部 `Sheet`）；
- 点击某条任务/会话 → 关闭面板并 `onSwitch(sessionId)` 跳回该会话；
- mount 时静默拉取一次（角标在用户点开前就有数字），打开时拉取（3s 内刚拉过则复用），
  并在 `ChatHeader` 的 tab 运行状态变化（`tabs` 的 id/status 组合）后刷新；
- 后端未部署该接口（404）时静默降级：不显示角标、面板显示加载失败 + 重试；失败后不在状态 tick 上重试。

## 边界与非目标

- **不替代 transcript 里的任务清单**：每轮回复下面的 `TodoPanel` 仍然从 transcript 投影而来；
  本表是"跨会话找回"的索引，不是展示的唯一来源。
- **不做用户侧改写状态**：任务状态由 agent 的 `update_todos` 决定，本期不提供"标记完成/删除"。
- **不做历史版本**：只保留每个会话最新快照；已完成项保留但不出现在未完成列表。
- **不做跨设备实时推送**：打开入口时拉取 + 运行状态变化时刷新，不新增 SSE 通道。
- **入口只在 AI 聊天（侧边 dock / `/ai` 页）**：编辑器里的 AI 助手浮动面板（`AIAssistantPanel`）不渲染
  该入口；它和聊天共用同一个 `conversationId`，其 `update_todos` 同样会进索引，因此任务可在聊天入口看到。

## 部署注意

- 仓库没有自动迁移机制：部署时需手动执行 `V44__agent_session_task.sql` 与
  `V45__agent_session_task_backfill.sql`（顺序执行，V45 依赖 V44 之后的代码路径，不依赖 V44 的表）。
- V45 里 `UPDATE agent_chat_session SET tasks_indexed = 0` 是一次性全表更新，存量会话很多时建议放在维护窗口；
  `ALTER TABLE` 本身在 MySQL 5.7+/8 上是即时/轻量操作，但仍按现网变更流程执行。
- 回填线程在应用 `ApplicationReadyEvent` 之后异步执行，每轮最多 `backfill-limit` 条；超出的存量行
  会在后续启动继续回填（`tasks_indexed` 仍是 0）。可以用 `agent.session-tasks.backfill-enabled=false` 关掉。

## 验证

```bash
# 后端（离线，使用仓库内 toolchain）
cd backend/knowledgecloud
JAVA_HOME=../../.toolchain/jdk-17.0.20+8/Contents/Home \
  ../../.toolchain/apache-maven-3.9.9/bin/mvn -o -pl knowledge-service/knowledge-agent-skills -am test

# 前端类型检查（common 必须 0 错误；core/plugin-ai 只允许仓库既有的 editor import.meta 噪声）
pnpm exec tsc --noEmit -p packages/common/tsconfig.json
pnpm exec tsc --noEmit -p packages/core/tsconfig.json
pnpm exec tsc --noEmit -p packages/plugin-ai/tsconfig.json
```

## 涉及文件

后端：

- `script/migration/V44__agent_session_task.sql`、`script/migration/V45__agent_session_task_backfill.sql`
- `core/entity/AgentSessionTaskEntity.java`
- `core/mapper/AgentSessionTaskMapper.java`、`core/mapper/AgentChatSessionMapper.java`（回填队列/标记）
- `core/task/SessionTaskStore.java`、`core/task/SessionTaskRecorder.java`、`core/task/SessionTaskBackfill.java`
- `core/config/AgentCoreProperties.java`（`agent.session-tasks.*`）
- `core/tool/builtin/UpdateTodosTool.java`（写入口）
- `core/web/SessionTaskController.java`、`core/web/dto/SessionTaskView.java`
- `core/web/ChatSessionController.java`（删除/清空时清理）
- 测试：`core/task/SessionTaskStoreTest.java`、`core/task/SessionTaskRecorderTest.java`、
  `core/task/SessionTaskBackfillTest.java`、`core/tool/builtin/UpdateTodosToolTest.java`、
  `core/web/SessionTaskControllerTest.java`

前端：

- `packages/common/src/ai/agent/types.ts`、`packages/common/src/ai/agent/client.ts`、`agent/index.ts`
- `packages/plugin-ai/src/ai/menu/chat/SessionTasksPanel.tsx`
- `packages/plugin-ai/src/ai/menu/chat/ChatHeader.tsx`
- `packages/plugin-ai/src/index.tsx`（`ai.chat.tasks.*` 文案 en/zh）
