# Local-first 数据层（Space / Page / Block → SQLite）

## 一句话

桌面端把 **Space / Page / Block / 页面文档** 存进主进程的 SQLite（和 KV 存储同一个
`kotion.db`）；渲染端的 `spacePageService` 先读本地、写本地并排队，再由后台同步引擎推给云端。
断网时浏览、搜索、改名、移动、收藏、新建页面照常工作，联网后自动补上。

```
渲染进程 / 插件
  useSpacePageService()  →  SpacePageService（契约不变）
        │
        ├─ 桌面且数据库可用：LocalFirstSpacePageService
        │     ├── 读：本地命中即返回；未命中 → 云端 → 回写本地
        │     ├── 写：写本地（dirty）+ 写入 outbox → 立刻返回
        │     └── 后台 SyncEngine：push outbox → pull 空间/页面树/最近页面
        │              │
        │              └── capability 通道 spacepage.*  →  信封 { ok, value } | { ok, code, message }
        │                        └── 主进程 SqliteDomainStore（与 storage.* 共用一个连接）
        │                                 └── <userData>/storage/kotion.db（表 spaces/pages/blocks/…）
        │
        └─ Web / 数据库不可用：createSpacePageService()（纯 HTTP，行为与本改造前一致）
```

**设计约束（重要）**：`SpacePageService` 端口本身一行没改。所有消费者（plugin-main、
editor、AI 工具、插件）继续按原接口调用，不需要知道这次读写落在哪一侧。

## 1. 数据表（schema v2，追加迁移）

`apps/desktop/src/main/storage/schema.ts` 的 `MIGRATIONS` 追加了 `version: 2`

| 表 | 主键 | 说明 |
|----|------|------|
| `spaces` | `id` | 空间：`name/type/archived/favorite/personal` + `data`(JSON 全量记录) |
| `pages` | `id` | 页面元数据：`space_id/parent_id/title/page_type/status/favorite/pinned/rank` + `data` |
| `blocks` | `id` | 块缓存：`page_id/space_id/parent_id/type/text` + `data` |
| `page_documents` | `page_id` | 页面文档快照：`doc`(JSON) + `rev` + `data` |
| `outbox` | `id` 自增 | 待推送的本地改动（kind/entity/entity_id/coalesce_key/payload/state/attempts） |
| `sync_state` | `key` | 同步游标等（`sync.lastPullAt` 等） |

每行都带四个本地字段（**只存在于本地，不进契约**）：

| 列 | 含义 |
|----|------|
| `updated_at` | 本地写入时间（epoch ms），行版本 |
| `remote_updated_at` | 该行来自云端的版本时间（从 `updateTime/updatedAt` 解析）；"最近页面"按它排序 |
| `dirty` | 本地改动尚未被云端接受 |
| `deleted` | 软删除墓碑（保留是为了让排队的删除还能重放） |

> `Space`/`PageMetadata` 里已经有 `updatedAt` 字段，所以本地的写入时间在契约层叫
> `localUpdatedAt`，避免和云端时间戳混淆。

## 2. 三条铁律（实现里强制，不靠调用方自觉）

1. **dirty 行不会被干净的 upsert 覆盖。** 拉取（`dirty: false`）遇到本地仍有排队改动的行时，
   只更新 `remote_updated_at`，payload 原样保留。否则后台同步会悄悄吃掉离线编辑。
   等同步引擎 `markSynced` 清掉 dirty，云端版本才重新说了算。
2. **id 换绑是原子的。** 离线创建的页面先拿 `local-page-…` 临时 id；云端返回真实 id 后，
   `remapPage` 在一个事务里改：行本身、子页面的 `parent_id`、块的 `page_id`、文档的
   `page_id`、以及 outbox 里所有**恰好等于**该 id 的字符串（子串不动，所以正文里出现同样
   字符不会被误改）。空间同理（`remapSpace`）。
3. **summary 行要先补全再当完整记录用。** 页面树/列表/最近/搜索写进 `pages` 表的是**摘要**
   （缺 `permission`、`legacyContent` 等只有完整接口才返回的字段），因此带 `partial: true`。
   `getPage()` 读到 partial 行会先回源补全（离线则退回用这行），再把结果合并回本地行；
   若这行还有排队中的本地改名，本地值优先、云端补齐其余字段。

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

## 4. 服务行为矩阵

| 能力 | 离线行为 |
|------|----------|
| `spaces.getSpace/getPersonalSpace/querySpaces` | 本地优先；个人空间用 `personal` 标记记住 |
| `pages.getPage/getPageMetadata` | 本地优先；命中 `partial`（摘要）行时先回源补全，离线退回摘要 |
| `pages.getPageTree/queryPages/queryRecentPages/queryFavoritePages/getPinnedPages` | 本地优先；树由缓存的 `parent_id` + `rank` 现场拼，落库标 `partial`；空缓存才回源 |
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

写入的判定规则：只有**网络类**失败（`isOfflineError`：`ERR_NETWORK` / 无 `response` 的
axios 错误 / fetch failed / timeout…）才会退化成离线路径；4xx 是真错误，照常抛出，不会被
outbox 吞掉。

## 5. 同步引擎（`packages/core/src/domain/space-page/local-first/sync.ts`）

- **push**：按 `id` 升序逐条重放，成功后 `ackOutbox` + `markSynced`（清 dirty）。
  - 网络失败 → 条目保持 `pending` 并**停止**（顺序不能被破坏）；
  - 4xx → 标记 `failed` 并记录原因，继续下一条（`sync.retryFailed()` / `retryFailed()` 可重试）。
- **pull**：空间列表 → 每个已知空间的页面树 → 跨空间最近页面，全部以 `dirty: false` 落库。
- **顺序**：先 push 后 pull，所以离线改动上传后会被云端版本回读，两边收敛。
- **触发**：启动、每 30s、`online` 事件、以及每次本地写入后的 800ms 防抖 `requestFlush()`。
- **前置条件**：没有 access token 或 `navigator.onLine === false` 时直接跳过（同步等待登录）。
- **状态**：`{ phase, pending, failed, lastSyncAt, lastError, online }`，`subscribe()` 可给设置页/状态条用。

## 6. 有意为之的限制（v1）

- **文档协同仍是云端权威**：`applyPageOperations` 离线只是排队，不带服务端 rev；重放时若
  baseRev 过期会拿到 `stale` 判定，需要 `reconcile` 兜底。真正的离线协同编辑（Yjs 持久化 +
  本地合并）是后续工作。
- **拉取是单页**：空间/最近页面各拉 200/100 条、每个空间最多 50 个空间拉树；超大账号需要
  分页游标（`sync_state` 已备好放游标的地方）。
- **没有冲突 UI**：元数据是"本地 dirty 优先、云端版本让路"，跨端同时改名以先推送者为准。
- **Web 端没有本地库**：浏览器仍走纯 HTTP（`@kn/common` 的 KV 存储层已有 `localStorage`
  兜底，但领域表没有）。要覆盖 Web 需要 sql.js/OPFS 实现同一个 `SpacePageLocalStore`。
- **块写入**：`blocks` 目前是读缓存，块级改动仍通过页面文档的操作流走。
- **不转发远端变更事件**：`changes` 只发本端产生的事件，保持改造前的语义。

## 7. 测试与验证

```bash
# 主进程仓库：dirty 保护 / 软硬删除 / outbox 合并 / id 换绑 / 校验 / 清理（78 项）
pnpm --filter @kn/desktop check:domain        # 需要宿主 Node 版 better-sqlite3
pnpm --filter @kn/desktop rebuild:native:node # 若当前是 Electron 版二进制（会打印 SKIP）

# local-first 服务 + 同步引擎（85 项，内存 store + 假云端，逐条断言"有没有走网络"）
pnpm --filter @kn/core check:local-first

# 两条一起
pnpm test:local-first
```

`check:domain` 复用 `check:storage` 的 ABI 约定：二进制不匹配时打印 SKIP 并退出 0，不伪装通过。

## 8. 落地时改了什么

| 文件 | 变更 |
|------|------|
| `apps/desktop/src/main/storage/schema.ts` | 追加 `version: 2` 迁移（6 张表 + 索引） |
| `apps/desktop/src/main/storage/index.ts` | `StorageRuntime` 暴露 `db`，让领域仓库共用同一连接 |
| `apps/desktop/src/main/domain/*` | 新增仓库、能力处理器、检查 |
| `apps/desktop/src/main/ipc.ts` | 注册 `setupDomainHandlers(storageRuntime)` |
| `apps/desktop/src/preload/index.ts` | 白名单加 30 个 `spacepage.*` |
| `packages/common/src/domain/space-page/local-store.ts` | 新增本地库契约 |
| `packages/common/src/core/desktop-bridge.ts` | 能力/契约声明 + `DesktopBridge.spacePage` |
| `packages/core/src/desktop/space-page-bridge.ts` | 能力 → 契约的桥（信封还原成 `LocalStoreError`） |
| `packages/core/src/domain/space-page/local-first/*` | 服务、同步引擎、运行时装配、检查 |
| `packages/core/src/App.tsx` | 桌面注册 local-first 服务并启动同步；Web 不变 |
