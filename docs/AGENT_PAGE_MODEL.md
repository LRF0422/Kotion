# Agent 页面操作统一模型（AgentPageTarget）

本文记录"agent 操作页面"的唯一模型，以及各 surface 如何向它提供数据、各消费方如何只依赖它。
此前 agent 触达页面有四条互相独立、细节不同的路径（可见编辑器 / 隐藏离屏编辑器 / 浮动编辑窗 /
页面工具），每条都要自己处理"普通页面还是受邀协作页面""谁能读""谁能写""房间怎么认证"，
导致同一类 bug 反复出现在不同路径上（受邀页面读不到、隐藏编辑器跨租户取不到页、只读邀请仍可被
agent 程序化写入等）。

## 1. 模型

`packages/common/src/ai/agent-page-target.ts` 定义 `AgentPageTarget`：

| 字段 | 含义 |
| --- | --- |
| `pageId` / `spaceId` / `title` / `parentId` | 页面身份（字符串化后的 id） |
| `source` | `'workspace'`（租户内普通页面）或 `'collaboration-guest'`（受邀协作页面） |
| `isGuest` | 是否跨租户、使用邀请令牌访问（决定写租约的 guest 语义） |
| `canEdit` | agent 是否可修改。只读邀请（READ）为 `false`，读操作仍可用 |
| `documents` | **唯一**文档读写能力：`PageDocumentOperations`（普通租户 API 或邀请令牌 API） |
| `getCollabToken()` | 房间认证：裸 access token，或邀请令牌信封 `{accessToken, invitationToken}`（每次重连重建） |
| `loadMetadata()` / `loadRecord()` | 页面元数据 / 完整页面行的统一读取入口 |
| `open()` | 从当前 surface 导航到该页面（受邀页面走协作工作区路由） |

解析入口：

- `resolveAgentPageTarget(pageId?)`：缺省 id → 当前可见页面；显式 id → 该页面。
- `resolveCurrentAgentPageTarget()`：当前可见页面的便捷入口。
- `subscribeAgentPageTargets(listener)`：可见页面变化或受邀能力注册/移除时通知 React surface。

## 2. Provider（谁提供目标）

模型本身不建第二份状态，只合并两个既有权威来源：

1. **可见页面桥** `page-navigation-bridge`：当前 pageId/spaceId/title/parentId 与导航。
2. **受邀页面能力** `collaboration-guest-page`：由 `CollaborationWorkspace` 注册的邀请令牌能力
   （文档能力、房间认证信封、页面读取、`canEdit`、`open`）。它对该 pageId **优先于**租户服务。
3. 其余页面回退到 `workspace`：租户级 `SpacePageService` + 用户 access token + 工作区路由。

新增一种页面来源（例如公开分享页、AI 合成文档）时，只需提供上述字段的实现，并在 resolver 中
登记为更高优先级的来源；所有消费方无需改动。

## 3. 消费方

| 位置 | 使用方式 |
| --- | --- |
| `page-tools` 的 `readMetadata` / `editPage` | `resolveAgentPageTarget(pageId).loadMetadata()`，不再分别处理受邀/普通页面 |
| 隐藏离屏编辑器（`OffscreenEditorHost`） | 解析目标后用它的 `documents`、`getCollabToken`、`loadRecord`、`canEdit`、`isGuest` 挂载编辑器与写租约 |
| 浮动编辑窗（`PageEditWindowImpl`） | 同上；"打开完整页面"对受邀页面走目标 `open()` |
| agent 修改类工具 | `canMutate` 先看目标 `canEdit`，再看绑定编辑器 `isEditable`：只读页面/只读邀请的写操作在工具执行器层被拒绝 |
| Shell dock（`use-dock-state`） | 路由不携带 pageId（`/collaborate/:token`）时回退到当前可见编辑器，agent 面板才能拿到操作对象 |

## 4. 不变量

- **单一权威**：一个页面只有一个有效来源；受邀能力对其 pageId 恒优先，移除后自动回落到租户服务。
- **失败关闭**：只读邀请 `canEdit=false`；隐藏编辑器直接 `markError`，可见/浮窗路径由工具执行器
  拒绝修改类工具（读仍可用）。
- **认证统一**：房间认证只通过 `getCollabToken()`，受邀页面重建信封、普通页面取最新 access token。
- **惰性解析**：目标对象可廉价创建（服务访问是 getter / 方法），host 没有注册 space-page 服务时也不会抛错。
- **不缓存页面内容**：模型只描述"怎么访问"，内容读取仍走 `loadRecord` / 编辑器。

## 5. 仍不在模型内的部分（有意为之）

- `workspace` 源的 `canEdit` 目前只区分"非只读邀请"（恒为 true）：普通租户页面的只读性由
  可见编辑器的 `isEditable`（agent 修改类工具的 `canMutate` 会检查）与后端页面权限校验兜底。
  后续可把 `PageRecord.permission` 合入 `canEdit`，让隐藏编辑器对租户只读页面也提前失败关闭。

- 页面树/搜索/创建/移动/回收站等**空间级**工具：它们天然是租户级的，受邀页面超出单页邀请范围。
- 编辑器实例的获取（可见编辑器、隐藏会话池、私有 fork 文档）：属于 surface/会话管理，不属于页面访问；
  但它们拿到的文档能力、认证与 `canEdit` 均来自本模型。
- 页面工具里的显式跳转（`openPage`）保留 `page-navigation-bridge` 的语义；受邀页面由桥的 surface
  覆盖回到协作工作区，浮动窗的"完整页面"则走目标 `open()`。

## 6. 自测

```bash
pnpm --filter @kn/common check:agent-page   # 统一模型 15 项
pnpm --filter @kn/common check:collab-guest # 受邀能力注册表 12 项
pnpm --filter @kn/common check:current-page # 可见页面桥
```
