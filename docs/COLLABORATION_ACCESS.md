# 页面协作：可见性、编辑与保存规则

本文记录页面级协作邀请（`wiki_collaboration_invitation`）的产品规则、实现落点与边界，
供后续改动对照，避免再次出现"受邀人永远不能保存"或"受邀人抢到租约后 host 无法保存"这类反向行为。

## 1. 三条产品规则

| 规则 | 内容 |
| --- | --- |
| R1 | 受邀协作者在 **Home** 能看到被邀请的页面（已接受的直接进入协作工作区；待接受的先接受）。 |
| R2 | 受邀协作者拥有编辑权限（邀请 `permission` 为 `WRITE` / `ADMIN`），且 **当前没有人持有该页面的写租约**（host 未加入 / 已离开）时，协作者可以编辑 **并保存**（直接落库）。 |
| R3 | host 参与进来后（host 打开页面并 claim 到租约），受邀协作者 **只能编辑** 共享 Y.Doc，保存由 host 完成；协作者不再写库。 |

"host" 不是固定的人，而是**写租约的持有者**：一个页面同一时刻只有一个写者。
邀请人（页面所属方）随时可以把自己的页面从受邀协作者手里**抢回**租约。

## 2. 租约会话模型

- 服务端用 Redis 键 `wiki:page:session:{pageId}` 记录当前写租约持有者，TTL 30s，客户端每 10s 心跳续租。
- 角色：`HOST`（唯一写者）/ `COLLABORATOR`（只能编辑 Y.Doc）/ `NONE`（没有会话）。
- 租约带 `guest` 标记：通过协作邀请产生的租约是 **可被抢占的 guest 租约**；
  页面所属方的普通参与者产生的租约是 **不可抢占的常规租约**。
- 租约的 `guest` 标记按 **身份** 判定，不按入口路由判定：只要（pageId, userId）存在一条
  **页面级协作者授权**（`wiki_page_collaborator`，邀请被接受时写入、接受后永久保留），
  即使受邀人从空间树 / 最近页面 / 深链接进入，也按 guest 处理。
  用持久授权而不是邀请行判定，是因为邀请令牌会过期，而授权不会——否则长期协作者会在
  邀请过期后变成不可抢占的普通参与者。
- 保存类接口（ops / reconcile / checkpoint / restore）仍然只认"当前租约持有者"，
  非持有者返回 `NOT_SESSION_HOST(4010)`。

## 3. 谁会保存（状态机）

```
受邀协作者打开页面
  ├─ 无人持有租约 ──► claim 成功 = HOST ──► 自己保存（R2）
  └─ host 持有租约 ─► COLLABORATOR ─────► 只编辑，host 落库（R3）

host 打开页面（无论受邀人是否在编辑）
  └─ 普通参与者 claim 会抢占 guest 租约 ──► host 成为 HOST
       └─ 受邀人下一次心跳（≤10s）或下一次被拒写入(4010) 时降级为 COLLABORATOR
          └─ 受邀人未落库的编辑已在共享 Y.Doc 中，由 host 的 tracker 作为远端变更保存

host 离开 / 租约过期
  └─ 受邀人心跳得到 NONE ──► 不结束会话，而是重新 claim = HOST（继续可保存）
```

受邀协作者 **永不** 进入"会话已结束 / 只读退出"状态（那是普通协作者的规则），
也不会显示 "Host disconnected" 倒计时。

## 4. 实现落点

前端：

- 入口与工作区：`packages/plugin-main/src/pages/InviteCollaboration/index.tsx`、
  `CollaborationWorkspace.tsx`（`?open=1` 自动进入已接受的邀请；guest 工作区使用 token 绑定的文档能力）。
- 编辑器会话/保存：`packages/plugin-main/src/pages/SpaceDetail/PageEditor/index.tsx`（`guestMode` → `guest: true`；
  移除等待 host 的阻塞界面；保存状态 "Saved by <host>" / "Not saved yet"；guest 隐藏分享/收藏/模板/关系图/版本历史/移入回收站）。
- 会话规则：`packages/editor/src/hooks/session-rules.ts`（`decideHeartbeat` 的 guest 分支、
  `shouldWaitForHost` 对 guest 恒 false）、`use-page-session.tsx`（`guest` 选项、`refresh()`）、
  `use-page-save.tsx`（`NOT_SESSION_HOST(4010)` → `leaseLost` + 立即刷新角色）、
  `use-op-save.tsx`（失去租约时静默丢弃批次：不报错、不重试、不 reconcile）。
- Home 共享列表：`packages/plugin-main/src/pages/Home/index.tsx`（"共享给我" tab，接受/打开、过期时间、刷新）。
- 服务契约：`packages/common/src/domain/space-page/{contracts,operations}.ts`；
  实现：`packages/core/src/domain/space-page/{api,service,normalizers}.ts`；
  邀请文档自动请求一律 `silent: true`（`invitation-documents.ts`），避免抢占/过期时全局报错弹窗。

后端（`backend/knowledgecloud/knowledge-service/knowledge-wiki`）：

- 邀请可写：`doc/CollaborationPageController.java` 不再对 `WRITE/ADMIN` 邀请一刀切拒绝；
  写操作仍由 `requireSessionHost` 把关。
- 租约仲裁：`collab/CollabSessionService.java`（`PageSession.guest`、5 参 `claimSession`、
  普通参与者抢占 guest 租约；guest 之间不互相抢占）。
- 身份判定：`doc/PageDocController.java` + `IPermissionService.hasPageGrant`
  （普通页面路由也按页面级授权得到 guest 租约；授权在邀请被接受时写入并长期保留）。
- Home 列表 API：`GET /knowledge-wiki/collaboration/invitations/mine`
  （`controller/CollaborationController.java` + `application/CollaborationApplication.listMyInvitations`，
  PENDING+ACCEPTED、未过期、页面未删除、按页面去重、`createdAt` 倒序）。
- 测试：`CollabSessionServiceTest`、`PageDocControllerGuestClaimTest`、
  `CollaborationApplicationAuthorizationTest`（Home 列表部分）。
- 前端逻辑自测：`packages/editor` 的 `check:session`（含 guest 场景）、
  `packages/core` 的 `check:space-page`（含 `listMyInvitations` 归一化）。

## 5. 已知边界（非本规则范围）

- 邀请被撤销/过期后，已经建立连接的协同房间不会立刻踢人：REST 写路径会立即拒绝，
  但房间里已存在的编辑仍可能被当前 host 落库（房间授权只在 join 时校验）。
- `wiki_link` / `block_index` 等投影表由 `@Async` 监听器重建，异步线程不继承请求上下文，
  其 `tenant_id` 填充是既有问题，与 guest 直接保存无关（保存路径同步写入的表均为非租户表）。
- 受邀人与 host 同组织时仍可能从空间树打开页面（此时按页面级授权得到 guest 租约，可被 host 抢占）。
- 被撤销/过期邀请后仍持有页面级授权的人，会继续按 guest 租约处理（可被 host 抢占，安全方向）；
  若产品要求撤销后彻底失去页面访问，还需要同时回收 `wiki_page_collaborator` 授权。
- 「移除协作者」会删除页面级授权，但已接受的邀请行仍在：邀请写的接口因此额外校验
  `IPermissionService.hasPageGrant`，保证被移除的协作者不能再用令牌写库；读接口仍沿用
  邀请令牌（与改动前一致）。
- 协作邀请表目前没有仓库内 DDL，`(page_id, invitee_id, status, permission)` 组合索引需在迁移中确认。
- 历史数据：在页面级授权写入逻辑上线前接受、但没有 `wiki_page_collaborator` 行的邀请，
  令牌读仍可用、写会被拒绝（安全方向）；重新邀请/重新接受后恢复写权限。

## 6. 验证

```bash
# 前端逻辑自测
pnpm --filter @kn/editor check
pnpm --filter @kn/core check:space-page

# 后端（离线需要 -am，sibling jar 未安装）
cd backend/knowledgecloud
mvn -o -pl knowledge-service/knowledge-wiki -am test \
  -Dtest=CollabSessionServiceTest,CollaborationApplicationAuthorizationTest,PageDocControllerGuestClaimTest \
  -Dsurefire.failIfNoSpecifiedTests=false
```

## 7. 编辑器协同保存链路（复审结论）

保存链路：`Y.Doc（房间内共享）→ OpTracker 派生 op → useOpSave（防抖/重试/reconcile）
→ usePageSave（写租约门禁）→ 后端按租约写入 wiki_block`。本轮复审确认/修复了以下问题：

已修复：

- **远端编辑被当成"整页改动"**：`@tiptap/y-tiptap` 应用远端 Yjs 更新时用一次
  `tr.replace(0, size, …)` 替换整篇文档，原来按 changed range 归因会把所有顶层块标脏
  （一次协同按键 = 整页 replace，且 `absorbServerDoc` 的 dirty 集被污染，会把 AI/导入的
  服务端写入"本地优先"地回滚）。现在对"整篇替换"形状的事务改为按顶层块内容 diff 归因
  （`op-tracker.ts` `forEachActuallyChangedTopBlock`）。
- **协同文档未同步时禁止落库**：`usePageSave` 新增 `collaborationSynced` 门禁（PageEditor /
  页面浮窗 / 隐藏 AI 编辑器都传实际 `synced`）。未同步时既不领租约也不写库——此前会在
  8s 超时后用空文档 reconcile，把有内容的页面清空；状态栏显示 "Not synced"。
- **首次 claim 失败不再永久失写**：心跳收到 NONE 且从未持有会话时，`decideHeartbeat` 返回
  新的 `claim` 决策并重试 claim（服务端幂等，占用中会返回 COLLABORATOR）；同时通过
  `claimFailed` 在状态栏显示 "Not saved yet"，不再谎报 "Saved"。
- **按 pageId 重挂载编辑器**：`/page/:spaceId/:pageId` 等路由复用同一个 PageEditor 实例，
  原来切换页面时旧页面的写租约、rev 水位、待写队列和 flush 闭包会串到新页面（尾部编辑写到
  错误页面、新页面 baseRev 永远 409 而静默停止保存）。现在 PageEditor 外层按 pageId 加 key。
- **seed 抢占成功后不再立即释放**：并发打开同一空白页面时，后到者可能在广播到达前拿到
  释放掉的 claim 并再次 seed，Yjs 合并出重复块；现在成功 seed 后保留 claim 至 TTL。
- **降级后再提升时补一次 reconcile**：被 host 抢占租约期间 Y.Doc 里可能有从未落库的编辑；
  重新拿到租约时用 `markWriteOwed + requireReconcile` 补一次整篇收敛（对齐时是无操作）。
- **catch-up 竞态**：新增"已确认 rev 水位"并在 fetch 返回后再次检查写入状态，避免把旧快照
  合并进来删掉刚保存的块；catch-up 被并发触发时改为排队重试而不是丢弃；完成后恢复挂起写入。
- **重连认证**：房间 token 改为 getter（每次重连取最新 access token；邀请令牌信封保留
  invitationToken），避免 token 过期后房间永久无法重连或因为 token 变化重建 Y.Doc。
- **后台标签页的会话结束**：只在可见编辑器上弹窗/自动跳转，不再劫持前台页面。
- **隐藏 AI 编辑器**同样受同步门禁：未同步时不再报告 ready（改为 markError），页面浮窗状态栏显示
  "Not synced"，不会再显示 "Saved" 却静默丢弃内容。
- **协作者的 agent 可以操作协作页面**：协作工作区把"邀请令牌绑定的页面能力"注册到
  `@kn/common` 的能力注册表（文档读写、房间 auth 信封、页面读取）。隐藏的离屏编辑器、浮动编辑窗、
  页面工具（`editPage`/元数据读取）都先查这张表，从而跨租户读写同一个页面。另外 shell dock 在
  路由本身不携带 pageId（`/collaborate/:token`）时回退到"当前可见编辑器"，agent 面板因此能拿到
  协作页面的编辑器；`openPage` 对受邀页面会回到协作工作区而不是受邀人看不到的空间路由。
- **只读邀请的 agent 写入被拒绝**：`canEdit=false` 时隐藏编辑器直接 markError；可见编辑器/浮窗路径
  则由工具执行器的 `canMutate` 钩子在执行任何"修改类"工具前否决（agent 仍可读页面，但不能通过
  程序化事务改写共享 Y.Doc，从而避免被在线 host 落库）。
- **未同步/非写者期间的编辑不会丢失**：写者关闭期间监听文档事务——按变更范围识别"远端整篇替换"
  （Yjs 绑定的远端更新形状，未写过时由当前 host 落库，不计为本机欠写），其余变化（同步前打字、
  被降级后的任何变化）记为欠写；重新拿到写权（或房间同步完成）时先整篇 reconcile，把此前只存在于
  Y.Doc 的内容落库。该判定只做 O(steps) 的范围比较，不会对每次远端按键做全文档 diff。

仍未解决（按风险排序）：

1. 客户端 "guest" 语义仍由入口路由（协作工作区）决定：同租户的页面级协作者从空间树进入时，
   在 host 会话结束后按普通成员语义被只读，而不是接管。要统一需后端在 `PageSessionVO`
   返回身份级的 guest 标记，客户端据此驱动 `decideHeartbeat`。
2. 实时通道断开但 HTTP 心跳仍在时：持有租约的客户端仍可从陈旧文档写入；被降级瞬间的
   批次按"编辑已在共享 Y.Doc"假设静默丢弃——通道断开时这个假设不成立。
3. 退出 flush 不检查 `behindServer`：落后于服务端时发送的 reconcile/op 批次可能被 3016 拒绝且
   被吞掉（数据仍在 Y.Doc，但关闭后无法保证落库）。
   （`reconcileOnly` 现在在三条编辑器链路上已被 `collaborationSynced` 门禁取代——未同步的客户端
   根本不写；该开关保留给没有协同房间的编辑场景。）
4. 房间授权只在建连时校验：邀请被撤销/过期后，已连接的 guest 仍可编辑 Y.Doc（写库已拒绝）。
5. seed 被拒的客户端不会重试；对方若在 seed 前取消，需等 TTL（20s）或刷新页面。
6. "写者关闭期间"的欠写判定按"变更范围是否为整篇替换"区分本地/远端：在**从未写过且未同步**的窗口里，
   本地整篇 `setContent`（例如 Markdown 导入）会被当成远端更新忽略。要精确区分需引入 y-tiptap 的
   `ySyncPluginKey` 元数据（该包目前不是 `@kn/editor` 的直接依赖），属于已知窄边界。

