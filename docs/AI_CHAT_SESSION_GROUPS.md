# AI 会话分组（Session Groups）

## 一句话

侧边栏会话列表在「按时间分组」之外支持用户自建分组（文件夹）：可新建 / 重命名 / 删除、可折叠、
可把会话移入或移出；**没有分组的会话仍按 今天 / 昨天 / 近 7 天 / 更早 排列**，所以没有分组时列表
和以前完全一样。分组本身与归属都同步到后端（`agent_session_group` + `agent_chat_session.group_id`），
多设备一致；折叠状态是纯本机视图偏好，不上云。

## 交互

- 会话列顶部（标题右侧）的 🗂 按钮新建分组；没有分组时列表顶部还有一条虚线的「新建分组」入口。
- 分组以文件夹行渲染在时间分组之上：`chevron + 文件夹 + 名称 + 数量`。点击行折叠 / 展开。
- 分组行右侧 `⋯`：重命名、删除。删除前确认，确认后组内会话回到「未分组」（不会丢会话）。
- 会话行悬停出现两个动作：`移入分组`（下拉列出全部分组，当前分组打勾，含「移出分组」）和原来的删除。
- 打开（或从任务/后台任务跳到）一个在折叠分组里的会话时，该分组自动展开，避免「选中却看不见」。
- 空分组也会渲染（显示「这个分组还没有会话」），否则新建的分组无法被看到、也无法作为移入目标。
- 有分组时，时间分组上方会多一个「未分组」提示，说明下面的 今天/昨天/… 属于未分组会话。

## 数据模型

| 层 | 载体 | 谁写 |
|----|------|------|
| 分组定义 | MySQL `agent_session_group`（V46，`tenant_id`+`user_id`+`group_id` 唯一） | 客户端 UI（`SessionGroupController`） |
| 会话归属 | `agent_chat_session.group_id`（NULL = 未分组） | 客户端 UI（既有会话 PUT） |
| 本机缓存 | localStorage `kn-ai-chat-session-groups`（分组元数据） | 浏览器 |
| 折叠状态 | localStorage `kn-ai-chat-session-group-collapsed` | 浏览器，仅本机 |

- `group_id` 是**客户端生成**的字符串（`g-<时间戳>-<随机>`），和 `session_id` 一样不依赖数据库自增
  id：离线创建的分组可以稍后合并，不需要先拿服务端 id。
- `sort_index` 是唯一的跨设备顺序信号；`create_time` 只做并列时的兜底。
- 分组与会话是两笔独立写入：移动会话只写会话的 `groupId`，改名只写分组；互不牵连。

## REST API

```
GET    /api/agent/v1/session-groups?limit=200        分组列表（按 sort_index, create_time 升序）
PUT    /api/agent/v1/session-groups/{groupId}        { name, sortIndex? } 新建 / 改名 / 调序
DELETE /api/agent/v1/session-groups/{groupId}        删除分组并清空成员的 group_id
PUT    /api/agent/v1/sessions/{sessionId}            { title, targetPage, boundPage, groupId, ... }
```

- `PUT /session-groups/{id}` 的 `sortIndex` 可省略：改名时省略表示保持原位置（后端查旧行保留），
  新分组省略则为 0。名称必填，最长 64 字符；分组 id 最长 64 字符。
- `DELETE /session-groups/{id}` 先 `UPDATE agent_chat_session SET group_id = NULL WHERE group_id = ?`
  再删分组行；这一步**故意不改 `update_time`**——该列是会话列表的时间排序，删个文件夹不该重排会话。
- 会话的 `groupId` 走既有的 `PUT /sessions/{id}`，`null` 表示移出分组。

## 同步与合并

- 分组与会话**分开合并**（`chat-session-merge.ts`，纯函数）：同一 id 以更新时间更新的副本为准，本地独有的
  分组保留并在 hydrate 时回传后端（离线创建 / 旧后端场景）。
- 分组排序统一为 `sortIndex → createdAt → id`，前端与后端顺序一致。
- 移动会话**不推进 `updatedAt`**（否则「移进文件夹」会把会话顶到「今天」）。代价是合并时时间戳可能
  相同：此时若 `groupId` 不同，**本地副本胜出**——它代表刚刚才发出的那一次用户操作，否则刷新会退回
  旧的归属。远端时间**更新**（别的设备先改过）仍然以远端为准；只有时间戳**完全相等**才走本地优先。
- `groupId` 指向已删除/不存在的分组时，会话当作未分组渲染（不会从列表消失），前端下次移动时会纠正。
- 旧后端（没有 `/session-groups`）时分组端点单独标记不可用，**不影响会话列表同步**；分组退化为纯本地。

## 边界与已知限制

- **一个会话最多一个分组**：这是文件夹语义，不是标签（同一会话不能同时属于「工作」和「Kotion」）。
- **折叠状态不跨设备**：它是设备级视图偏好，不写库、不进同步。
- **分组不能拖拽排序**：顺序由 `sort_index` 决定，新建分组追加到末尾；后续要支持拖拽，改的是
  `PUT /session-groups/{id}` 的 `sortIndex`，不需要改表。
- **分组内不能直接新建会话**：先在顶部新建会话，再用「移入分组」。分组只是收纳，不改变会话的工作目录。
- **删除会话不删分组**：空分组保留（可复用），只有显式删除分组才移除分组行。
- **删除分组的请求失败时（断网）**：本地已移除分组、会话回到未分组，但后端仍留着分组行；
  下次刷新分组可能重新出现（空分组）。会话本身不会丢，恢复网络后再删一次即可。
- 上限：后端 200 个分组，前端本地缓存 100 个；名称 64 字符。

## 验证

```bash
# 纯逻辑：分组切分 / 排序 / 空分组 / 失效 groupId / 时间戳坏掉的行
pnpm --filter @kn/plugin-ai check:session-groups

# 合并规则：较新者胜、时间戳相等时本地分组胜、离线分组保留
pnpm --filter @kn/plugin-ai check:session-merge

# 已有的时间分组不受影响
pnpm --filter @kn/plugin-ai check:sessions

# 后端：分组 store 的归属校验、改名保留位置、删除先解绑；路由映射
cd backend/knowledgecloud && mvn -o -pl knowledge-service/knowledge-agent-skills \
  test -Dtest=ChatSessionGroupStoreTest+SessionGroupControllerMappingTest
```

手工回归（打开 `/ai` 全页会话列）：

1. 新建分组 → 出现空分组；折叠 / 展开；刷新后仍在。
2. 把两个会话「移入分组」→ 分组内按最近更新排序；时间分组里不再出现。
3. 重命名 → 行内名称变化；刷新后保留（后端已写入）。
4. 删除分组 → 确认框 → 会话回到未分组时间分组，会话本身还在。
5. 折叠该分组后从「未完成任务」跳进组内会话 → 分组自动展开并滚动到行。
6. 后端不可用（断网）→ 仍可新建/移动/折叠；恢复后刷新，分组与归属同步上去。

## 涉及文件

前端：

- `packages/plugin-ai/src/ai/menu/chat/SessionSidebar.tsx` — 分组行、移入菜单、新建/改名对话框、删除确认、折叠
- `packages/plugin-ai/src/ai/menu/chat/session-list.ts` — `partitionSessionsByGroup` / `sortSessionGroups`（纯函数）
- `packages/plugin-ai/src/ai/menu/chat/session-groups.check.ts` — 上述纯函数的自测
- `packages/plugin-ai/src/ai/menu/chat-sessions.ts` — 分组类型、localStorage 读写、`ChatSessionMeta.groupId`
- `packages/plugin-ai/src/ai/menu/chat-session-api.ts` — 分组接口适配（独立可用性标记）
- `packages/plugin-ai/src/ai/menu/chat-session-merge.ts` — 远端 / 本地元数据合并规则（纯函数）
- `packages/plugin-ai/src/ai/menu/chat-session-merge.check.ts` — 合并规则自测
- `packages/plugin-ai/src/ai/menu/useChatSessions.ts` — 分组状态、增删改、移入、hydrate 合并
- `packages/plugin-ai/src/ai/home/KernelHomePage.tsx` — 把分组能力传给桌面列 / 移动端抽屉
- `packages/plugin-ai/src/index.tsx` — en / zh 文案
- `packages/common/src/ai/agent/{types,client,index}.ts` — `AgentSessionGroup` 类型与客户端方法

后端（`knowledge-service/knowledge-agent-skills`）：

- `script/migration/V46__agent_session_group.sql`（仓库根 `backend/knowledgecloud/script/migration/`）
- `entity/AgentChatSessionGroupEntity.java`、`mapper/AgentChatSessionGroupMapper.java`
- `session/ChatSessionGroupStore.java`、`web/SessionGroupController.java`
- `web/dto/ChatSessionGroupView.java`、`web/dto/SaveChatSessionGroupRequest.java`
- 会话侧：`AgentChatSessionEntity` / `AgentChatSessionMapper` / `ChatSessionView` / `SaveChatSessionRequest` / `ChatSessionController`
- 测试：`ChatSessionGroupStoreTest`、`SessionGroupControllerMappingTest`