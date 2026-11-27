# Agent 页面操作统一模型（AgentPageTarget）

> 「当前操作对象」是类型开放的，页面只是其中一种。通用模型、插件 provider 与 `getCurrentTarget`
> 工具见 **[AGENT_OPERATION_TARGET.md](AGENT_OPERATION_TARGET.md)**；本文只描述页面这一种对象的
> 身份、权限、文档能力与写权归属。
>
> 页面/文档编辑不是 agent 的默认身份：它是 `capability:document` 能力包，只在 surface 真正持有文档
> 目标时激活，否则由 `load_skill` 按需加载。见 **[AGENT_DOCUMENT_DECOUPLING.md](AGENT_DOCUMENT_DECOUPLING.md)**。
>
> 隐藏编辑器的租约生命周期（generation、liveness、自愈、透明重试）见
> **[AGENT_EDITOR_STABILITY.md](AGENT_EDITOR_STABILITY.md)**。

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
| 可见编辑器认领（`agent-editor-registry`） | 浮动窗 / 侧边分栏 / 工作台分栏把 `pageId → editor` 注册到**应用级**认领表；会话与工作台订阅后立即让位 |
| 工具绑定层（`useCapabilityProviders` + `EditorToolExecutor`） | 每次调用按目标页面解析**确切**编辑器；文档工具绝不回落到"当前可见页面" |
| 工作台（`useWorkspaceDocumentTarget`） | 分栏里的页面产物 = 文档编辑目标；优先复用可见编辑器，否则按需获取隐藏会话 |
| 通用操作对象（`agent-operation-target`） | 页面 provider 把会话目标/可见页 + 选区报告给 `getCurrentTarget`；非页面对象由插件 provider 描述 |

## 4. 不变量

- **单一权威**：一个页面只有一个有效来源；受邀能力对其 pageId 恒优先，移除后自动回落到租户服务。
- **失败关闭**：只读邀请 `canEdit=false`；隐藏编辑器直接 `markError`，可见/浮窗路径由工具执行器
  拒绝修改类工具（读仍可用）。
- **认证统一**：房间认证只通过 `getCollabToken()`，受邀页面重建信封、普通页面取最新 access token。
- **惰性解析**：目标对象可廉价创建（服务访问是 getter / 方法），host 没有注册 space-page 服务时也不会抛错。
- **不缓存页面内容**：模型只描述"怎么访问"，内容读取仍走 `loadRecord` / 编辑器。

### 4.1 编辑目标（document target）的额外不变量

页面"身份/权限"模型之上还有一层"这次工具调用写哪个文档"，它由四个模块分工：

| 层 | 模块 | 唯一职责 |
| --- | --- | --- |
| 页面作用域认领 | `agent-editor-registry` | 某个 pageId 当前由哪个**可见**编辑器承载（分栏/浮窗/路由） |
| 会话编辑目标 | `session-page-binding` | 一个会话 / 委派子 agent 的目标页面与隐藏会话租约 |
| 隐藏编辑器引擎 | `offscreen-editor-bridge` + core `OffscreenEditorHost` | 屏幕上没有该页面时的编辑器 |
| 工具绑定 | `useCapabilityProviders` / `EditorToolExecutor` | 每次调用解析"确切目标编辑器"，失败关闭 |

- **同一页面只有一个 writer**：可见编辑器注册认领时，应用级注册表立即 `destroyIdle` 未持有的隐藏会话；
  仍持有租约的会话（会话目标 / 子 agent）由订阅方释放。认领不依赖"当前聚焦的会话"，因此分栏先于聊天
  打开、`/ai` 工作台、后台标签页都不会丢认领。
- **不串页**：会话目标为 A、可见编辑器是 B 时，`getEditor()` 必须返回 A 的租约或 `null`，绝不返回 B。
  工具绑定层对文档工具做同样判定；目标编辑器拿不到时返回可操作错误（先 `createPage` / `editPage`），
  而不是把这次写入落到 B。
- **跨页操作不改变目标**：往父页面插入链接、给参数指定的页面写内容，使用
  `SessionPageBinding.getEditorForPage()` 取得编辑器，不调用 `editPage`。后者只用于"把会话目标切到 X"。
- **页面管理工具与编辑器解耦**：`createPage` / `editPage` / `searchPages` / `movePage` 等声明
  `requiresEditor: false`，不会因为目标编辑器暂时不可用而被执行门禁卡住——它们正是恢复目标的路径。
- **页面类型 ≠ 不可编辑**：只有 `renderer.type === 'component'`（整页由插件组件渲染、没有文档正文）
  的页面才没有编辑器；`editor-component` 类型的页面（例如思维导图页：文档首块是插件的画布节点）就是
  普通协作文档，可见编辑器照常登记认领，隐藏会话/浮动窗照常挂载。把"声明了 pageType"当成"不是文档"
  会让这类页面对 agent 彻底不可编辑——`editPage` 只能落到"当前页面没有编辑器"的通用报错上。
- **没有正文的页面失败关闭且不可重试**：整页组件页面（或 pageType 所属插件未启用）在**获取编辑器之前**
  就以明确文案拒绝（`componentPageTargetMessage` / `missingPageTypeTargetMessage`），文案说明
  "这不是暂时状态、重试不会成功"，并指向页面类型插件自己的工具或用户手动编辑；`resolveSharedEditorForPage`
  不再吞掉原因改为 reject，避免再退化成"请稍后重试"的重试循环。
- **可见页面上下文携带 pageType**：`CurrentPageContext.pageType` 由页面 surface 发布，`editPage` 的
  "当前页面"快路径因此能在不做额外元数据请求的前提下判定页面类型；`SessionPageBindingPage.pageType`
  把这判定传进 surface。
- **工作台可在同一轮拿到文档能力**：run 的 tools 列表在创建时冻结，所以 workspace 预先广告文档工具；
  执行时再解析确切目标。否则 `createPage` 成功后同一条 run 仍然"写不了"，只能等用户再发一轮。
- **分栏页面就是目标**：工作台把 `targetArtifact.kind === 'page'` 传入 `useWorkspaceDocumentTarget`，
  分栏打开/恢复后即成为编辑目标；分栏的可见编辑器认领后，隐藏会话让位。

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
pnpm --filter @kn/common check:document-target # 认领表 / 确切目标 / 页面工具分类
```
