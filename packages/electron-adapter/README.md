# @kn/electron-adapter

Electron 适配层,为 Knowledge Desktop 提供本地数据存储、HTTP API 调用、认证管理、插件缓存等功能。

## 功能特性

- **HTTP Client**: 封装 axios,自动处理 token 注入、刷新和错误处理
- **认证管理**: 支持匿名登录、账号密码登录、会员系统
- **本地数据库**: 基于 SQLite 的离线优先数据存储
- **存储适配器**: 支持本地/云端/混合三种存储模式
- **插件缓存**: 插件 JS 文件的本地缓存和版本管理
- **类型安全**: 完整的 TypeScript 类型定义

## 安装

```bash
pnpm install
```

## 使用示例

```typescript
import {
  DatabaseManager,
  AuthRepository,
  AuthManager,
  HttpClient,
  AuthApi,
  SpaceApi,
  StorageAdapter,
  getApiConfig,
} from '@kn/electron-adapter';

// 1. 初始化数据库
const dbManager = new DatabaseManager('/path/to/knowledge.db');
const db = dbManager.getDatabase();

// 2. 创建 repositories
const authRepository = new AuthRepository(db);
const spaceRepository = new SpaceRepository(db);
const pageRepository = new PageRepository(db);

// 3. 初始化 HTTP client
const apiConfig = getApiConfig();
const httpClient = new HttpClient(apiConfig);

// 4. 创建 API services
const authApi = new AuthApi(httpClient);
const spaceApi = new SpaceApi(httpClient);

// 5. 创建 AuthManager
const authManager = new AuthManager(authRepository, authApi);
await authManager.initialize();

// 设置 token 处理器
httpClient.setTokenHandlers(
  () => authManager.getAccessToken(),
  (token) => {
    // Token will be automatically updated by AuthManager
  }
);

httpClient.setRefreshTokenHandler(() => authManager.refreshToken());

// 6. 创建 StorageAdapter
const storageAdapter = new StorageAdapter(
  spaceRepository,
  pageRepository,
  spaceApi,
  pageApi,
  authManager
);

// 7. 使用

// 匿名登录
await authManager.loginAsAnonymous();

// 创建空间
const space = await storageAdapter.createSpace({
  name: 'My Space',
  description: 'A test space',
});

// 创建页面
const page = await storageAdapter.createPage({
  spaceId: space.id,
  title: 'My Page',
  content: 'Hello World',
});

// 账号登录
await authManager.loginWithPassword({
  account: 'user@example.com',
  password: 'password123',
});

// 检查会员状态
if (authManager.isMember()) {
  console.log('User is a member, enabling sync...');
}
```

## API 文档

### AuthManager

认证管理器,负责用户登录、token 管理、会员状态等。

```typescript
// 匿名登录
await authManager.loginAsAnonymous();

// 账号密码登录
await authManager.loginWithPassword({
  account: 'user@example.com',
  password: 'password123',
});

// 刷新 token
await authManager.refreshToken();

// 登出
await authManager.logout();

// 获取当前用户信息
const userInfo = authManager.getUserInfo();

// 检查登录状态
const isLoggedIn = authManager.isLoggedIn();
const isAnonymous = authManager.isAnonymous();
const isMember = authManager.isMember();
```

### StorageAdapter

存储适配器,根据用户身份自动选择存储模式(本地/云端/混合)。

```typescript
// 创建空间
const space = await storageAdapter.createSpace({
  name: 'My Space',
});

// 获取空间
const space = await storageAdapter.getSpace(spaceId);

// 获取所有空间
const spaces = await storageAdapter.getAllSpaces();

// 创建页面
const page = await storageAdapter.createPage({
  spaceId: space.id,
  title: 'My Page',
  content: 'Hello World',
});

// 获取页面
const page = await storageAdapter.getPage(pageId);

// 获取页面树
const tree = await storageAdapter.getPageTree(spaceId);

// 更新页面
await storageAdapter.updatePage(pageId, {
  title: 'Updated Title',
  content: 'Updated content',
});

// 删除页面
await storageAdapter.deletePage(pageId);
```

### PluginCacheService

插件缓存服务,负责下载和缓存插件 JS 文件。

```typescript
const cacheService = new PluginCacheService('/path/to/cache', pluginApi);

// 初始化
await cacheService.initialize();

// 下载并缓存插件
const cachedInfo = await cacheService.cachePlugin(
  versionId,
  pluginId,
  version,
  (progress) => console.log(`${progress}%`)
);

// 从缓存加载插件
const filePath = await cacheService.loadPluginFromCache(pluginId, version);

// 验证缓存
const isValid = await cacheService.verifyCache(pluginId, version, expectedHash);

// 移除缓存
await cacheService.removePluginCache(pluginId, version);
```

## 存储模式

根据用户身份自动选择:

- **LOCAL**: 匿名用户 - 仅本地存储,不同步
- **CLOUD**: 已登录用户(非会员) - 仅云端存储,不缓存
- **HYBRID**: 会员用户 - 本地缓存 + 云端同步

## 开发

```bash
# 构建
pnpm build

# 监听模式
pnpm dev

# 类型检查
pnpm typecheck
```

## License

MIT
