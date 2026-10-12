# 本地存储层（Desktop / SQLite）

## 一句话

应用和插件通过 **`@kn/common` 的 `StorageService` 契约**读写本地数据；桌面端由主进程用
**SQLite** 实现（唯一写者），Web 端回退 `localStorage`，两者语义一致，由同一组测试钉住。

```
渲染进程 / 插件
  useStorage() / useStorageScope(ns) / resolveStorage()      ← @kn/common 服务
        │
        ├── Electron：desktop.storage (StorageService)
        │        └── capability 通道 storage.*  →  信封 { ok, value } | { ok, code, message }
        │                 └── 主进程 SqliteKvStore（better-sqlite3，单连接，WAL）
        │                          └── <userData>/storage/kotion.db
        │
        ├── Web：createLocalStorageService()（键前缀 kn.storage.v1.<namespace>/<key>）
        └── 兜底：createMemoryStorage()（不可持久化，info().engine === 'memory'）
```

| 层 | 位置 | 职责 |
|----|------|------|
| 契约 | `packages/common/src/storage/types.ts` | 类型、错误码、命名空间/键校验、语义约定 |
| 通用引擎 | `packages/common/src/storage/kv-engine.ts` | rev、CAS、TTL、游标、批量原子性、错误映射 |
| 渲染端实现 | `.../memory-storage.ts`、`.../local-storage.ts` | 内存 / localStorage 后端 |
| 服务装配 | `packages/core/src/storage/app-storage.ts` | 选择后端并注册为 `storage` 服务 |
| 桌面实现 | `apps/desktop/src/main/storage/` | SQLite 建库/迁移/读写 + `storage.*` 能力 |
| 桥接 | `packages/core/src/desktop/storage-bridge.ts` | 把能力信封还原成 `StorageService` |
| 旧数据迁移 | `packages/core/src/storage/legacy-local-storage.ts` | 一次性把旧 localStorage 导入 SQLite |

## 1. 契约语义（所有实现必须一致）

- **值**：可 JSON 序列化；`undefined` 表示"删除"，`bigint`/`NaN`/`Infinity` 拒绝；
  单值上限 **2 MiB**（`STORAGE_MAX_VALUE_BYTES`）—— 大文件走 `fs.*` 能力。
- **`rev`**：从 1 开始，每次成功写入 +1；`ifRev` 即比较并写入（CAS），冲突抛
  `STORAGE_REV_CONFLICT`。`ifRev: 0` = 仅当不存在时创建。
- **TTL**：`ttlMs` / `expiresAt`；过期条目在读取时"不存在"（`get` 返回 `null`、`list`/`count`
  跳过），物理回收由后端惰性处理（SQLite 在启动时 `pruneExpired()`）。过期后 `rev` 重新从 1 计。
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
> 命名空间/键/值，不信任渲染进程传来的任何东西。

## 2. 怎么用

```ts
import { useStorageScope, pluginStorageNamespace, storageKey } from '@kn/common'

// 组件里：命名空间只声明一次
const store = useStorageScope(pluginStorageNamespace('my-plugin'))
useEffect(() => {
  void store?.set(storageKey('doc', pageId), { title, updatedAt: Date.now() })
}, [store, pageId])

// 非 React 代码
import { resolveStorage } from '@kn/common'
const storage = resolveStorage()
const entry = await storage?.get<Project[]>('plugin.plugin-studio', 'projects')

// 诊断（设置页 / 反馈）
const info = await resolveStorage()?.info()
// { engine: 'sqlite', durable: true, location: '/Users/…/storage/kotion.db', schemaVersion: 1, namespaces, entries, bytes }
```

服务在**每个平台都已注册**（不是可选服务）：桌面 = SQLite，Web = localStorage，极端情况 = 内存。
判断是否真正持久化请用 `storage.durable` / `info().engine`。

## 3. 桌面实现（主进程）

- **文件**：`<userData>/storage/kotion.db`（可用 `KN_STORAGE_DB` 覆盖；工具/测试里也用得到）。
  父目录自动创建。
- **连接**：单连接（主进程唯一写者），`journal_mode=WAL`、`synchronous=NORMAL`、
  `busy_timeout=5000`；退出时 `will-quit` 关闭。
- **表结构**：`kv(namespace, key, value, rev, created_at, updated_at, expires_at)`
  `WITHOUT ROWID` + 主键 `(namespace, key)`，使"按命名空间顺序扫描"就是主键范围扫描；
  `expires_at` 用**部分索引**，没有 TTL 的数据不付代价。
- **迁移**：`apps/desktop/src/main/storage/schema.ts` 的 `MIGRATIONS` 数组，逐个事务执行，
  版本写在 `PRAGMA user_version`。只追加，不改已发布的迁移；数据库版本高于本构建时**拒绝启动**
  存储（给出"升级应用"的错误），避免误读。
- **损坏自愈**：文件不是合法数据库时，改名成 `kotion.db.corrupt-<时间戳>` 后重建，并打日志；
  启动不被卡死（本地缓存可丢，应用不可起不来）。
- **降级**：打不开数据库时应用照常启动，所有 `storage.*` 返回
  `{ ok: false, code: 'STORAGE_UNAVAILABLE' }`，渲染端回退 localStorage。
- **能力清单**：`storage.info | get | getMany | set | delete | keys | list | count | clear | batch | namespaces`
  （`apps/desktop/src/preload/index.ts` 的白名单、`packages/common/src/core/desktop-bridge.ts` 的契约、
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

- 缺少原生二进制时 **打包直接失败**（而不是产出静默降级到 localStorage 的包）。
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

`packages/core/src/storage/legacy-local-storage.ts` 在启动时（仅当后端不是 localStorage）
把旧键**导入一次**：

- 幂等：标记写在 `app.migration/legacy-local-storage`（`version` 控制重跑）；
- 不覆盖：storage 里已有该键就跳过（storage 更新）；
- 不破坏：旧 localStorage 键留在原处，消费者可以逐个切换；
- 表格：`LEGACY_STORAGE_IMPORTS`（键 → 命名空间/键 + 解析方式 + 说明）。

已导入：plugin-studio 项目列表、AI 会话索引/活动会话/迁移用 transcript、聊天模型与参数、
最近页面、tour 进度、欢迎标记、最近 emoji。

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
# 契约 + 通用引擎（内存 / localStorage 后端，114 项）
pnpm --filter @kn/common check:storage

# SQLite 存储实现（59 项：rev/CAS/TTL/游标/前缀/批量原子性/校验/损坏/迁移/自愈）
pnpm --filter @kn/desktop check:storage          # 需要宿主 Node 版二进制

# 打包布局：把 afterPack 钩子跑在假 app 包上，再从 app.asar 路径 require 那份原生模块
node apps/desktop/scripts/prepare-storage-deps.test.mjs

# 真实 preload → IPC → SQLite 端到端（17 项）；需要 Electron 版二进制
pnpm --filter @kn/desktop test:storage:electron

# 一条命令跑前三项
pnpm test:storage
```

两套检查**用例对齐**：`packages/common/src/storage/storage.check.ts` 是参照实现，
`apps/desktop/src/main/storage/sqlite-store.check.ts` 额外覆盖只有 SQL 会错的地方
（事务回滚、过期回收、schema 版本、损坏文件自愈）。改动契约时两边一起改。

> 若二进制与当前运行时 ABI 不匹配，`check:storage` 会打印 SKIP 并退出 0，并提示改用
> Electron smoke —— 它不会伪装成通过；`prepare-storage-deps.test.mjs` 里"真的加载一次"
> 那一步同样会跳过（布局检查照常执行）。

## 7. 已知后续项

- Agent SDK 的同步持久化（`AgentRunStore`/`AgentTabLock`）需要 write-behind 适配器才能落到 SQLite。
- 领域表（spaces/pages/blocks 离线缓存 + 同步队列）尚未建；`DESKTOP_ADAPTATION_PLAN.md` 里的
  表设计仍是草案，落地前要先定与云端的同步/冲突策略。
- 主题等"首帧同步读"的偏好仍留在 localStorage；若要进 SQLite，需要在渲染前预加载。
- 存储用量/清理入口（`storage.info()` 已提供数据，缺 UI）。
