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

### macOS 签名与“已损坏，无法打开”

**症状**：把打包好的 dmg 通过浏览器（Chrome/Edge 等）下载后安装，双击提示

> “KN Desktop” is damaged and can't be opened. You should move it to the Bin.

**原因**：这不是安装包本身坏了，而是 macOS Gatekeeper 拒绝未签名/签名无效的 App：

1. 未配置 Developer ID 时 electron-builder 会**跳过整个签名步骤**，产物只剩链接器写入的
   ad-hoc 签名（`Info.plist=not bound`、`Sealed Resources=none`），`app.asar` 与 `Info.plist`
   没有被封印，`codesign --verify --deep --strict` 直接报
   `code has no resources but signature indicates they must be present` —— 这就是“已损坏”。
2. 浏览器下载会给文件打上 `com.apple.quarantine` 隔离属性，触发 Gatekeeper 评估，
   于是弹出上面的对话框（终端里 `open` 或从本地目录复制则不会有该属性）。

**本仓库的处理**：`scripts/afterPack.cjs` 会在打包后自动做一次 ad-hoc 重新签名，使签名覆盖
`Info.plist` 与 `Resources`，保证产物是可校验的（默认开启，`KN_ADHOC_SIGN=false` 可关闭；
检测到 `CSC_LINK`/`CSC_NAME` 等正式签名凭证时自动跳过）。

**拿到包的人如何打开**（ad-hoc 签名无法通过公证，仍需手动放行一次）：

```bash
# 方案 A：移除隔离属性（推荐，一次即可）
xattr -dr com.apple.quarantine "/Applications/KN Desktop.app"

# 方案 B：重新做一次 ad-hoc 签名（签名被破坏时使用）
codesign --force --deep --sign - "/Applications/KN Desktop.app"

# 方案 C：图形界面放行
# 先尝试打开一次 → 系统设置 → 隐私与安全性 → 仍要打开
```

自查命令：

```bash
codesign -dv --verbose=4 "/Applications/KN Desktop.app"   # 期望 Identifier=com.kn.desktop、Sealed Resources version=2
codesign --verify --deep --strict "/Applications/KN Desktop.app"  # 期望无输出、退出码 0
spctl -a -vvv "/Applications/KN Desktop.app"              # ad-hoc 包会显示 rejected，属预期
```

**对外正式分发**（要做到双击即开、无任何警告）：需要 Apple Developer Program 账号
（$99/年），用 Developer ID Application 证书签名并公证：

```bash
# 1) 证书：导出 .p12 后通过环境变量提供（CI 上同样如此）
export CSC_LINK=/path/to/developer-id-application.p12
export CSC_KEY_PASSWORD='<p12 password>'

# 2) 公证凭证（二选一）
#    a. Apple ID + App 专用密码
export APPLE_ID='you@example.com'
export APPLE_APP_SPECIFIC_PASSWORD='<app-specific password>'
export APPLE_TEAM_ID='<team id>'
#    b. 或 App Store Connect API Key
# export APPLE_API_KEY='/path/to/AuthKey_XXXX.p8'
# export APPLE_API_KEY_ID='XXXXXXXXXX'
# export APPLE_API_ISSUER='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'

pnpm package:mac
```

electron-builder 默认已开启 `hardenedRuntime`，并在检测到上述变量后自动完成签名 + 公证；
如需在钩子里自行公证，可使用 `afterSign` + `@electron/notarize`。
未公证的包在 macOS 15+ 上右键“打开”已不再能绕过 Gatekeeper，只能走系统设置的“仍要打开”。

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
