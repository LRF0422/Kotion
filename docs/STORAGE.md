# 本地存储层（Desktop / SQLite）

## 一句话

应用和插件通过 **`@kn/common` 的 `StorageService` 契约**读写本地数据。桌面端只有 **SQLite**
一个持久化后端（主进程单写者）——**桌面端不存在 localStorage 后备**，数据库不可用时降级为
**会话内存**（`durable: false`）。Web 端仍用 `localStorage`。两套引擎共享同一套语义与测试。

```
渲染进程 / 插件
  usePluginStorage(pluginKey) / useStorageScope(ns) / resolveStorage()   ← @kn/common 服务
        │
        ├── Electron：desktop.storage (StorageService)
        │        ├── capability 通道 storage.*  →  信封 { ok, value } | { ok, code, message }
        │        └── 主进程 StorageManager（按 owner 路由，每库一条连接，WAL）
        │                 ├── <userData>/storage/v2/app.db               ← app.*
        │                 └── <userData>/storage/v2/plugins/<key>.db     ← plugin.<key>.*
        │                         每个文件独立 schema / user_version；
        │                         坏了或版本比本构建新 → 移到 .discard-* 后重建
        │        └── 目录都建不出来 → createResilientStorage 切会话内存，durable: false
        │                 → **绝不写 localStorage**
        │
        ├── Web：createLocalStorageService()（键前缀 kn.storage.v1.<namespace>/<key>）
        └── 桌面缺 storage 能力 / Web 无 localStorage：createMemoryStorage()
```

| 层 | 位置 | 职责 |
|----|------|------|
| 契约 | `packages/common/src/storage/types.ts` | 类型、错误码、命名空间/键校验、语义约定 |
| 通用引擎 | `packages/common/src/storage/kv-engine.ts` | rev、CAS、TTL、游标、批量原子性、错误映射 |
| 渲染端实现 | `.../memory-storage.ts`、`.../local-storage.ts` | 内存 / localStorage 后端 |
| 降级包装 | `packages/common/src/storage/resilient-storage.ts` | SQLite 不可用 → 会话内存（桌面专用） |
| 插件作用域 | `packages/common/src/storage/plugin-storage.ts` | `plugin.<pluginKey>` 绑定，插件只拿这个 |
| 服务装配 | `packages/core/src/storage/app-storage.ts` | 选择后端并注册为 `storage` 服务 |
| 桌面实现 | `apps/desktop/src/main/storage/` | SQLite 建库/迁移/读写 + `storage.*` 能力 |
| 按 owner 路由 | `apps/desktop/src/main/storage/manager.ts` | `app.*` / `plugin.<key>.*` → 各自的 DB 文件 |
| 桥接 | `packages/core/src/desktop/storage-bridge.ts` | 把能力信封还原成 `StorageService` |
| 旧数据迁移 | `packages/core/src/storage/legacy-local-storage.ts` | 一次性把旧 localStorage 导入 SQLite |

## 0. 硬规则（桌面端）

- **桌面端只有 SQLite**。`storage` 服务不会写 `localStorage`；数据目录不可用时只会降级成会话内存
  （`durable: false`），不会换一个存储介质悄悄继续。
- **一个 owner 一个库**：`app.*` 在 `app.db`，`plugin.<key>.*` 在 `plugins/<key>.db`。任何一个库
  坏了/版本不认识，只重建那一个库，不影响应用和别的插件。
- **不认识就重建**：库的 `user_version` 比本构建新、或文件不是合法 SQLite 时，旧文件移到
  `.discard-<时间戳>` 后创建新库。本地数据是缓存，**不做跨版本兼容**。
- **插件不要直接读写 `localStorage`**。要持久化就用 `usePluginStorage(pluginKey)` /
  `resolvePluginStorage(pluginKey)`；应用外壳用 `useStorageScope(appStorageNamespace(...))`。
- 需要"首帧同步读"的偏好（主题/语言）是显式例外，仍留在 localStorage，见 §7；不要把它当作
  新功能的先例。

## 1. 契约语义（所有实现必须一致）

- **值**：可 JSON 序列化；`undefined` 表示"删除"，`bigint`/`NaN`/`Infinity` 拒绝；
  单值上限 **2 MiB**（`STORAGE_MAX_VALUE_BYTES`）—— 大文件走 `fs.*` 能力。
- **`rev`**：从 1 开始，每次成功写入 +1；`ifRev` 即比较并写入（CAS），冲突抛
  `STORAGE_REV_CONFLICT`。`ifRev: 0` = 仅当不存在时创建。
- **TTL**：`ttlMs` / `expiresAt`；过期条目在读取时"不存在"（`get` 返回 `null`、`list`/`count`
  跳过），物理回收由后端惰性处理（SQLite 在打开该 owner 的库时 `pruneExpired()`）。过期后 `rev` 重新从 1 计。
- **顺序 / 分页**：`list()` 按 key 升序，`cursor` 不透明（只在同一后端内有效，不要持久化）。
- **`batch()`**：SQLite / 内存后端原子（冲突则整批回滚）；localStorage 顺序执行。
- **错误**：一律是带稳定 `code` 的 `StorageError`：
  `STORAGE_UNAVAILABLE` / `STORAGE_INVALID_NAMESPACE` / `STORAGE_INVALID_KEY` /
  `STORAGE_INVALID_VALUE` / `STORAGE_REV_CONFLICT` / `STORAGE_QUOTA_EXCEEDED` /
  `STORAGE_CORRUPT` / `STORAGE_IO`。
- **损坏数据不隐藏**：`get()` 解不出的值抛 `STORAGE_CORRUPT`；聚合类（`count`/`info`）
  在 SQLite 上仍可用（只读元数据），localStorage 后端因为要解码才能枚举，会在枚举处报错。

### 命名空间

| 归属 | 命名空间 | 规则 |
|------|----------|------|
| 应用外壳 | `app.<area>` | 例：`app.recent-pages`、`app.migration` |
| 插件 | `plugin.<pluginKey>` | 用 `pluginStorageNamespace(pluginKey)` 生成；插件**不得**越界 |

命名空间语法：点分段的字母数字/连字符（`^[a-z0-9](...)$`），≤120 字符；键为任意非空字符串
（无控制字符），≤512 字符。集合用 `storageKey('doc', id, 'body')` → `doc/<id>/body`，前缀扫描即集合查询。

> 插件是受信任的（无沙箱），所以命名空间是**约定 + 主机校验**，不是权限边界。主进程会重新校验
> 命名空间/键/值，不信任渲染进程传来的任何东西。为了少踩坑，插件侧统一用
> `usePluginStorage(pluginKey)` / `resolvePluginStorage(pluginKey)`，不要自己拼字符串或直接拿全局
> `storage`。

## 2. 怎么用

**插件（第三方/开发台）用 `usePluginStorage(pluginKey)`**：它把命名空间绑死成
`plugin.<pluginKey>`，插件拿不到别的命名空间，也不会写错前缀。

```tsx
import { usePluginStorage, storageKey } from '@kn/common'

const store = usePluginStorage(pluginKey)       // 宿主会把 pluginKey 传给插件组件
useEffect(() => {
  void store?.set('settings', { theme: 'dark' })
  // 集合：storageKey('doc', pageId) → doc/<id>
}, [store])

// 非 React 代码
const store = resolvePluginStorage(pluginKey)
await store?.set('settings', { theme: 'dark' })
```

应用外壳用自己的命名空间（`app.<area>`）：

```ts
const recent = useStorageScope(appStorageNamespace('recent-pages'))
await recent?.set('list', pages)
```

诊断（设置页 / 反馈）：

```ts
const info = await resolveStorage()?.info()
// { engine: 'sqlite', durable: true, location: '…/storage/v2', schemaVersion: 1, namespaces, entries, bytes }
// 数据库不可用时：engine === 'memory'、durable === false（会话内存，重启即丢）
```

服务在**每个平台都已注册**（不是可选服务）：桌面 = SQLite（或会话内存），Web = localStorage。
判断是否真正持久化请用 `storage.durable` / `info().engine`；**不要**把 `localStorage` 当作
桌面端的备份通道。

## 3. 桌面实现（主进程）

- **目录**：`<userData>/storage/v2`（可用 `KN_STORAGE_DIR` 覆盖；工具/测试里也用得到）。
  - `app.db` — `app.*` 命名空间；
  - `plugins/<pluginKey>.db` — `plugin.<pluginKey>.*` 命名空间，一个插件一个文件。
  - 旧版的 `<userData>/storage/kotion.db` **不再读取**（存在时启动日志会提示可删除）。
- **路由**：`StorageManager` 只接受 `app.*` 和 `plugin.<pluginKey>.*`；其它根（如 `foo.bar`）直接
  `STORAGE_INVALID_NAMESPACE`，不会落进 app 库。
- **连接**：每个已打开的库一条连接（主进程唯一写者），`journal_mode=WAL`、
  `synchronous=NORMAL`、`busy_timeout=5000`；退出时 `will-quit` 全部关闭。
- **表结构**（每个文件相同）：`kv(namespace, key, value, rev, created_at, updated_at, expires_at)`
  `WITHOUT ROWID` + 主键 `(namespace, key)`，使"按命名空间顺序扫描"就是主键范围扫描；
  `expires_at` 用**部分索引**，没有 TTL 的数据不付代价。
- **迁移**：`schema.ts` 的 `MIGRATIONS` 数组，逐个事务执行，版本写在该文件的 `PRAGMA user_version`。
  每个文件独立演进：`app.db` 与 `plugins/*.db` 不会因为别的模块加了表而互相牵连。
- **版本策略（无兼容）**：打开时 `user_version > SCHEMA_VERSION` 视为"别的构建写的库"，把
  **该文件**（连同 `-wal`/`-shm`/`-journal`）移到 `.discard-<时间戳>` 后按当前 schema 重建；损坏
  文件同理。**丢的是这个 owner 的本地数据**，通道和别的 owner 不受影响。先 `close()` 再 rename（Windows
  不能重命名打开中的文件）。
- **批量**：同一个 owner 内仍是单事务（冲突整批回滚）；跨 `app.db` / `plugins/*.db` 的 batch 直接
  `STORAGE_INVALID_VALUE`（不同文件无法一个事务），调用方需要拆成两次。
- **降级**：数据目录建不出来时应用照常启动，所有 `storage.*` 返回
  `{ ok: false, code: 'STORAGE_UNAVAILABLE' }`。渲染端 `createResilientStorage` 在第一次收到该码时
  切到**会话内存**并重试本次调用：此后 `engine === 'memory'`、`durable === false`、
  `degradedReason` 带主进程的原始错误。**桌面端不会退回 localStorage**。
  单个 owner 的库打不开（只读/磁盘满/无法移走）报 `STORAGE_IO`，只影响该 owner 的调用，不会把
  整个服务降级成内存。只有 `STORAGE_UNAVAILABLE` 会触发降级，校验失败/rev 冲突/配额错误原样抛给调用方。
- **桌面缺能力**：preload 里没有 `storage.*`（旧构建）时直接给会话内存并打 error 日志，同样不碰
  localStorage。
- **能力清单**：`storage.info | get | getMany | set | delete | keys | list | count | clear | batch | namespaces`
  （`apps/desktop/src/preload/index.ts` 的白名单、`packages/common/src/core/desktop/contract.ts` 的契约、
  `apps/desktop/src/main/storage/index.ts` 的处理器三处必须同步）。
- **错误跨进程**：Electron 会把 `ipcMain.handle` 抛出的异常压成字符串，丢 `code`，所以能力统一返回
  `{ ok: true, value } | { ok: false, code, message }` 信封；`storage-bridge.ts` 还原成 `StorageError`。

## 4. 打包（原生模块）

`electron-builder` 的 `files` 只含 `out/**` 且排除 `node_modules`，所以 SQLite 原生模块由
`scripts/afterPack.cjs` → `scripts/prepare-storage-deps.cjs` 装进产物：

```
<Resources>/node_modules/better-sqlite3/     ← lib + build/Release/better_sqlite3.node
<Resources>/node_modules/bindings/
<Resources>/node_modules/file-uri-to-path/
```

为什么放 `<Resources>/node_modules`：主进程代码在 `app.asar/out/main/`，Node 解析逐级向上找
`node_modules`，最后一级正好落在 asar **外面**的真实目录 —— 原生插件不能从 asar 里加载。
（本项目实测 `app.asar.unpacked` 的路径反推不可靠，见 `prepare-studio-deps.cjs` 的说明。）

- 缺少原生二进制时 **打包直接失败**（而不是产出本地存储只能落到会话内存的包）。
- `KN_SKIP_STORAGE_DEPS=1` 可跳过（打包仍成功，但产物本地存储不可用）。
- 平台：`darwin-arm64/x64`、`win32-x64/arm64`、`linux-x64/arm64`（musl 亦支持）。

### 原生模块的 ABI 约束（重要）

| 事实 | 后果 |
|------|------|
| `better-sqlite3@13` 要求 `node >= 22`、NAPI 10，只发预编译包 | **不能**用于 Electron 33（Node 20.18）。已锁 `^12.6.0` |
| `better-sqlite3@12` 是经典 V8 addon（按 ABI 编译） | 宿主 Node 与 Electron 需要**各自的二进制** |
| Electron 33 的 ABI 与宿主 Node 不同 | 跑 `pnpm desktop:dev` / 打包前需 `pnpm --filter @kn/desktop rebuild:native` |

```
pnpm --filter @kn/desktop rebuild:native       # 为 Electron 编译（dev / 打包前）
pnpm --filter @kn/desktop rebuild:native:node  # 还原为宿主 Node 编译（跑 node 版检查）
```

> 后续若把 Electron 升到 37+（Node 22+），可以直接用 `better-sqlite3@13` 的 N-API 预编译包，
> 两个 ABI 的问题与 `rebuild:native` 步骤都会消失。

## 5. 旧 localStorage 数据迁移

`packages/core/src/storage/legacy-local-storage.ts` 在启动时（**仅当后端是 SQLite**，
见 `shouldImportLegacyData`）把旧 **localStorage** 键**导入一次**（注意：旧版的
`storage/kotion.db` 不参与导入，storage v2 直接忽略它）：

- 幂等：标记写在 `app.migration/legacy-local-storage`（`version` 控制重跑）；
- 不覆盖：storage 里已有该键就跳过（storage 更新）；
- 不破坏：旧 localStorage 键留在原处，消费者可以逐个切换；
- 表格：`LEGACY_STORAGE_IMPORTS`（键 → 命名空间/键 + 解析方式 + 说明）。

已导入：plugin-studio 项目列表、AI 会话索引/活动会话/迁移用 transcript、聊天模型与参数、
最近页面、tour 进度、欢迎标记、最近 emoji。

> **导入 ≠ 迁移完成。** 目前只有 plugin-studio 的 `useProjects()` 真的从 storage 读；AI 会话索引、
> 模型/模式、tour、最近页面、最近 emoji 的消费方仍只读写 localStorage，SQLite 里那份是**种子**。
> 在消费方切过来之前，不要把这些键当成真源；每迁一个消费方，更新
> `LEGACY_STORAGE_IMPORTS` 里的说明（或直接删掉已经没用的条目）。

**刻意不迁移**（都写在源码注释里）：

- 登录 token（会话态，不是用户数据）；
- 主题/语言/布局键（首帧要**同步**读，异步读会闪一下错误主题）；
- `agentcore:run:*` / `agentcore:tool-results:*`（Agent SDK 的崩溃日志是**同步**接口
  `AgentRunStore`，需要 write-behind 适配才能搬，属后续改动）；
- AI 面板的会话索引缓存（同样保持同步读取；已作为"种子"导入 SQLite，供将来切换）。

### 消费者如何切换（worked example）

`packages/plugin-plugin-studio/src/studio-service.ts` 的 `useProjects()` 是范例：

1. 首帧用**旧的同步 localStorage 读**做种子，避免列表闪空；
2. `useEffect` 里读 storage，有数据就用它；
3. 写入时同时写 storage（真源）与 localStorage（兼容镜像，旧版本应用仍能读到）；
4. storage 不可用/报错时只打日志，功能不中断。

## 6. 测试与验证

```bash
# 契约 + 通用引擎（内存 / localStorage 后端，132 项）
pnpm --filter @kn/common check:storage

# SQLite 实现 + 按 owner 路由（84 项：rev/CAS/TTL/游标/前缀/批量原子性/校验/损坏/重置/隔离）
pnpm --filter @kn/desktop check:storage          # ABI 不符时自动用 Electron 的 Node 重跑

# 打包布局：把 afterPack 钩子跑在假 app 包上，再从 app.asar 路径 require 那份原生模块
node apps/desktop/scripts/prepare-storage-deps.test.mjs

# 真实 preload → IPC → 两个 SQLite 文件端到端（23 项）；需要 Electron 版二进制
pnpm --filter @kn/desktop test:storage:electron

# 一条命令跑前三项
pnpm test:storage
```

两套检查**用例对齐**：`packages/common/src/storage/storage.check.ts` 是参照实现，
`apps/desktop/src/main/storage/sqlite-store.check.ts` 额外覆盖只有 SQL 会错的地方
（事务回滚、过期回收、schema 版本、损坏文件自愈）。改动契约时两边一起改。

> 若二进制与当前运行时 ABI 不匹配（宿主 Node 跑、二进制却为 Electron 编译），`check:storage`
> 会**自动用 Electron 的 Node（`ELECTRON_RUN_AS_NODE`）重跑自身**，所以照常得到 84 项结果；
> 只有机器上找不到 Electron 二进制时才打印 SKIP。`prepare-storage-deps.test.mjs` 里"真的加载一次"
> 那一步仍会在 ABI 不匹配时跳过（布局检查照常执行）。

## 7. 已知后续项

- **桌面端已无 localStorage 后备**；应用内还有模块直接读写 localStorage（AI 会话索引、
  Agent 崩溃日志、主题/语言等首帧偏好、Studio 的项目列表兼容镜像），它们属于后续迁移项——
  storage 服务本身不再碰它。
- Agent SDK 的同步持久化（`AgentRunStore`/`AgentTabLock`）需要 write-behind 适配器才能落到 SQLite。
- 领域表（spaces/pages/blocks 离线缓存 + 同步队列）尚未进 `main`。`feat/localfirst-sqlite` 把它们
  直接加在了 `kotion.db`（v2–v4），这正是 storage v2 要避免的耦合：领域数据应该有**自己的文件**
  （如 `domain.db`）和自己的 `user_version`，而不是和 KV 共用一个版本号。合并该分支时按这个边界拆。
- 当前 policy 是"不认识就重建"：换分支/降级应用会丢该 owner 的本地数据。这是有意的取舍，但需要
  在插件里用 `storage.durable` 判断，并避免把不可重建的数据只放在本地。
- 主题等"首帧同步读"的偏好仍留在 localStorage；若要进 SQLite，需要在渲染前预加载。
- 应用级存储用量/清理入口还没有（`storage.info()` 已提供数据）；插件开发台已经有
  「数据」页签，可以查看/清空当前插件的命名空间。
- 前缀查询在 SQLite 上仍是 `LIKE`（大小写不敏感），与 Web 引擎的 `startsWith` 不一致；改用范围
  谓词是后续修复项（见评审记录）。
