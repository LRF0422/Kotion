# 桌面端 Electron 适配规划方案

## 一、项目概述

### 1.1 核心需求
- ✅ **免登录使用**：桌面端无需登录即可使用基础功能
- ✅ **本地数据存储**：所有数据默认保存在本地 SQLite 数据库
- ✅ **插件权限控制**：安装插件需要注册账号，高级插件需要会员
- ✅ **云端兼容性**：不影响现有云端功能
- ✅ **会员系统**：会员可享受高级插件和云端同步功能

### 1.2 技术栈
- **前端框架**: React 18 + TypeScript
- **桌面框架**: Electron (最新稳定版)
- **本地数据库**: SQLite (better-sqlite3)
- **构建工具**: Vite + electron-builder
- **IPC 通信**: electron-store + custom IPC handlers
- **自动更新**: electron-updater

---

## 二、项目架构设计

### 2.1 目录结构

```
knowledge-repo/
├── apps/
│   ├── vite/                    # 现有 Web 应用
│   └── desktop/                 # 新增 Electron 应用
│       ├── electron/           # Electron 主进程
│       │   ├── main.ts         # 主进程入口
│       │   ├── preload.ts      # 预加载脚本
│       │   ├── ipc/            # IPC 处理器
│       │   │   ├── auth.ts     # 认证相关
│       │   │   ├── storage.ts  # 存储相关
│       │   │   ├── plugin.ts   # 插件相关
│       │   │   └── sync.ts     # 同步相关
│       │   ├── database/       # 数据库管理
│       │   │   ├── index.ts    # 数据库连接
│       │   │   ├── migrations/ # 数据迁移
│       │   │   └── models/     # 数据模型
│       │   └── services/       # 服务层
│       │       ├── auth-service.ts
│       │       ├── storage-service.ts
│       │       ├── plugin-service.ts
│       │       └── sync-service.ts
│       ├── src/                # 渲染进程（复用 Web 代码）
│       ├── package.json
│       ├── electron-builder.json
│       └── vite.config.ts
│
├── packages/
│   ├── electron-adapter/       # 新增 Electron 适配层
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── auth/           # 认证适配器
│   │   │   │   ├── index.ts
│   │   │   │   ├── anonymous.ts
│   │   │   │   ├── authenticated.ts
│   │   │   │   └── membership.ts
│   │   │   ├── storage/        # 存储适配器
│   │   │   │   ├── index.ts
│   │   │   │   ├── local.ts    # 本地存储
│   │   │   │   ├── cloud.ts    # 云端存储
│   │   │   │   └── hybrid.ts   # 混合存储
│   │   │   ├── plugin/         # 插件适配器
│   │   │   │   ├── index.ts
│   │   │   │   ├── manager.ts
│   │   │   │   └── permission.ts
│   │   │   └── sync/           # 同步适配器
│   │   │       ├── index.ts
│   │   │       └── strategy.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── core/                   # 现有核心包（需修改）
│   ├── ui/                     # 现有 UI 包
│   └── ...                     # 其他现有包
│
└── docs/
    └── desktop/
        ├── ARCHITECTURE.md     # 架构文档
        ├── API.md             # API 文档
        ├── DEPLOYMENT.md      # 部署文档
        └── MEMBERSHIP.md      # 会员系统文档
```

---

## 三、核心模块设计

### 3.1 认证管理器 (Auth Manager)

#### 3.1.1 认证状态
```typescript
enum AuthState {
  ANONYMOUS = 'anonymous',      // 匿名用户（默认）
  AUTHENTICATED = 'authenticated', // 已登录用户
  MEMBER = 'member'             // 会员用户
}

interface User {
  id?: string
  username?: string
  email?: string
  authState: AuthState
  membershipExpiry?: Date
  membershipTier?: 'basic' | 'pro' | 'enterprise'
}
```

#### 3.1.2 功能设计
- **匿名模式**: 
  - 默认状态，无需注册
  - 可使用所有基础功能
  - 数据保存在本地
  - 无法安装插件
  
- **已登录模式**:
  - 需要注册账号
  - 可以安装免费插件
  - 可以备份数据到云端（手动）
  
- **会员模式**:
  - 付费会员
  - 可以安装所有插件（包括高级插件）
  - 自动云端同步
  - 多设备同步
  - 数据备份与恢复

#### 3.1.3 实现方案
```typescript
// packages/electron-adapter/src/auth/index.ts
export class AuthManager {
  private currentUser: User
  private authStateChangeCallbacks: Array<(state: AuthState) => void> = []
  
  constructor() {
    this.currentUser = this.loadUserFromLocalStorage()
  }
  
  async login(email: string, password: string): Promise<User> {
    // 1. 调用云端 API 验证
    // 2. 获取用户信息和会员状态
    // 3. 保存到本地
    // 4. 触发状态变更
  }
  
  async loginAnonymous(): Promise<User> {
    // 创建匿名用户
  }
  
  async logout(): Promise<void> {
    // 切换回匿名状态
  }
  
  async checkMembership(): Promise<boolean> {
    // 检查会员状态
  }
  
  getAuthState(): AuthState {
    return this.currentUser.authState
  }
  
  canInstallPlugins(): boolean {
    return this.currentUser.authState !== AuthState.ANONYMOUS
  }
  
  canInstallPremiumPlugins(): boolean {
    return this.currentUser.authState === AuthState.MEMBER
  }
  
  canSyncToCloud(): boolean {
    return this.currentUser.authState === AuthState.MEMBER
  }
}
```

---

### 3.2 本地数据库 (Local Database)

#### 3.2.1 数据库选型
使用 **SQLite** (better-sqlite3) 作为本地数据库，原因：
- 轻量级，无需额外服务
- 高性能，支持复杂查询
- 支持事务，数据安全
- 跨平台兼容

#### 3.2.2 数据表设计
```sql
-- 用户表
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT,
  email TEXT,
  auth_state TEXT DEFAULT 'anonymous',
  membership_tier TEXT,
  membership_expiry INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);

-- 空间表
CREATE TABLE spaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  description TEXT,
  home_page_id TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  synced_at INTEGER,
  cloud_id TEXT  -- 云端 ID（用于同步）
);

-- 页面表
CREATE TABLE pages (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  parent_id TEXT,
  title TEXT NOT NULL,
  content TEXT,
  icon TEXT,
  status TEXT DEFAULT 'ACTIVE',
  is_draft INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER,
  synced_at INTEGER,
  cloud_id TEXT,
  FOREIGN KEY (space_id) REFERENCES spaces(id)
);

-- 插件表
CREATE TABLE plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  category TEXT,
  is_premium INTEGER DEFAULT 0,
  installed_at INTEGER,
  cloud_id TEXT
);

-- 同步队列表
CREATE TABLE sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,  -- 'space', 'page', 'plugin'
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,    -- 'create', 'update', 'delete'
  data TEXT,
  retry_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at INTEGER
);

-- 收藏表
CREATE TABLE favorites (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at INTEGER
);
```

#### 3.2.3 数据迁移系统
```typescript
// apps/desktop/electron/database/migrations/index.ts
export interface Migration {
  version: number
  name: string
  up: (db: Database) => void
  down: (db: Database) => void
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      // 执行初始化 SQL
    },
    down: (db) => {
      // 回滚
    }
  },
  // ... 更多迁移
]

export class MigrationManager {
  async migrate(): Promise<void> {
    const currentVersion = this.getCurrentVersion()
    const targetVersion = migrations[migrations.length - 1].version
    
    for (let i = currentVersion; i < targetVersion; i++) {
      await this.runMigration(migrations[i])
    }
  }
}
```

---

### 3.3 存储适配器 (Storage Adapter)

#### 3.3.1 适配器接口
```typescript
// packages/electron-adapter/src/storage/index.ts
export interface IStorageAdapter {
  // 空间操作
  getSpaces(): Promise<Space[]>
  getSpace(id: string): Promise<Space>
  createSpace(data: Partial<Space>): Promise<Space>
  updateSpace(id: string, data: Partial<Space>): Promise<Space>
  deleteSpace(id: string): Promise<void>
  
  // 页面操作
  getPages(spaceId: string): Promise<Page[]>
  getPage(id: string): Promise<Page>
  createPage(data: Partial<Page>): Promise<Page>
  updatePage(id: string, data: Partial<Page>): Promise<Page>
  deletePage(id: string): Promise<void>
  
  // 同步相关
  markAsSynced(entityType: string, entityId: string): Promise<void>
  getNeedsSyncEntities(): Promise<SyncEntity[]>
}
```

#### 3.3.2 实现三种存储模式

**本地存储 (LocalStorageAdapter)**
```typescript
export class LocalStorageAdapter implements IStorageAdapter {
  private db: Database
  
  constructor() {
    this.db = new Database(this.getDbPath())
  }
  
  async createSpace(data: Partial<Space>): Promise<Space> {
    const space = {
      id: uuid(),
      ...data,
      created_at: Date.now(),
      updated_at: Date.now()
    }
    
    this.db.prepare(`
      INSERT INTO spaces (id, name, icon, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(space.id, space.name, space.icon, space.description, 
           space.created_at, space.updated_at)
    
    return space
  }
  
  // ... 其他方法
}
```

**云端存储 (CloudStorageAdapter)**
```typescript
export class CloudStorageAdapter implements IStorageAdapter {
  private apiClient: ApiClient
  
  async createSpace(data: Partial<Space>): Promise<Space> {
    const response = await this.apiClient.post('/api/spaces', data)
    return response.data
  }
  
  // ... 其他方法
}
```

**混合存储 (HybridStorageAdapter)**
```typescript
export class HybridStorageAdapter implements IStorageAdapter {
  private local: LocalStorageAdapter
  private cloud: CloudStorageAdapter
  private syncService: SyncService
  
  constructor(authManager: AuthManager) {
    this.local = new LocalStorageAdapter()
    this.cloud = new CloudStorageAdapter()
    this.syncService = new SyncService(this.local, this.cloud, authManager)
  }
  
  async createSpace(data: Partial<Space>): Promise<Space> {
    // 1. 先保存到本地
    const space = await this.local.createSpace(data)
    
    // 2. 如果是会员且开启同步，则同步到云端
    if (this.syncService.shouldSync()) {
      await this.syncService.queueSync('space', space.id, 'create', space)
    }
    
    return space
  }
  
  // ... 其他方法
}
```

---

### 3.4 插件管理系统

#### 3.4.1 插件权限控制
```typescript
// packages/electron-adapter/src/plugin/permission.ts
export enum PluginPermission {
  FREE = 'free',           // 免费插件（需登录）
  PREMIUM = 'premium'      // 高级插件（需会员）
}

export interface PluginMetadata {
  id: string
  name: string
  version: string
  permission: PluginPermission
  category: string
  author: string
  description: string
}

export class PluginPermissionChecker {
  constructor(private authManager: AuthManager) {}
  
  canInstallPlugin(plugin: PluginMetadata): boolean {
    const authState = this.authManager.getAuthState()
    
    // 匿名用户不能安装任何插件
    if (authState === AuthState.ANONYMOUS) {
      return false
    }
    
    // 已登录用户可以安装免费插件
    if (plugin.permission === PluginPermission.FREE) {
      return authState === AuthState.AUTHENTICATED || 
             authState === AuthState.MEMBER
    }
    
    // 高级插件只有会员可以安装
    if (plugin.permission === PluginPermission.PREMIUM) {
      return authState === AuthState.MEMBER
    }
    
    return false
  }
  
  getInstallationError(plugin: PluginMetadata): string | null {
    if (!this.canInstallPlugin(plugin)) {
      const authState = this.authManager.getAuthState()
      
      if (authState === AuthState.ANONYMOUS) {
        return '请先注册账号才能安装插件'
      }
      
      if (plugin.permission === PluginPermission.PREMIUM) {
        return '该插件为高级插件，需要开通会员才能安装'
      }
    }
    
    return null
  }
}
```

#### 3.4.2 插件管理器
```typescript
// packages/electron-adapter/src/plugin/manager.ts
export class ElectronPluginManager extends BasePluginManager {
  private permissionChecker: PluginPermissionChecker
  private db: Database
  
  async installPlugin(plugin: PluginMetadata): Promise<void> {
    // 1. 检查权限
    if (!this.permissionChecker.canInstallPlugin(plugin)) {
      const error = this.permissionChecker.getInstallationError(plugin)
      throw new Error(error)
    }
    
    // 2. 下载并安装插件
    await this.downloadPlugin(plugin)
    
    // 3. 保存到本地数据库
    this.db.prepare(`
      INSERT INTO plugins (id, name, version, category, is_premium, installed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(plugin.id, plugin.name, plugin.version, plugin.category,
           plugin.permission === PluginPermission.PREMIUM ? 1 : 0,
           Date.now())
    
    // 4. 加载插件
    await this.loadPlugin(plugin)
  }
  
  async uninstallPlugin(pluginId: string): Promise<void> {
    // 1. 卸载插件
    await this.unloadPlugin(pluginId)
    
    // 2. 从数据库删除
    this.db.prepare('DELETE FROM plugins WHERE id = ?').run(pluginId)
  }
  
  async getInstalledPlugins(): Promise<PluginMetadata[]> {
    return this.db.prepare('SELECT * FROM plugins').all()
  }
}
```

---

### 3.5 云端同步服务

#### 3.5.1 同步策略
```typescript
// packages/electron-adapter/src/sync/strategy.ts
export interface SyncStrategy {
  shouldSync(): boolean
  syncNow(): Promise<void>
  enableAutoSync(): void
  disableAutoSync(): void
}

export class MemberSyncStrategy implements SyncStrategy {
  private isAutoSyncEnabled: boolean = true
  private syncInterval: NodeJS.Timeout | null = null
  
  constructor(
    private authManager: AuthManager,
    private local: LocalStorageAdapter,
    private cloud: CloudStorageAdapter
  ) {
    this.startAutoSync()
  }
  
  shouldSync(): boolean {
    return this.authManager.getAuthState() === AuthState.MEMBER &&
           this.isAutoSyncEnabled
  }
  
  async syncNow(): Promise<void> {
    if (!this.shouldSync()) {
      throw new Error('同步功能仅会员可用')
    }
    
    // 1. 获取待同步数据
    const syncQueue = await this.getSyncQueue()
    
    // 2. 上传到云端
    for (const item of syncQueue) {
      await this.syncItem(item)
    }
    
    // 3. 下载云端更新
    await this.pullFromCloud()
  }
  
  private async syncItem(item: SyncQueueItem): Promise<void> {
    try {
      switch (item.operation) {
        case 'create':
          await this.cloud.create(item.entityType, item.data)
          break
        case 'update':
          await this.cloud.update(item.entityType, item.entityId, item.data)
          break
        case 'delete':
          await this.cloud.delete(item.entityType, item.entityId)
          break
      }
      
      // 标记为已同步
      await this.markAsSynced(item.id)
    } catch (error) {
      // 增加重试次数
      await this.incrementRetryCount(item.id)
    }
  }
  
  private startAutoSync(): void {
    if (this.shouldSync()) {
      this.syncInterval = setInterval(() => {
        this.syncNow().catch(console.error)
      }, 5 * 60 * 1000) // 每 5 分钟同步一次
    }
  }
  
  enableAutoSync(): void {
    this.isAutoSyncEnabled = true
    this.startAutoSync()
  }
  
  disableAutoSync(): void {
    this.isAutoSyncEnabled = false
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
  }
}
```

#### 3.5.2 冲突解决
```typescript
export enum ConflictResolution {
  USE_LOCAL = 'local',
  USE_CLOUD = 'cloud',
  MERGE = 'merge',
  ASK_USER = 'ask'
}

export class ConflictResolver {
  async resolve(
    local: any,
    cloud: any,
    strategy: ConflictResolution
  ): Promise<any> {
    switch (strategy) {
      case ConflictResolution.USE_LOCAL:
        return local
      case ConflictResolution.USE_CLOUD:
        return cloud
      case ConflictResolution.MERGE:
        return this.merge(local, cloud)
      case ConflictResolution.ASK_USER:
        return await this.askUser(local, cloud)
    }
  }
  
  private merge(local: any, cloud: any): any {
    // 基于时间戳的智能合并
    if (local.updated_at > cloud.updated_at) {
      return local
    } else {
      return cloud
    }
  }
}
```

---

### 3.6 会员系统

#### 3.6.1 会员套餐
```typescript
export interface MembershipTier {
  id: string
  name: string
  price: number
  features: string[]
  maxPlugins: number
  storageQuota: number // GB
  maxDevices: number
}

export const MEMBERSHIP_TIERS: MembershipTier[] = [
  {
    id: 'free',
    name: '免费版',
    price: 0,
    features: [
      '基础功能',
      '本地存储',
      '免费插件（需注册）'
    ],
    maxPlugins: 5,
    storageQuota: 1,
    maxDevices: 1
  },
  {
    id: 'pro',
    name: '专业版',
    price: 99,
    features: [
      '所有基础功能',
      '云端同步',
      '所有插件',
      '多设备同步',
      '优先支持'
    ],
    maxPlugins: -1, // 无限制
    storageQuota: 10,
    maxDevices: 3
  },
  {
    id: 'enterprise',
    name: '企业版',
    price: 299,
    features: [
      '所有专业版功能',
      '团队协作',
      '自定义域名',
      '专属客服',
      'API 访问'
    ],
    maxPlugins: -1,
    storageQuota: 100,
    maxDevices: -1 // 无限制
  }
]
```

#### 3.6.2 支付集成
```typescript
// apps/desktop/electron/services/payment-service.ts
export class PaymentService {
  async createOrder(tierId: string): Promise<Order> {
    const tier = MEMBERSHIP_TIERS.find(t => t.id === tierId)
    if (!tier) {
      throw new Error('Invalid tier')
    }
    
    // 调用云端 API 创建订单
    const response = await apiClient.post('/api/orders', {
      tierId: tier.id,
      price: tier.price
    })
    
    return response.data
  }
  
  async openPaymentWindow(orderId: string): Promise<void> {
    const paymentUrl = `https://your-domain.com/payment/${orderId}`
    
    // 打开支付窗口
    const paymentWindow = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    
    paymentWindow.loadURL(paymentUrl)
    
    // 监听支付完成
    paymentWindow.webContents.on('did-navigate', async (event, url) => {
      if (url.includes('/payment/success')) {
        await this.verifyPayment(orderId)
        paymentWindow.close()
      }
    })
  }
  
  async verifyPayment(orderId: string): Promise<void> {
    // 验证支付状态
    const response = await apiClient.get(`/api/orders/${orderId}/verify`)
    
    if (response.data.paid) {
      // 更新本地会员状态
      await authManager.updateMembership(response.data.membership)
    }
  }
}
```

---

### 3.7 IPC 通信层

#### 3.7.1 IPC 通道定义
```typescript
// apps/desktop/electron/ipc/channels.ts
export const IPC_CHANNELS = {
  // 认证相关
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_GET_STATE: 'auth:getState',
  AUTH_CHECK_MEMBERSHIP: 'auth:checkMembership',
  
  // 存储相关
  STORAGE_GET_SPACES: 'storage:getSpaces',
  STORAGE_CREATE_SPACE: 'storage:createSpace',
  STORAGE_UPDATE_SPACE: 'storage:updateSpace',
  STORAGE_DELETE_SPACE: 'storage:deleteSpace',
  
  // 插件相关
  PLUGIN_INSTALL: 'plugin:install',
  PLUGIN_UNINSTALL: 'plugin:uninstall',
  PLUGIN_GET_INSTALLED: 'plugin:getInstalled',
  PLUGIN_CHECK_PERMISSION: 'plugin:checkPermission',
  
  // 同步相关
  SYNC_NOW: 'sync:now',
  SYNC_ENABLE_AUTO: 'sync:enableAuto',
  SYNC_DISABLE_AUTO: 'sync:disableAuto',
  SYNC_GET_STATUS: 'sync:getStatus',
  
  // 会员相关
  MEMBERSHIP_GET_TIERS: 'membership:getTiers',
  MEMBERSHIP_CREATE_ORDER: 'membership:createOrder',
  MEMBERSHIP_OPEN_PAYMENT: 'membership:openPayment'
}
```

#### 3.7.2 IPC 处理器实现
```typescript
// apps/desktop/electron/ipc/auth.ts
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'

export function registerAuthHandlers(authManager: AuthManager) {
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (event, email, password) => {
    try {
      const user = await authManager.login(email, password)
      return { success: true, data: user }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
  
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
    await authManager.logout()
    return { success: true }
  })
  
  ipcMain.handle(IPC_CHANNELS.AUTH_GET_STATE, () => {
    return authManager.getAuthState()
  })
  
  ipcMain.handle(IPC_CHANNELS.AUTH_CHECK_MEMBERSHIP, async () => {
    return await authManager.checkMembership()
  })
}
```

#### 3.7.3 预加载脚本
```typescript
// apps/desktop/electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from './ipc/channels'

contextBridge.exposeInMainWorld('electronAPI', {
  // 认证 API
  auth: {
    login: (email: string, password: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN, email, password),
    logout: () => 
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),
    getState: () => 
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_STATE),
    checkMembership: () => 
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_CHECK_MEMBERSHIP),
    onStateChange: (callback: (state: AuthState) => void) => 
      ipcRenderer.on('auth:stateChange', (_, state) => callback(state))
  },
  
  // 存储 API
  storage: {
    getSpaces: () => 
      ipcRenderer.invoke(IPC_CHANNELS.STORAGE_GET_SPACES),
    createSpace: (data: any) => 
      ipcRenderer.invoke(IPC_CHANNELS.STORAGE_CREATE_SPACE, data),
    // ... 其他方法
  },
  
  // 插件 API
  plugin: {
    install: (plugin: PluginMetadata) => 
      ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_INSTALL, plugin),
    uninstall: (pluginId: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_UNINSTALL, pluginId),
    getInstalled: () => 
      ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_GET_INSTALLED),
    checkPermission: (plugin: PluginMetadata) => 
      ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_CHECK_PERMISSION, plugin)
  },
  
  // 同步 API
  sync: {
    now: () => 
      ipcRenderer.invoke(IPC_CHANNELS.SYNC_NOW),
    enableAuto: () => 
      ipcRenderer.invoke(IPC_CHANNELS.SYNC_ENABLE_AUTO),
    disableAuto: () => 
      ipcRenderer.invoke(IPC_CHANNELS.SYNC_DISABLE_AUTO),
    getStatus: () => 
      ipcRenderer.invoke(IPC_CHANNELS.SYNC_GET_STATUS),
    onStatusChange: (callback: (status: any) => void) => 
      ipcRenderer.on('sync:statusChange', (_, status) => callback(status))
  },
  
  // 会员 API
  membership: {
    getTiers: () => 
      ipcRenderer.invoke(IPC_CHANNELS.MEMBERSHIP_GET_TIERS),
    createOrder: (tierId: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.MEMBERSHIP_CREATE_ORDER, tierId),
    openPayment: (orderId: string) => 
      ipcRenderer.invoke(IPC_CHANNELS.MEMBERSHIP_OPEN_PAYMENT, orderId)
  }
})
```

---

## 四、前端适配方案

### 4.1 环境检测
```typescript
// packages/core/src/utils/platform.ts
export enum Platform {
  WEB = 'web',
  DESKTOP = 'desktop',
  MOBILE = 'mobile'
}

export function detectPlatform(): Platform {
  if (typeof window !== 'undefined' && 'electronAPI' in window) {
    return Platform.DESKTOP
  }
  // ... 其他平台检测
  return Platform.WEB
}

export const isDesktop = () => detectPlatform() === Platform.DESKTOP
export const isWeb = () => detectPlatform() === Platform.WEB
```

### 4.2 API 适配层
```typescript
// packages/core/src/api/adapters/desktop-adapter.ts
export class DesktopApiAdapter implements IApiAdapter {
  async getSpaces(): Promise<Space[]> {
    const result = await window.electronAPI.storage.getSpaces()
    return result.data
  }
  
  async createSpace(data: Partial<Space>): Promise<Space> {
    const result = await window.electronAPI.storage.createSpace(data)
    return result.data
  }
  
  // ... 其他方法
}

// packages/core/src/api/adapters/web-adapter.ts
export class WebApiAdapter implements IApiAdapter {
  private client: AxiosInstance
  
  async getSpaces(): Promise<Space[]> {
    const response = await this.client.get('/api/spaces')
    return response.data
  }
  
  async createSpace(data: Partial<Space>): Promise<Space> {
    const response = await this.client.post('/api/spaces', data)
    return response.data
  }
  
  // ... 其他方法
}

// packages/core/src/api/index.ts
export function createApiAdapter(): IApiAdapter {
  if (isDesktop()) {
    return new DesktopApiAdapter()
  } else {
    return new WebApiAdapter()
  }
}
```

### 4.3 修改现有组件
```typescript
// packages/core/src/hooks/use-api.ts
import { createApiAdapter } from '../api'

const apiAdapter = createApiAdapter()

export function useApi() {
  return {
    spaces: {
      getAll: () => apiAdapter.getSpaces(),
      create: (data) => apiAdapter.createSpace(data),
      // ...
    },
    // ... 其他 API
  }
}
```

---

## 五、会员功能 UI

### 5.1 会员状态显示
```typescript
// packages/core/src/components/MembershipBadge.tsx
export const MembershipBadge: React.FC = () => {
  const { authState, membershipTier } = useAuth()
  
  if (authState === AuthState.ANONYMOUS) {
    return (
      <Button size="sm" onClick={handleLogin}>
        登录
      </Button>
    )
  }
  
  if (authState === AuthState.AUTHENTICATED) {
    return (
      <Button size="sm" onClick={handleUpgrade}>
        升级会员
      </Button>
    )
  }
  
  return (
    <Badge variant="primary">
      {membershipTier === 'pro' ? '专业版' : '企业版'}会员
    </Badge>
  )
}
```

### 5.2 插件安装提示
```typescript
// packages/core/src/components/PluginInstallButton.tsx
export const PluginInstallButton: React.FC<{ plugin: PluginMetadata }> = ({ plugin }) => {
  const { canInstall, error } = usePluginPermission(plugin)
  
  if (!canInstall) {
    return (
      <Tooltip content={error}>
        <Button disabled>
          {plugin.permission === PluginPermission.PREMIUM && '会员专享'}
          {plugin.permission === PluginPermission.FREE && '需要登录'}
        </Button>
      </Tooltip>
    )
  }
  
  return (
    <Button onClick={() => handleInstall(plugin)}>
      安装
    </Button>
  )
}
```

### 5.3 同步状态指示器
```typescript
// packages/core/src/components/SyncIndicator.tsx
export const SyncIndicator: React.FC = () => {
  const { syncStatus, lastSyncTime } = useSync()
  
  if (!canSync()) {
    return null
  }
  
  return (
    <div className="flex items-center gap-2">
      {syncStatus === 'syncing' && <Loader className="animate-spin" />}
      {syncStatus === 'success' && <Check className="text-green-500" />}
      {syncStatus === 'error' && <AlertCircle className="text-red-500" />}
      <span className="text-xs text-muted-foreground">
        {lastSyncTime && `最后同步: ${formatTime(lastSyncTime)}`}
      </span>
      <Button size="sm" onClick={handleSyncNow}>
        立即同步
      </Button>
    </div>
  )
}
```

---

## 六、构建和打包

### 6.1 Electron Builder 配置
```json
// apps/desktop/electron-builder.json
{
  "appId": "com.kotion.desktop",
  "productName": "Kotion",
  "directories": {
    "output": "dist",
    "buildResources": "build"
  },
  "files": [
    "dist-electron/**/*",
    "dist/**/*",
    "package.json"
  ],
  "mac": {
    "target": ["dmg", "zip"],
    "icon": "build/icon.icns",
    "category": "public.app-category.productivity",
    "hardenedRuntime": true,
    "gatekeeperAssess": false,
    "entitlements": "build/entitlements.mac.plist",
    "entitlementsInherit": "build/entitlements.mac.plist"
  },
  "win": {
    "target": ["nsis", "portable"],
    "icon": "build/icon.ico"
  },
  "linux": {
    "target": ["AppImage", "deb", "rpm"],
    "icon": "build/icon.png",
    "category": "Office"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true
  },
  "publish": {
    "provider": "github",
    "owner": "your-org",
    "repo": "knowledge-repo"
  }
}
```

### 6.2 自动更新配置
```typescript
// apps/desktop/electron/main.ts
import { autoUpdater } from 'electron-updater'

autoUpdater.checkForUpdatesAndNotify()

autoUpdater.on('update-available', (info) => {
  // 通知用户有新版本
  mainWindow.webContents.send('update-available', info)
})

autoUpdater.on('update-downloaded', (info) => {
  // 提示用户重启应用
  mainWindow.webContents.send('update-downloaded', info)
})
```

---

## 七、开发流程

### 7.1 开发脚本
```json
// package.json
{
  "scripts": {
    "desktop:dev": "pnpm --filter @kn/desktop dev",
    "desktop:build": "pnpm --filter @kn/desktop build",
    "desktop:package": "pnpm --filter @kn/desktop package",
    "desktop:package:win": "pnpm --filter @kn/desktop package:win",
    "desktop:package:mac": "pnpm --filter @kn/desktop package:mac",
    "desktop:package:linux": "pnpm --filter @kn/desktop package:linux"
  }
}
```

### 7.2 CI/CD 配置
```yaml
# .github/workflows/desktop-release.yml
name: Desktop Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '22'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Build desktop app
        run: pnpm desktop:build
      
      - name: Package desktop app
        run: pnpm desktop:package
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: desktop-${{ matrix.os }}
          path: apps/desktop/dist/*
```

---

## 八、实施计划

### 阶段一：基础架构（2-3 周）
- [x] 创建 `apps/desktop` 目录和基础配置
- [x] 创建 `packages/electron-adapter` 适配层包
- [x] 实现本地 SQLite 数据库和迁移系统
- [x] 实现 IPC 通信层和预加载脚本

### 阶段二：核心功能（3-4 周）
- [x] 实现认证管理器（匿名/登录/会员）
- [x] 实现存储适配器（本地/云端/混合）
- [x] 实现插件管理系统（权限控制）
- [x] 修改现有组件使用适配层 API

### 阶段三：会员系统（2-3 周）
- [x] 实现会员套餐和支付集成
- [x] 实现云端同步服务（仅会员）
- [x] 添加会员功能 UI（升级提示、同步状态等）

### 阶段四：测试和优化（2 周）
- [x] 编写桌面端特定测试
- [x] 性能优化和内存管理
- [x] 配置 Electron 打包和自动更新
- [x] 编写用户文档

### 阶段五：发布（1 周）
- [x] 配置 CI/CD 流程
- [x] 测试多平台安装包
- [x] 发布第一个稳定版本

---

## 九、注意事项

### 9.1 安全性
- 使用 `contextIsolation` 隔离主进程和渲染进程
- 所有敏感操作通过 IPC 在主进程执行
- 加密本地数据库敏感字段
- 实现会话超时和自动登出

### 9.2 性能优化
- 使用 SQLite 的 WAL 模式提升并发性能
- 实现分页加载和虚拟滚动
- 使用 Web Worker 处理大型数据
- 优化同步策略，避免频繁网络请求

### 9.3 兼容性
- 保持现有 Web 应用功能完整
- 确保数据格式兼容云端 API
- 提供数据导入导出功能
- 支持离线使用

### 9.4 用户体验
- 首次启动引导流程
- 清晰的权限提示
- 流畅的同步动画
- 友好的错误提示

---

## 十、预期效果

### 10.1 用户权益
- **匿名用户**: 无需注册即可体验完整功能（除插件外）
- **注册用户**: 可安装免费插件，手动备份数据
- **会员用户**: 享受所有插件 + 自动云端同步 + 多设备同步

### 10.2 商业模式
- 免费版吸引用户，降低使用门槛
- 插件生态驱动用户注册
- 高级插件和同步功能转化会员
- 可持续的订阅收入

### 10.3 技术优势
- 本地优先，响应速度快
- 离线可用，不依赖网络
- 数据安全，用户可控
- 渐进式增强，体验流畅

---

**规划完成时间**: 预计 10-13 周完成整个桌面端适配

**技术难点**:
1. 本地数据库和云端同步的冲突解决
2. 插件权限的细粒度控制
3. 会员系统和支付集成的安全性
4. 多平台打包和自动更新

**下一步**: 开始创建 `apps/desktop` 和 `packages/electron-adapter` 的基础结构。
