# Knowledge Desktop

基于 Electron 的知识管理桌面应用,支持离线优先的数据存储和云端同步。

## 特性

- **离线优先**: 匿名用户无需登录即可使用,数据保存在本地
- **三层认证**: 支持匿名用户、注册用户和会员三种身份
- **智能存储**: 根据用户身份自动选择存储模式(本地/云端/混合)
- **插件系统**: 支持安装和管理插件,会员可安装高级插件
- **数据同步**: 会员用户支持本地数据与云端同步
- **SQLite 数据库**: 使用 SQLite 存储本地数据
- **完整的 IPC 通信**: 渲染进程通过 IPC 安全地调用主进程功能

## 技术栈

- **Electron**: 跨平台桌面应用框架
- **TypeScript**: 类型安全
- **@kn/electron-adapter**: 自定义适配层,封装数据库、HTTP、认证等功能
- **better-sqlite3**: 同步 SQLite 数据库
- **axios**: HTTP 客户端
- **Vite**: 快速构建工具

## 项目结构

```
apps/desktop/
├── src/
│   ├── main/           # 主进程
│   │   ├── index.ts    # 主进程入口
│   │   ├── services.ts # 服务初始化
│   │   └── ipc.ts      # IPC 处理器
│   ├── preload/        # Preload 脚本
│   │   └── index.ts    # Context Bridge
│   ├── renderer/       # 渲染进程
│   │   └── index.ts    # 渲染进程入口
│   └── shared/         # 共享类型
│       └── types.ts
├── public/             # 静态资源
├── package.json
└── electron-vite.config.ts
```

## 开发

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm dev
```

### 构建

```bash
pnpm build
```

### 打包

```bash
# 打包所有平台
pnpm package

# Windows
pnpm package:win

# macOS
pnpm package:mac

# Linux
pnpm package:linux
```

## 存储模式

应用会根据用户身份自动选择存储模式:

### 1. 本地模式 (LOCAL)
- **适用于**: 匿名用户
- **特点**: 数据仅保存在本地,不与云端通信
- **限制**: 无法跨设备同步

### 2. 云端模式 (CLOUD)
- **适用于**: 已登录的注册用户(非会员)
- **特点**: 数据保存在云端,不缓存到本地
- **限制**: 需要网络连接才能使用

### 3. 混合模式 (HYBRID)
- **适用于**: 会员用户
- **特点**: 本地缓存 + 云端同步,支持离线使用
- **优势**: 最佳体验,既能离线使用,又能多设备同步

## API 使用

在渲染进程中,可以通过 `window.electronAPI` 调用各种功能:

```typescript
// 认证
await window.electronAPI.auth.loginAnonymous();
await window.electronAPI.auth.login({ account: 'user@example.com', password: 'password' });
const isLoggedIn = await window.electronAPI.auth.isLoggedIn();
const isMember = await window.electronAPI.auth.isMember();

// 空间管理
const spaces = await window.electronAPI.space.getAll();
const space = await window.electronAPI.space.create({
  name: 'My Space',
  description: 'A test space'
});

// 页面管理
const page = await window.electronAPI.page.create({
  spaceId: space.id,
  title: 'My Page',
  content: 'Hello World'
});

const pageTree = await window.electronAPI.page.getTree(space.id);
const recentPages = await window.electronAPI.page.getRecent(10);

// 插件管理
const plugins = await window.electronAPI.plugin.search({ keyword: 'markdown' });
await window.electronAPI.plugin.install(versionId, pluginId, version);
const installed = await window.electronAPI.plugin.getInstalled();

// 数据库管理
const stats = await window.electronAPI.database.getStats();
await window.electronAPI.database.backup('/path/to/backup.db');

// 监听事件
window.electronAPI.auth.onAuthExpired(() => {
  console.log('Auth expired, please login again');
});
```

## 数据存储位置

应用数据存储在系统默认的用户数据目录:

- **Windows**: `C:\Users\{username}\AppData\Roaming\Knowledge Desktop`
- **macOS**: `~/Library/Application Support/Knowledge Desktop`
- **Linux**: `~/.config/Knowledge Desktop`

数据包括:
- `knowledge.db` - SQLite 数据库
- `device-id` - 设备唯一标识
- `plugin-cache/` - 插件缓存目录

## 后端要求

桌面端需要后端提供以下 API:

### P0 优先级(必须实现)
- `POST /knowledge-auth/anonymous` - 匿名登录
- `GET /knowledge-wiki/plugin/{versionId}/download` - 下载插件文件
- `GET /knowledge-system/user/membership` - 获取会员信息

### P1 优先级(重要)
- 设备管理接口 (绑定/解绑设备)
- 数据同步接口 (增量同步、冲突解决)

详见 `BACKEND_INTEGRATION_GUIDE.md`

## License

MIT
