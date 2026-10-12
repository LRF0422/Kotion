# Local-first 数据层（Space / Page / Block → SQLite）

## 一句话

桌面端把 **Space / Page / Block / 页面文档** 存进主进程的 SQLite（和 KV 存储同一个
`kotion.db`），**本地库就是唯一权威**：不登录、不联网也能完整使用。
云端同步是**可选能力**（默认关闭，由方案/会员门槛决定能否开启）；开启后后台引擎把
outbox 里的改动推上去、并拉取云端更新，关闭后一切照旧只留在本机。
断网时浏览、搜索、改名、移动、收藏、新建页面照常工作。

```
渲染进程 / 插件
  useSpacePageService()  →  SpacePageService（契约不变）
        │
        ├─ 桌面且数据库可用：LocalFirstSpacePageService（本地模式，不碰网络）
        │     ├── 读：本地命中即返回；未命中即"本地没有"（不回源）
        │     ├── 写：写本地（dirty）+ 写入 outbox → 立刻返回
        │     └── 云同步开启后：SyncEngine 才 push outbox → pull 空间/页面树/最近页面
        │              │
        │              └── capability 通道 spacepage.*  →  信封 { ok, value } | { ok, code, message }
        │                        └── 主进程 SqliteDomainStore（与 storage.* 共用一个连接）
        │                                 └── <userData>/storage/kotion.db（表 spaces/pages/blocks/…）
        │
        └─ Web / 数据库不可用：createSpacePageService()（纯 HTTP，行为与本改造前一致）
```

**设计约束（重要）**：`SpacePageService` 端口本身一行没改。所有消费者（plugin-main、
editor、AI 工具、插件）继续按原接口调用，不需要知道这次读写落在哪一侧。

## 1. 数据表（schema v2 建表，v3 放宽 outbox 合并索引）

`apps/desktop/src/main/storage/schema.ts` 的 `MIGRATIONS` 追加了 `version: 2`

| 表 | 主键 | 说明 |
|----|------|------|
| `spaces` | `id` | 空间：`name/type/archived/favorite/personal` + `data`(JSON 全量记录) |
| `pages` | `id` | 页面元数据：`space_id/parent_id/title/page_type/status/favorite/pinned/rank` + `data` |
| `blocks` | `id` | 块缓存：`page_id/space_id/parent_id/type/text` + `data` |
| `page_documents` | `page_id` | 页面文档快照：`doc`(JSON) + `rev` + `data` |
| `outbox` | `id` 自增 | 待推送的本地改动（kind/entity/entity_id/coalesce_key/payload/state/attempts） |
| `sync_state` | `key` | 同步标记与游标：`pageTree.synced.<spaceId>`、`localFirst.session` 等 |

每行都带四个本地字段（**只存在于本地，不进契约**）：

| 列 | 含义 |
|----|------|
| `updated_at` | 本地写入时间（epoch ms），行版本 |
| `remote_updated_at` | 该行来自云端的版本时间（从 `updateTime/updatedAt` 解析）；"最近页面"按它排序 |
| `dirty` | 本地改动尚未被云端接受 |
| `deleted` | 软删除墓碑（保留是为了让排队的删除还能重放） |

> `Space`/`PageMetadata` 里已经有 `updatedAt` 字段，所以本地的写入时间在契约层叫
> `localUpdatedAt`，避免和云端时间戳混淆。

## 2. 五条铁律（实现里强制，不靠调用方自觉）

1. **dirty 行不会被干净的 upsert 覆盖。** 拉取（`dirty: false`）遇到本地仍有排队改动的行时，
   只更新 `remote_updated_at`，payload 原样保留。同步引擎只在该实体的**最后一条**排队项
   ack 之后才 `markSynced` 清 dirty，否则后来的拉取会吃掉还没轮到的本地改动。
2. **id 换绑是原子的，且按主键逐行更新。** 离线创建的页面先拿 `local-page-…` 临时 id；
   云端返回真实 id 后 `remapPage` 在一个事务里改：行本身、子页面的 `parent_id`、块的
   `page_id`、文档的 `page_id`、outbox 的 `entity_id`/`coalesce_key`，以及 payload 里
   **恰好等于**该 id 的字符串（子串不动）。多行共用同一个 `parent_id`，所以更新必须按
   主键（`id`/`page_id`）而不能按引用列，否则会把第一个子行的 payload 写给所有兄弟。
3. **树是否完整看标记，不看「有没有行」。** 页面树落库时写 `sync_state` 的
   `pageTree.synced.<spaceId>` 标记；没有标记时 `getPageTree` 一律回源（否则「最近页面」
   里偶然缓存的一行会让侧边栏只显示一个节点）。同步引擎拉完某个空间的树也会打标记。
4. **summary 行要先补全再当完整记录用。** 页面树/列表/最近/搜索写进 `pages` 表的是**摘要**
   （缺 `permission`、`legacyContent` 等只有完整接口才返回的字段），因此带 `partial: true`。
   `getPage()` 读到 partial 行会先回源补全（离线则退回用这行），再把结果合并回本地行；
   若这行还有排队中的本地改名，本地值优先、云端补齐其余字段。
5. **墓碑是本地状态。** `deleted`（软删除）只由本地的删除动作设置；拉取记录不带这个字段
   （它不是契约字段），所以 upsert 必须保留已有墓碑，只有显式 `deleted: false`
   （`restorePageFromTrash`）才恢复。否则打开一次回收站（会缓存 `status: TRASH` 的列表）
   就能把已删除页面重新塞回侧边栏。

## 3. 契约

`packages/common/src/domain/space-page/local-store.ts` 定义 `SpacePageLocalStore`：
`info / getSpace / listSpaces / countSpaces / upsert* / delete* / remap* / getDocument /
listBlocks / enqueue / listOutbox / ackOutbox / failOutbox / retryOutbox / markSynced /
getState / setState / clear`，错误码
`LOCAL_STORE_UNAVAILABLE | LOCAL_STORE_INVALID | LOCAL_STORE_IO | LOCAL_STORE_CORRUPT`。

三处必须同步（和 `storage.*` 一样的规矩）：

| 层 | 文件 |
|----|------|
| 契约（唯一权威） | `packages/common/src/domain/space-page/local-store.ts` + `core/desktop-bridge.ts` |
| 渲染端桥 | `packages/core/src/desktop/space-page-bridge.ts` |
| 主进程实现 | `apps/desktop/src/main/domain/{types,store,index}.ts`（主进程**不能** import `@kn/common`，类型是镜像声明） |
| preload 白名单 | `apps/desktop/src/preload/index.ts` 的 `CAPABILITIES` 与 `SPACEPAGE_CAPABILITIES` 一致 |

## 3.4 云同步：默认关闭的可选能力

| 状态 | 读 | 写 | 网络 |
|------|----|----|------|
| **本地模式（默认）** | 只读本地库；没有就是 `LocalFirstOfflineError` | 写本地库 + outbox，`createPage/createSpace` 也用本地 id | 数据库相关调用**一次都不发** |
| **云同步已开启** | 本地优先，未命中回源并回写 | 同上，随后由引擎推送 | push + pull（启动/每 30s/online/写入后防抖） |

开关与门槛：

- 契约在 `@kn/common`：`LocalFirstSyncControl`（`status/enable/disable/setSyncPolicy/syncNow/retryFailed/subscribe`），
  由桌面运行时实现并注册成核心服务 `localFirst`；
- **门槛可插拔**：`setSyncPolicy(() => boolean | undefined)`。`false` = 拒绝（附稳定原因码
  `no-session` / `policy` / `unavailable`），`undefined` = 权益还没加载完 —— 这时运行时保留用户
  已有的选择，而不是把同步悄悄关掉；
- 默认装配在 `LocalFirstSyncPolicyBridge`：**登录 + 付费方案（`tier > 0`）** 才允许开启（"开会员"那条路径）。
  想放宽成"任何登录账号都能开"，把该文件里的判断改成 `() => true` 即可；
- 选择记录在 `sync_state` 的 `localFirst.syncEnabled`，重启后沿用；
- UI：**设置 → 工作空间 → 本地数据与同步**（本地库信息、缓存计数、队列长度、开关、
  立即同步、重试失败项）。

关闭同步**不清空** outbox：改动会一直排队，等再次开启时按顺序补推。

## 3.5 本地库不可用时会怎样

`spacepage.*` 能力存在但数据库打不开（原生模块 ABI 不匹配、文件损坏、磁盘只读）时，主进程
照常注册所有 handler，每个都回 `LOCAL_STORE_UNAVAILABLE`。渲染端的 local-first 服务**第一次**
遇到这个错误就把该次调用转给云端并把整个（`spaces`/`pages`/`relations`/`documents`）命名空间
切到纯云端模式（`service.degraded === true`，同时把云端 `changes` 转发出来），此后不再碰本地库。
也就是说：坏掉的数据库只会让"离线/本地优先"失效，不会让应用不可用。

## 4. 服务行为矩阵

| 能力 | 离线行为 |
|------|----------|
| `spaces.getSpace/getPersonalSpace/querySpaces` | 本地优先；个人空间用 `personal` 标记记住 |
| `pages.getPage/getPageMetadata` | 本地优先；命中 `partial`（摘要）行时先回源补全，离线退回摘要 |
| `pages.getPageTree` | 只有该空间的树**拉取过**（`sync_state` 里的 `pageTree.synced.<spaceId>` 标记）才用本地拼树；否则回源并打标记。离线时退回用手上的行拼树 |
| `pages.queryPages`（带 spaceId） | 与树同一把尺子：标记存在才用本地；不带 spaceId 的全局查询保持本地 best-effort |
| `pages.queryRecentPages/queryFavoritePages/getPinnedPages` | 本地优先，空缓存才回源（离线为本地快照，见限制） |
| `pages.createPage` | 在线：先云端（拿真实 id）；离线：临时 id + outbox，正文同时写 `page_documents` |
| `pages.updatePageTitle/movePage/movePageToTrash/restorePageFromTrash/favorite/unfavorite/togglePagePin` | 本地立即生效 + outbox；同一页面的同类改动按 `coalesceKey` 合并 |
| `spaces.createSpace/updateSpace/archive/unarchive/delete/toggleFavorite` | 同上；`deleteSpace` 对"从未推送过"的行直接丢弃并清掉排队项 |
| `relations.queryBlocks/queryBlocksPage/searchBlocks/getBlock` | 本地缓存优先；`searchBlocks` 离线退化为本地文本匹配 |
| `documents.getPageDocument` | 本地文档缓存优先 |
| `documents.applyPageOperations/reconcilePageDocument/flushPageOperations` | 在线走云端；离线排队，返回 `metadata.queued = true` 且**不带 rev**（编辑器自行保持 pending 状态） |
| `documents.claim/heartbeatPageSession` | 离线返回 `{ role: "HOST", alive: true, metadata: { offline: true } }`：没有别的编辑器可争 |
| `documents.claimPageSeed/releasePageSeed/releasePageSession` | 离线：claim → `true`（本地文档就是权威）；release → no-op |
| `relations.queryPageRelations/getSpaceGraph` | 云端派生数据：离线返回空结果，**不编造** |
| `templates / members / collaboration / shares / comments / tags / activity / documents history` | 云端专属，整体委托；离线按原样报错（多用户语义没有诚实的离线答案） |
| 任意读（本地模式） | 只查本地库，不发起任何请求；没有就是 `LocalFirstOfflineError`（"本地没有"） |
| 任意读（同步已开启） | 本地优先，未命中回源并回写 |
| 任意读 | 本地库不可用（`LOCAL_STORE_UNAVAILABLE`）时自动改由云端服务应答，并永久切到纯云端模式 |

写入的策略分两类：

- **本地优先（多数）**：`updatePageTitle`、`movePage`、trash/restore、favorite、pin、
  `archive/unarchiveSpace`、`toggleSpaceFavorite`、文档操作 —— 先落本地库 + outbox，UI 不等网络。
  这种情况下服务端 4xx 不会同步抛出，而是在同步时变成 outbox 里的 `failed` 条目（保留原因，
  可手动重试）。
- **云端优先（少数，因为 id/校验必须来自服务端）**：`createPage`、`createSpace`、`updateSpace`
  先请求云端；只有**网络类**失败（`isOfflineError`：`ERR_NETWORK` / 无 `response` 的 axios 错误 /
  fetch failed / timeout…）才退化成离线路径，4xx 照常抛出。

`LOCAL_STORE_UNAVAILABLE` 专指「本地数据库坏了」；「没缓存 + 没网」抛的是
`LocalFirstOfflineError`（`LOCAL_FIRST_OFFLINE`），两者不能混用 —— 前者会把服务切换到纯云端模式。

## 5. 同步引擎（`packages/core/src/domain/space-page/local-first/sync.ts`）

- **push**：用 `claimOutbox` 原子地取最旧的 `pending` 条目（取走即变 `inflight`），
  按 `id` 升序逐条重放；成功后先 `ackOutbox`，再在没有该实体其它排队项时 `markSynced`。
  - `claim` 而不是 `list` 的原因：两个同步回合（或两个窗口）拿不到同一条；推送期间到达的
    合并型编辑不会覆盖已在网线上的 payload，而是变成新条目排在后面（否则那次 ack 会把它删掉）。
  - 网络失败 → `retryOutbox([id])` 放回 `pending` 并**停止**（顺序不能被破坏）；
  - 4xx → 标记 `failed` 并记录原因，继续下一条（`retryFailed()` 会把它们放回 pending 并触发一次 flush）。
  - 重放是 **at-least-once**：崩溃点落在 ack 之前会重复推送一次（create 有 body 里的临时 id、
    toggle 类已改为不合并，其余幂等）。
- **pull**：空间列表 → 每个已知空间的页面树 → 跨空间最近页面，全部以 `dirty: false` 落库。
- **顺序**：先 push 后 pull，所以离线改动上传后会被云端版本回读，两边收敛。
- **触发**：仅在**同步已开启**时——启动、每 30s、`online` 事件、以及每次本地写入后的 800ms
  防抖 `requestFlush()`（同步关闭时这些全部短路）。
- **前置条件**：没有 access token 或 `navigator.onLine === false` 时直接跳过（同步等待登录）。
- **会话隔离**：数据库是「每台机器一份」，不是「每个账号一份」。启动时（以及跨标签页的
  上下文变更事件）会比对 JWT 的 `sub|ctx_id` 指纹（`sync_state` 的 `localFirst.session`），
  变了就 `clear()` 整个缓存与队列 —— 既不让新账号读到旧账号的空间/页面，也绝不把上个账号
  的离线改动用新账号的 token 推上去。
- **状态**：`{ phase, pending, failed, lastSyncAt, lastError, online }`，`subscribe()` 可给设置页/状态条用。

## 6. 有意为之的限制（v1）

- **文档协同仍是云端权威**：`applyPageOperations` 离线只是排队，不带服务端 rev；重放时若
  baseRev 过期会拿到 `stale` 判定，需要 `reconcile` 兜底。真正的离线协同编辑（Yjs 持久化 +
  本地合并）是后续工作。离线排队的文档操作也不会写进 `page_documents` 快照，所以离线重载
  页面会读到编辑前的文档。
- **拉取是单页且不回收**：空间 200 / 最近页面 100 / 每空间 50 个空间拉树，单个空间的页面
  上限 5000 行；本端没见过的删除（别处删掉的页面）不会被清理，只会一直留在缓存里。
- **搜索/列表是本地快照**：`queryPages`/`queryRecentPages`/`queryFavoritePages`/`searchBlocks`
  只要本地有匹配就返回本地结果，因此带 `searchValue` 的搜索可能漏掉尚未缓存的结果，
  `total` 也是本地计数。跨空间的完整搜索仍应走云端接口。
- **重放不是 exactly-once**：ack 之前崩溃会重复推送一次（见上）。
- **没有冲突 UI**：元数据是「本地 dirty 优先、云端版本让路」，跨端同时改名以先推送者为准。
- **Web 端没有本地库**：浏览器仍走纯 HTTP。要覆盖 Web 需要 sql.js/OPFS 实现同一个
  `SpacePageLocalStore`。
- **块写入**：`blocks` 目前是读缓存，块级改动仍通过页面文档的操作流走。
- **不转发远端变更事件**：`changes` 只发本端产生的事件（本地库不可用而整体降级到云端时除外）。

## 7. 测试与验证

```bash
# 主进程仓库：dirty 保护 / 墓碑 / 软硬删除 / outbox 合并与 claim / 逐行 id 换绑 / 校验（100 项）
pnpm --filter @kn/desktop check:domain        # 需要宿主 Node 版 better-sqlite3
pnpm --filter @kn/desktop rebuild:native:node # 若当前是 Electron 版二进制（会打印 SKIP）

# local-first 服务 + 同步引擎 + 本地模式/开关/降级/会话隔离（146 项，内存 store + 假云端，
# 逐条断言"有没有走网络"）
pnpm --filter @kn/core check:local-first

# 两条一起
pnpm test:local-first
```

`check:local-first` 会先用真实的 `@kn/common` 类型检查一遍这些源码（`tsc --noEmit`），再跑运行时用例；
`check:domain` 复用 `check:storage` 的 ABI 约定：二进制不匹配时打印 SKIP 并退出 0，不伪装通过。
`pnpm --filter @kn/desktop test:storage:electron` 还会走真实 preload → IPC → SQLite，
同时覆盖 `storage.*` 与 `spacepage.*`（含 claimOutbox 与墓碑/换绑的落盘结果）。

## 8. 落地时改了什么

| 文件 | 变更 |
|------|------|
| `apps/desktop/src/main/storage/schema.ts` | 追加 `version: 2` 迁移（6 张表 + 索引） |
| `apps/desktop/src/main/storage/index.ts` | `StorageRuntime` 暴露 `db`，让领域仓库共用同一连接 |
| `apps/desktop/src/main/domain/*` | 新增仓库、能力处理器、检查 |
| `apps/desktop/src/main/ipc.ts` | 注册 `setupDomainHandlers(storageRuntime)` |
| `apps/desktop/src/preload/index.ts` | 白名单加 30 个 `spacepage.*` |
| `packages/common/src/domain/space-page/local-store.ts` | 新增本地库契约 |
| `packages/common/src/domain/space-page/sync-control.ts` | 新增同步开关/状态契约（`Services.localFirst`） |
| `packages/core/src/components/LocalFirstSyncPolicyBridge.tsx` | 会员门槛（tier > 0），挂在 `EntitlementsProvider` 内 |
| `packages/core/src/components/settings/components/LocalData.tsx` | 「本地数据与同步」设置面板 |
| `packages/common/src/core/desktop-bridge.ts` | 能力/契约声明 + `DesktopBridge.spacePage` |
| `packages/core/src/desktop/space-page-bridge.ts` | 能力 → 契约的桥（信封还原成 `LocalStoreError`） |
| `packages/core/src/domain/space-page/local-first/*` | 服务、同步引擎、运行时装配、检查 |
| `packages/core/src/App.tsx` | 桌面注册 local-first 服务并启动同步；Web 不变 |
