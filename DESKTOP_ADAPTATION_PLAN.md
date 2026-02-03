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

#### 3.4.1 插件文件缓存管理

**插件存储结构**:
```
用户数据目录/
├── plugins/                    # 插件缓存目录
│   ├── plugin-ai@1.0.0/       # 插件目录（按名称和版本）
│   │   ├── index.js           # 插件主文件
│   │   ├── package.json       # 插件元数据
│   │   ├── assets/            # 静态资源
│   │   └── manifest.json      # 插件清单
│   ├── plugin-excalidraw@2.1.0/
│   └── .cache/                # 下载缓存
├── database.db                # SQLite 数据库
└── config.json                # 配置文件
```

**插件缓存管理器**:
```typescript
// apps/desktop/electron/services/plugin-cache-service.ts
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs-extra'
import axios from 'axios'
import { createHash } from 'crypto'

export interface PluginFile {
  id: string
  name: string
  version: string
  url: string              // 云端下载地址
  hash: string             // 文件哈希（用于校验）
  size: number             // 文件大小
  entryPoint: string       // 入口文件（通常是 index.js）
}

export class PluginCacheService {
  private pluginsDir: string
  private cacheDir: string
  
  constructor() {
    const userDataPath = app.getPath('userData')
    this.pluginsDir = path.join(userDataPath, 'plugins')
    this.cacheDir = path.join(this.pluginsDir, '.cache')
    
    // 确保目录存在
    fs.ensureDirSync(this.pluginsDir)
    fs.ensureDirSync(this.cacheDir)
  }
  
  /**
   * 获取插件目录路径
   */
  getPluginDir(pluginId: string, version: string): string {
    return path.join(this.pluginsDir, `${pluginId}@${version}`)
  }
  
  /**
   * 检查插件是否已缓存
   */
  async isPluginCached(pluginId: string, version: string): Promise<boolean> {
    const pluginDir = this.getPluginDir(pluginId, version)
    return await fs.pathExists(pluginDir)
  }
  
  /**
   * 下载并缓存插件文件
   */
  async downloadPlugin(plugin: PluginFile, onProgress?: (progress: number) => void): Promise<string> {
    const pluginDir = this.getPluginDir(plugin.id, plugin.version)
    const tempFile = path.join(this.cacheDir, `${plugin.id}-${Date.now()}.tmp`)
    
    try {
      // 1. 检查是否已缓存
      if (await this.isPluginCached(plugin.id, plugin.version)) {
        console.log(`Plugin ${plugin.id}@${plugin.version} already cached`)
        return pluginDir
      }
      
      // 2. 下载文件到临时目录
      console.log(`Downloading plugin from ${plugin.url}`)
      const response = await axios({
        method: 'GET',
        url: plugin.url,
        responseType: 'stream',
        onDownloadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const progress = (progressEvent.loaded / progressEvent.total) * 100
            onProgress(progress)
          }
        }
      })
      
      // 3. 保存到临时文件
      const writer = fs.createWriteStream(tempFile)
      response.data.pipe(writer)
      
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve)
        writer.on('error', reject)
      })
      
      // 4. 校验文件哈希
      const fileHash = await this.calculateFileHash(tempFile)
      if (fileHash !== plugin.hash) {
        throw new Error('Plugin file hash mismatch - file may be corrupted')
      }
      
      // 5. 解压或复制到插件目录
      await fs.ensureDir(pluginDir)
      
      // 如果是 .zip 文件，解压
      if (plugin.url.endsWith('.zip')) {
        await this.extractZip(tempFile, pluginDir)
      } else if (plugin.url.endsWith('.js')) {
        // 如果是单个 JS 文件，直接复制
        await fs.copy(tempFile, path.join(pluginDir, 'index.js'))
      } else {
        throw new Error('Unsupported plugin format')
      }
      
      // 6. 写入元数据
      await this.writePluginMetadata(pluginDir, plugin)
      
      // 7. 清理临时文件
      await fs.remove(tempFile)
      
      console.log(`Plugin ${plugin.id}@${plugin.version} cached successfully`)
      return pluginDir
      
    } catch (error) {
      // 清理失败的下载
      await fs.remove(tempFile).catch(() => {})
      await fs.remove(pluginDir).catch(() => {})
      throw error
    }
  }
  
  /**
   * 加载本地缓存的插件
   */
  async loadPluginFromCache(pluginId: string, version: string): Promise<string> {
    const pluginDir = this.getPluginDir(pluginId, version)
    
    if (!await fs.pathExists(pluginDir)) {
      throw new Error(`Plugin ${pluginId}@${version} not found in cache`)
    }
    
    // 读取插件清单获取入口文件
    const manifestPath = path.join(pluginDir, 'manifest.json')
    const manifest = await fs.readJSON(manifestPath)
    const entryPoint = path.join(pluginDir, manifest.entryPoint || 'index.js')
    
    if (!await fs.pathExists(entryPoint)) {
      throw new Error(`Plugin entry point not found: ${entryPoint}`)
    }
    
    return entryPoint
  }
  
  /**
   * 删除缓存的插件
   */
  async removePluginCache(pluginId: string, version: string): Promise<void> {
    const pluginDir = this.getPluginDir(pluginId, version)
    await fs.remove(pluginDir)
    console.log(`Plugin cache removed: ${pluginId}@${version}`)
  }
  
  /**
   * 清理所有缓存
   */
  async clearAllCache(): Promise<void> {
    const items = await fs.readdir(this.pluginsDir)
    for (const item of items) {
      const itemPath = path.join(this.pluginsDir, item)
      await fs.remove(itemPath)
    }
    console.log('All plugin caches cleared')
  }
  
  /**
   * 获取缓存统计信息
   */
  async getCacheStats(): Promise<{
    totalSize: number
    pluginCount: number
    plugins: Array<{ id: string; version: string; size: number }>
  }> {
    const items = await fs.readdir(this.pluginsDir)
    const plugins: Array<{ id: string; version: string; size: number }> = []
    let totalSize = 0
    
    for (const item of items) {
      if (item === '.cache') continue
      
      const itemPath = path.join(this.pluginsDir, item)
      const stat = await fs.stat(itemPath)
      
      if (stat.isDirectory()) {
        const [id, version] = item.split('@')
        const size = await this.getDirectorySize(itemPath)
        plugins.push({ id, version, size })
        totalSize += size
      }
    }
    
    return {
      totalSize,
      pluginCount: plugins.length,
      plugins
    }
  }
  
  /**
   * 计算文件哈希
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256')
      const stream = fs.createReadStream(filePath)
      
      stream.on('data', (data) => hash.update(data))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }
  
  /**
   * 解压 ZIP 文件
   */
  private async extractZip(zipPath: string, destPath: string): Promise<void> {
    const AdmZip = require('adm-zip')
    const zip = new AdmZip(zipPath)
    zip.extractAllTo(destPath, true)
  }
  
  /**
   * 写入插件元数据
   */
  private async writePluginMetadata(pluginDir: string, plugin: PluginFile): Promise<void> {
    const manifest = {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      entryPoint: plugin.entryPoint,
      installedAt: Date.now(),
      hash: plugin.hash
    }
    
    const manifestPath = path.join(pluginDir, 'manifest.json')
    await fs.writeJSON(manifestPath, manifest, { spaces: 2 })
  }
  
  /**
   * 计算目录大小
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    let size = 0
    const items = await fs.readdir(dirPath)
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item)
      const stat = await fs.stat(itemPath)
      
      if (stat.isDirectory()) {
        size += await this.getDirectorySize(itemPath)
      } else {
        size += stat.size
      }
    }
    
    return size
  }
}
```

#### 3.4.2 插件权限控制
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

#### 3.4.3 插件管理器增强版
```typescript
// packages/electron-adapter/src/plugin/manager.ts
export class ElectronPluginManager extends BasePluginManager {
  private permissionChecker: PluginPermissionChecker
  private cacheService: PluginCacheService
  private db: Database
  private loadedPlugins: Map<string, any> = new Map()
  
  constructor(
    authManager: AuthManager,
    cacheService: PluginCacheService,
    db: Database
  ) {
    super()
    this.permissionChecker = new PluginPermissionChecker(authManager)
    this.cacheService = cacheService
    this.db = db
  }
  
  /**
   * 安装插件（下载 + 缓存 + 加载）
   */
  async installPlugin(plugin: PluginFile): Promise<void> {
    // 1. 检查权限
    if (!this.permissionChecker.canInstallPlugin(plugin)) {
      const error = this.permissionChecker.getInstallationError(plugin)
      throw new Error(error)
    }
    
    // 2. 检查是否已安装
    const installed = this.db.prepare(
      'SELECT * FROM plugins WHERE id = ? AND version = ?'
    ).get(plugin.id, plugin.version)
    
    if (installed) {
      throw new Error(`Plugin ${plugin.name} v${plugin.version} is already installed`)
    }
    
    try {
      // 3. 下载并缓存插件文件
      console.log(`Installing plugin: ${plugin.name} v${plugin.version}`)
      const pluginDir = await this.cacheService.downloadPlugin(plugin, (progress) => {
        // 通知渲染进程下载进度
        this.emit('plugin:download:progress', {
          pluginId: plugin.id,
          progress
        })
      })
      
      // 4. 保存到数据库
      this.db.prepare(`
        INSERT INTO plugins (id, name, version, category, is_premium, installed_at, cloud_id, file_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        plugin.id,
        plugin.name,
        plugin.version,
        plugin.category,
        plugin.permission === PluginPermission.PREMIUM ? 1 : 0,
        Date.now(),
        plugin.cloudId,
        pluginDir
      )
      
      // 5. 加载插件到内存
      await this.loadPlugin(plugin.id, plugin.version)
      
      console.log(`Plugin installed successfully: ${plugin.name}`)
      this.emit('plugin:installed', plugin)
      
    } catch (error) {
      console.error(`Failed to install plugin ${plugin.name}:`, error)
      // 清理失败的安装
      await this.cacheService.removePluginCache(plugin.id, plugin.version).catch(() => {})
      throw error
    }
  }
  
  /**
   * 从缓存加载插件
   */
  async loadPlugin(pluginId: string, version: string): Promise<void> {
    const key = `${pluginId}@${version}`
    
    // 避免重复加载
    if (this.loadedPlugins.has(key)) {
      console.log(`Plugin ${key} already loaded`)
      return
    }
    
    try {
      // 1. 从缓存获取插件入口文件
      const entryPoint = await this.cacheService.loadPluginFromCache(pluginId, version)
      
      // 2. 动态加载 JS 文件
      // 注意：在 Electron 中，需要使用特殊的方式加载插件
      const pluginModule = await this.loadPluginModule(entryPoint)
      
      // 3. 初始化插件
      if (pluginModule.activate) {
        await pluginModule.activate(this.getPluginContext())
      }
      
      // 4. 保存到内存
      this.loadedPlugins.set(key, pluginModule)
      
      console.log(`Plugin loaded: ${key}`)
      this.emit('plugin:loaded', { pluginId, version })
      
    } catch (error) {
      console.error(`Failed to load plugin ${key}:`, error)
      throw error
    }
  }
  
  /**
   * 卸载插件
   */
  async uninstallPlugin(pluginId: string, version: string): Promise<void> {
    const key = `${pluginId}@${version}`
    
    try {
      // 1. 卸载插件（调用 deactivate）
      const pluginModule = this.loadedPlugins.get(key)
      if (pluginModule && pluginModule.deactivate) {
        await pluginModule.deactivate()
      }
      
      // 2. 从内存中移除
      this.loadedPlugins.delete(key)
      
      // 3. 从数据库删除
      this.db.prepare(
        'DELETE FROM plugins WHERE id = ? AND version = ?'
      ).run(pluginId, version)
      
      // 4. 删除缓存文件
      await this.cacheService.removePluginCache(pluginId, version)
      
      console.log(`Plugin uninstalled: ${key}`)
      this.emit('plugin:uninstalled', { pluginId, version })
      
    } catch (error) {
      console.error(`Failed to uninstall plugin ${key}:`, error)
      throw error
    }
  }
  
  /**
   * 更新插件
   */
  async updatePlugin(pluginId: string, newVersion: string, plugin: PluginFile): Promise<void> {
    // 1. 获取当前版本
    const current = this.db.prepare(
      'SELECT version FROM plugins WHERE id = ? ORDER BY installed_at DESC LIMIT 1'
    ).get(pluginId)
    
    if (!current) {
      throw new Error(`Plugin ${pluginId} is not installed`)
    }
    
    // 2. 卸载旧版本
    await this.uninstallPlugin(pluginId, current.version)
    
    // 3. 安装新版本
    await this.installPlugin(plugin)
    
    console.log(`Plugin updated: ${pluginId} from ${current.version} to ${newVersion}`)
  }
  
  /**
   * 获取已安装的插件列表
   */
  async getInstalledPlugins(): Promise<PluginMetadata[]> {
    return this.db.prepare('SELECT * FROM plugins ORDER BY installed_at DESC').all()
  }
  
  /**
   * 重新加载所有已安装的插件
   */
  async reloadAllPlugins(): Promise<void> {
    const plugins = await this.getInstalledPlugins()
    
    for (const plugin of plugins) {
      try {
        await this.loadPlugin(plugin.id, plugin.version)
      } catch (error) {
        console.error(`Failed to reload plugin ${plugin.id}@${plugin.version}:`, error)
      }
    }
  }
  
  /**
   * 动态加载插件模块
   */
  private async loadPluginModule(entryPoint: string): Promise<any> {
    // 方案 1: 使用 VM 模块（隔离环境）
    const vm = require('vm')
    const fs = require('fs-extra')
    
    const code = await fs.readFile(entryPoint, 'utf-8')
    const context = this.createPluginContext()
    
    // 创建隔离的执行环境
    vm.createContext(context)
    
    // 执行插件代码
    const script = new vm.Script(code, {
      filename: entryPoint
    })
    
    script.runInContext(context)
    
    return context.module.exports
    
    // 方案 2: 直接 require（简单但安全性较低）
    // delete require.cache[entryPoint]
    // return require(entryPoint)
  }
  
  /**
   * 创建插件执行上下文
   */
  private createPluginContext(): any {
    return {
      console,
      require: (moduleName: string) => {
        // 白名单模块
        const allowedModules = ['path', 'fs', 'crypto']
        if (allowedModules.includes(moduleName)) {
          return require(moduleName)
        }
        throw new Error(`Module ${moduleName} is not allowed`)
      },
      module: { exports: {} },
      exports: {}
    }
  }
  
  /**
   * 获取插件上下文（传递给插件的 API）
   */
  private getPluginContext(): any {
    return {
      // 提供给插件的 API
      getEditor: () => this.editor,
      registerCommand: (command: any) => this.registerCommand(command),
      registerView: (view: any) => this.registerView(view),
      // ... 其他插件 API
    }
  }
}
```

#### 3.4.4 插件数据表更新
```sql
-- 插件表（增加文件路径字段）
CREATE TABLE plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  category TEXT,
  is_premium INTEGER DEFAULT 0,
  installed_at INTEGER,
  cloud_id TEXT,
  file_path TEXT NOT NULL,  -- 缓存文件路径
  file_hash TEXT,           -- 文件哈希
  file_size INTEGER,        -- 文件大小
  UNIQUE(id, version)
);

-- 插件下载历史表
CREATE TABLE plugin_downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id TEXT NOT NULL,
  version TEXT NOT NULL,
  download_url TEXT NOT NULL,
  downloaded_at INTEGER,
  file_path TEXT,
  status TEXT DEFAULT 'pending',  -- pending, downloading, completed, failed
  error TEXT
);
```

#### 3.4.5 IPC 通道增强
```typescript
// apps/desktop/electron/ipc/plugin.ts
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'

export function registerPluginHandlers(
  pluginManager: ElectronPluginManager,
  cacheService: PluginCacheService
) {
  // 安装插件
  ipcMain.handle(IPC_CHANNELS.PLUGIN_INSTALL, async (event, plugin: PluginFile) => {
    try {
      await pluginManager.installPlugin(plugin)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
  
  // 卸载插件
  ipcMain.handle(IPC_CHANNELS.PLUGIN_UNINSTALL, async (event, pluginId, version) => {
    try {
      await pluginManager.uninstallPlugin(pluginId, version)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
  
  // 更新插件
  ipcMain.handle(IPC_CHANNELS.PLUGIN_UPDATE, async (event, pluginId, newVersion, plugin) => {
    try {
      await pluginManager.updatePlugin(pluginId, newVersion, plugin)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
  
  // 获取已安装插件
  ipcMain.handle(IPC_CHANNELS.PLUGIN_GET_INSTALLED, async () => {
    const plugins = await pluginManager.getInstalledPlugins()
    return { success: true, data: plugins }
  })
  
  // 获取缓存统计
  ipcMain.handle(IPC_CHANNELS.PLUGIN_GET_CACHE_STATS, async () => {
    const stats = await cacheService.getCacheStats()
    return { success: true, data: stats }
  })
  
  // 清理缓存
  ipcMain.handle(IPC_CHANNELS.PLUGIN_CLEAR_CACHE, async () => {
    try {
      await cacheService.clearAllCache()
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
  
  // 监听下载进度
  pluginManager.on('plugin:download:progress', (data) => {
    event.sender.send('plugin:download:progress', data)
  })
}
```

#### 3.4.6 前端插件下载 UI
```typescript
// packages/core/src/components/PluginDownloadProgress.tsx
export const PluginDownloadProgress: React.FC<{ plugin: PluginMetadata }> = ({ plugin }) => {
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<'idle' | 'downloading' | 'installing' | 'completed'>('idle')
  
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.plugin.onDownloadProgress((data: any) => {
        if (data.pluginId === plugin.id) {
          setProgress(data.progress)
          setStatus('downloading')
        }
      })
    }
  }, [plugin.id])
  
  const handleInstall = async () => {
    try {
      setStatus('downloading')
      await window.electronAPI.plugin.install(plugin)
      setStatus('completed')
    } catch (error) {
      console.error('Failed to install plugin:', error)
      setStatus('idle')
    }
  }
  
  return (
    <div className="space-y-2">
      {status === 'idle' && (
        <Button onClick={handleInstall}>
          <Download className="h-4 w-4 mr-2" />
          安装插件
        </Button>
      )}
      
      {status === 'downloading' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Loader className="h-4 w-4 animate-spin" />
            <span className="text-sm">下载中... {progress.toFixed(0)}%</span>
          </div>
          <Progress value={progress} />
        </div>
      )}
      
      {status === 'installing' && (
        <div className="flex items-center gap-2">
          <Loader className="h-4 w-4 animate-spin" />
          <span className="text-sm">正在安装...</span>
        </div>
      )}
      
      {status === 'completed' && (
        <div className="flex items-center gap-2 text-green-600">
          <Check className="h-4 w-4" />
          <span className="text-sm">安装成功</span>
        </div>
      )}
    </div>
  )
}

// 缓存管理界面
export const PluginCacheManager: React.FC = () => {
  const [stats, setStats] = useState<any>(null)
  
  useEffect(() => {
    loadCacheStats()
  }, [])
  
  const loadCacheStats = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.plugin.getCacheStats()
      setStats(result.data)
    }
  }
  
  const handleClearCache = async () => {
    if (window.electronAPI) {
      await window.electronAPI.plugin.clearCache()
      await loadCacheStats()
    }
  }
  
  if (!stats) return <Loader />
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>插件缓存管理</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">缓存大小</div>
              <div className="text-2xl font-bold">
                {(stats.totalSize / 1024 / 1024).toFixed(2)} MB
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">插件数量</div>
              <div className="text-2xl font-bold">{stats.pluginCount}</div>
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            <h4 className="font-medium">已缓存的插件</h4>
            {stats.plugins.map((plugin: any) => (
              <div key={`${plugin.id}@${plugin.version}`} className="flex justify-between items-center">
                <span className="text-sm">{plugin.id}@{plugin.version}</span>
                <span className="text-xs text-muted-foreground">
                  {(plugin.size / 1024).toFixed(2)} KB
                </span>
              </div>
            ))}
          </div>
          
          <Button variant="destructive" onClick={handleClearCache} className="w-full">
            清理所有缓存
          </Button>
        </div>
      </CardContent>
    </Card>
  )
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

## 十一、云端 API 接口设计

### 11.1 认证相关接口

#### 11.1.1 用户注册
```http
POST /api/auth/register
Content-Type: application/json

Request:
{
  "email": "user@example.com",
  "password": "encrypted_password",
  "username": "username",
  "device_info": {
    "device_id": "uuid",
    "device_name": "Mac/Windows/Linux",
    "platform": "desktop",
    "app_version": "1.0.0"
  }
}

Response:
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "username": "username",
      "email": "user@example.com",
      "auth_state": "authenticated",
      "created_at": 1234567890
    },
    "token": "jwt_token_here"
  }
}
```

#### 11.1.2 用户登录
```http
POST /api/auth/login
Content-Type: application/json

Request:
{
  "email": "user@example.com",
  "password": "encrypted_password",
  "device_info": {
    "device_id": "uuid",
    "device_name": "Mac/Windows/Linux",
    "platform": "desktop",
    "app_version": "1.0.0"
  }
}

Response:
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "username": "username",
      "email": "user@example.com",
      "auth_state": "authenticated",
      "membership": null
    },
    "token": "jwt_token_here",
    "refresh_token": "refresh_token_here"
  }
}
```

#### 11.1.3 刷新 Token
```http
POST /api/auth/refresh
Content-Type: application/json
Authorization: Bearer <refresh_token>

Response:
{
  "success": true,
  "data": {
    "token": "new_jwt_token",
    "refresh_token": "new_refresh_token"
  }
}
```

#### 11.1.4 获取用户信息
```http
GET /api/auth/me
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "username": "username",
      "email": "user@example.com",
      "auth_state": "member",
      "membership": {
        "tier": "pro",
        "expiry": 1234567890,
        "features": [
          "cloud_sync",
          "premium_plugins",
          "multi_device"
        ]
      },
      "devices": [
        {
          "device_id": "uuid",
          "device_name": "My MacBook",
          "last_seen": 1234567890
        }
      ]
    }
  }
}
```

#### 11.1.5 登出
```http
POST /api/auth/logout
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "device_id": "uuid"
}

Response:
{
  "success": true
}
```

---

### 11.2 会员相关接口

#### 11.2.1 获取会员套餐列表
```http
GET /api/membership/tiers

Response:
{
  "success": true,
  "data": [
    {
      "id": "free",
      "name": "免费版",
      "price": 0,
      "currency": "CNY",
      "features": [
        "基础功能",
        "本地存储",
        "免费插件（需注册）"
      ],
      "limits": {
        "max_plugins": 5,
        "storage_quota_gb": 1,
        "max_devices": 1
      }
    },
    {
      "id": "pro",
      "name": "专业版",
      "price": 99,
      "currency": "CNY",
      "billing_period": "monthly",
      "features": [
        "所有基础功能",
        "云端同步",
        "所有插件",
        "多设备同步",
        "优先支持"
      ],
      "limits": {
        "max_plugins": -1,
        "storage_quota_gb": 10,
        "max_devices": 3
      }
    },
    {
      "id": "enterprise",
      "name": "企业版",
      "price": 299,
      "currency": "CNY",
      "billing_period": "monthly",
      "features": [
        "所有专业版功能",
        "团队协作",
        "自定义域名",
        "专属客服",
        "API 访问"
      ],
      "limits": {
        "max_plugins": -1,
        "storage_quota_gb": 100,
        "max_devices": -1
      }
    }
  ]
}
```

#### 11.2.2 创建订单
```http
POST /api/membership/orders
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "tier_id": "pro",
  "billing_period": "monthly",
  "payment_method": "alipay" | "wechat" | "stripe"
}

Response:
{
  "success": true,
  "data": {
    "order": {
      "id": "order_123",
      "user_id": "user_123",
      "tier_id": "pro",
      "amount": 99,
      "currency": "CNY",
      "status": "pending",
      "payment_url": "https://payment.example.com/pay/order_123",
      "qr_code": "data:image/png;base64,...",  // 支付二维码（支付宝/微信）
      "expires_at": 1234567890,
      "created_at": 1234567890
    }
  }
}
```

#### 11.2.3 查询订单状态
```http
GET /api/membership/orders/:orderId
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "order": {
      "id": "order_123",
      "status": "paid",
      "paid_at": 1234567890,
      "membership": {
        "tier": "pro",
        "start_date": 1234567890,
        "expiry_date": 1234567890
      }
    }
  }
}
```

#### 11.2.4 验证支付状态
```http
POST /api/membership/orders/:orderId/verify
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "paid": true,
    "membership": {
      "tier": "pro",
      "start_date": 1234567890,
      "expiry_date": 1234567890,
      "features": [...]
    }
  }
}
```

#### 11.2.5 取消订阅
```http
POST /api/membership/cancel
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "cancelled_at": 1234567890,
    "expires_at": 1234567890,  // 会员有效期至
    "message": "订阅将在 2024-12-31 到期"
  }
}
```

---

### 11.3 插件相关接口

#### 11.3.1 获取插件市场列表
```http
GET /api/plugins?category=all&page=1&pageSize=20&permission=all
Authorization: Bearer <token> (optional)

Query Parameters:
- category: all | app | feature | connector
- page: 1
- pageSize: 20
- permission: all | free | premium
- search: 搜索关键词

Response:
{
  "success": true,
  "data": {
    "records": [
      {
        "id": "plugin-ai",
        "name": "AI Assistant",
        "version": "1.0.0",
        "category": "feature",
        "permission": "premium",
        "author": "Kotion Team",
        "description": "AI-powered writing assistant",
        "icon": "https://cdn.example.com/plugins/ai/icon.png",
        "download_count": 10000,
        "rating": 4.8,
        "file_info": {
          "url": "https://cdn.example.com/plugins/ai/1.0.0/index.js",
          "hash": "sha256_hash_here",
          "size": 102400,
          "entry_point": "index.js"
        },
        "screenshots": [
          "https://cdn.example.com/plugins/ai/screenshot1.png"
        ],
        "changelog": "Initial release",
        "required_version": "1.0.0",
        "created_at": 1234567890,
        "updated_at": 1234567890
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

#### 11.3.2 获取插件详情
```http
GET /api/plugins/:pluginId
Authorization: Bearer <token> (optional)

Response:
{
  "success": true,
  "data": {
    "plugin": {
      "id": "plugin-ai",
      "name": "AI Assistant",
      "version": "1.0.0",
      "category": "feature",
      "permission": "premium",
      "author": "Kotion Team",
      "description": "Detailed description...",
      "long_description": "# AI Assistant\n\nFull markdown description...",
      "icon": "https://cdn.example.com/plugins/ai/icon.png",
      "download_count": 10000,
      "rating": 4.8,
      "reviews_count": 234,
      "file_info": {
        "url": "https://cdn.example.com/plugins/ai/1.0.0/index.js",
        "hash": "sha256_hash_here",
        "size": 102400,
        "entry_point": "index.js"
      },
      "versions": [
        {
          "version": "1.0.0",
          "released_at": 1234567890,
          "changelog": "Initial release"
        }
      ],
      "screenshots": [...],
      "dependencies": [],
      "permissions": [
        "network",
        "filesystem"
      ],
      "is_installed": false,
      "installed_version": null
    }
  }
}
```

#### 11.3.3 下载插件文件
```http
GET /api/plugins/:pluginId/download?version=1.0.0
Authorization: Bearer <token>

Headers:
- Authorization: Bearer <token>

Response:
- Content-Type: application/javascript or application/zip
- Content-Disposition: attachment; filename="plugin-ai-1.0.0.js"
- X-File-Hash: sha256_hash_here
- X-File-Size: 102400
- Binary file stream
```

#### 11.3.4 记录插件安装
```http
POST /api/plugins/:pluginId/install
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "version": "1.0.0",
  "device_id": "uuid"
}

Response:
{
  "success": true,
  "data": {
    "installed_at": 1234567890,
    "cloud_id": "installation_123"
  }
}
```

#### 11.3.5 记录插件卸载
```http
POST /api/plugins/:pluginId/uninstall
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "version": "1.0.0",
  "device_id": "uuid"
}

Response:
{
  "success": true
}
```

#### 11.3.6 获取用户已安装插件列表
```http
GET /api/plugins/installed
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    {
      "plugin_id": "plugin-ai",
      "version": "1.0.0",
      "installed_at": 1234567890,
      "device_id": "uuid",
      "cloud_id": "installation_123"
    }
  ]
}
```

#### 11.3.7 检查插件更新
```http
POST /api/plugins/check-updates
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "plugins": [
    {
      "id": "plugin-ai",
      "version": "1.0.0"
    },
    {
      "id": "plugin-excalidraw",
      "version": "2.0.0"
    }
  ]
}

Response:
{
  "success": true,
  "data": {
    "updates": [
      {
        "plugin_id": "plugin-ai",
        "current_version": "1.0.0",
        "latest_version": "1.1.0",
        "changelog": "Bug fixes and improvements",
        "file_info": {
          "url": "https://cdn.example.com/plugins/ai/1.1.0/index.js",
          "hash": "sha256_hash_here",
          "size": 105600
        }
      }
    ]
  }
}
```

---

### 11.4 云端同步接口（仅会员）

#### 11.4.1 同步空间列表
```http
GET /api/sync/spaces
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "spaces": [
      {
        "id": "space_123",
        "name": "My Workspace",
        "icon": "🏠",
        "description": "Personal workspace",
        "home_page_id": "page_456",
        "created_at": 1234567890,
        "updated_at": 1234567890,
        "synced_at": 1234567890
      }
    ],
    "last_sync": 1234567890
  }
}
```

#### 11.4.2 推送空间数据
```http
POST /api/sync/spaces
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "space": {
    "id": "space_123",
    "name": "My Workspace",
    "icon": "🏠",
    "description": "Personal workspace",
    "home_page_id": "page_456",
    "created_at": 1234567890,
    "updated_at": 1234567890
  }
}

Response:
{
  "success": true,
  "data": {
    "cloud_id": "cloud_space_789",
    "synced_at": 1234567890
  }
}
```

#### 11.4.3 同步页面列表
```http
GET /api/sync/spaces/:spaceId/pages
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "pages": [
      {
        "id": "page_123",
        "space_id": "space_456",
        "parent_id": null,
        "title": "Getting Started",
        "content": "{}",  // JSON 字符串
        "icon": "📄",
        "status": "ACTIVE",
        "is_draft": false,
        "created_at": 1234567890,
        "updated_at": 1234567890,
        "synced_at": 1234567890
      }
    ],
    "last_sync": 1234567890
  }
}
```

#### 11.4.4 推送页面数据
```http
POST /api/sync/pages
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "pages": [
    {
      "id": "page_123",
      "space_id": "space_456",
      "title": "Getting Started",
      "content": "{}",
      "updated_at": 1234567890
    }
  ]
}

Response:
{
  "success": true,
  "data": {
    "synced": [
      {
        "local_id": "page_123",
        "cloud_id": "cloud_page_789",
        "synced_at": 1234567890
      }
    ],
    "conflicts": []
  }
}
```

#### 11.4.5 拉取增量更新
```http
GET /api/sync/delta?since=1234567890&entity_types=spaces,pages
Authorization: Bearer <token>

Query Parameters:
- since: 上次同步时间戳
- entity_types: 实体类型（逗号分隔）

Response:
{
  "success": true,
  "data": {
    "changes": [
      {
        "entity_type": "page",
        "entity_id": "page_123",
        "operation": "update",
        "data": {...},
        "updated_at": 1234567890
      },
      {
        "entity_type": "space",
        "entity_id": "space_456",
        "operation": "delete",
        "deleted_at": 1234567890
      }
    ],
    "current_timestamp": 1234567890
  }
}
```

#### 11.4.6 解决同步冲突
```http
POST /api/sync/resolve-conflict
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "entity_type": "page",
  "entity_id": "page_123",
  "resolution": "use_local" | "use_cloud" | "merge",
  "merged_data": {...}  // 如果 resolution = "merge"
}

Response:
{
  "success": true,
  "data": {
    "resolved": true,
    "final_data": {...},
    "synced_at": 1234567890
  }
}
```

#### 11.4.7 获取同步状态
```http
GET /api/sync/status
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "last_sync": 1234567890,
    "pending_changes": 5,
    "sync_enabled": true,
    "storage_usage": {
      "used_gb": 2.5,
      "quota_gb": 10,
      "percentage": 25
    },
    "devices": [
      {
        "device_id": "uuid",
        "device_name": "MacBook Pro",
        "last_seen": 1234567890,
        "sync_enabled": true
      }
    ]
  }
}
```

---

### 11.5 数据导出/导入接口

#### 11.5.1 导出用户数据
```http
POST /api/export/request
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "entity_types": ["spaces", "pages", "plugins"],
  "format": "json" | "markdown"
}

Response:
{
  "success": true,
  "data": {
    "export_id": "export_123",
    "status": "processing",
    "estimated_time": 60  // 秒
  }
}
```

#### 11.5.2 获取导出状态
```http
GET /api/export/:exportId
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "export_id": "export_123",
    "status": "completed",
    "download_url": "https://cdn.example.com/exports/export_123.zip",
    "expires_at": 1234567890,
    "file_size": 1048576
  }
}
```

#### 11.5.3 导入数据
```http
POST /api/import
Authorization: Bearer <token>
Content-Type: multipart/form-data

Request:
- file: exported_data.zip

Response:
{
  "success": true,
  "data": {
    "import_id": "import_123",
    "status": "processing"
  }
}
```

#### 11.5.4 获取导入状态
```http
GET /api/import/:importId
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "import_id": "import_123",
    "status": "completed",
    "imported": {
      "spaces": 5,
      "pages": 120
    },
    "errors": []
  }
}
```

---

### 11.6 设备管理接口

#### 11.6.1 注册设备
```http
POST /api/devices
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "device_id": "uuid",
  "device_name": "MacBook Pro",
  "device_type": "desktop",
  "os": "macOS",
  "os_version": "14.0",
  "app_version": "1.0.0"
}

Response:
{
  "success": true,
  "data": {
    "device": {
      "id": "device_123",
      "device_id": "uuid",
      "device_name": "MacBook Pro",
      "registered_at": 1234567890
    }
  }
}
```

#### 11.6.2 获取设备列表
```http
GET /api/devices
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "devices": [
      {
        "id": "device_123",
        "device_id": "uuid",
        "device_name": "MacBook Pro",
        "device_type": "desktop",
        "os": "macOS",
        "last_seen": 1234567890,
        "sync_enabled": true,
        "is_current": true
      }
    ]
  }
}
```

#### 11.6.3 移除设备
```http
DELETE /api/devices/:deviceId
Authorization: Bearer <token>

Response:
{
  "success": true
}
```

---

### 11.7 错误响应格式

所有接口在出错时返回统一格式：

```http
Status: 400/401/403/404/500

Response:
{
  "success": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "You need to be a member to access this feature",
    "details": {
      "required_tier": "pro",
      "current_tier": "free"
    }
  }
}
```

**常见错误码**:
- `UNAUTHORIZED` - 未登录
- `PERMISSION_DENIED` - 权限不足
- `MEMBERSHIP_REQUIRED` - 需要会员
- `PREMIUM_PLUGIN_REQUIRED` - 需要会员安装高级插件
- `DEVICE_LIMIT_REACHED` - 设备数量达到上限
- `STORAGE_QUOTA_EXCEEDED` - 存储空间不足
- `PLUGIN_NOT_FOUND` - 插件不存在
- `INVALID_FILE_HASH` - 文件哈希校验失败
- `SYNC_CONFLICT` - 同步冲突

---

### 11.8 认证机制

**JWT Token 格式**:
```
Header:
{
  "alg": "HS256",
  "typ": "JWT"
}

Payload:
{
  "user_id": "user_123",
  "email": "user@example.com",
  "auth_state": "member",
  "tier": "pro",
  "device_id": "uuid",
  "iat": 1234567890,
  "exp": 1234567890
}
```

**请求头**:
```
Authorization: Bearer <jwt_token>
X-Device-ID: <device_uuid>
X-App-Version: 1.0.0
```

---

### 11.9 速率限制

| 端点 | 限制 |
|------|------|
| `/api/auth/login` | 5次/分钟 |
| `/api/auth/register` | 3次/小时 |
| `/api/plugins/*` | 60次/分钟 |
| `/api/sync/*` | 120次/分钟（会员） |
| `/api/export/*` | 10次/小时 |

超出限制返回：
```http
Status: 429 Too Many Requests

Response:
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests",
    "retry_after": 60
  }
}
```

---

## 十二、预期效果

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
