# 后端集成指南 - Electron 桌面端

> 本文档描述如何将现有的 Knowledge Cloud 后端 (`/home/Leong/workspace/knowledgecloud`) 与 Electron 桌面端进行集成。

## 一、现有后端架构概览

### 1.1 服务端口映射

| 服务名称 | 端口 | 功能描述 |
|---------|------|---------|
| knowledge-gateway | 1889 | API 网关（统一入口） |
| knowledge-auth | 8100 | 认证服务 |
| knowledge-wiki | 7778 | Wiki 核心服务 |
| knowledge-file-center | 7004 | 文件服务 |
| knowledge-system | - | 系统服务（用户、权限等） |
| knowledge-message | - | 消息服务 |
| knowledge-ops | 8106 | 运维服务 |

### 1.2 技术栈

- **后端框架**: Spring Boot 2.7.1 + Spring Cloud 2021.0.3
- **Java 版本**: 1.8
- **服务发现**: Nacos 2.1.0
- **API 网关**: Spring Cloud Gateway (port 1889)

## 二、现有 API 可复用性分析

### 2.1 ✅ 完全可复用的 API

#### 认证相关 (`knowledge-auth`)

```
POST   /knowledge-auth/token                    # 登录获取 token
GET    /knowledge-auth/captcha                   # 获取验证码
```

**现有实现**: `AuthController.java:55-96`

#### 空间和页面 (`knowledge-wiki`)

```
# 空间管理
POST   /knowledge-wiki/space                     # 创建空间
GET    /knowledge-wiki/space/personal            # 个人空间
GET    /knowledge-wiki/space/list                # 空间列表
GET    /knowledge-wiki/space/{id}/detail         # 空间详情
POST   /knowledge-wiki/space/{id}/favorite       # 收藏空间
GET    /knowledge-wiki/space/{id}/page/tree      # 页面树

# 页面管理
POST   /knowledge-wiki/space/page                # 创建页面
GET    /knowledge-wiki/space/page/{id}/content   # 页面内容
GET    /knowledge-wiki/space/page/list           # 页面列表
GET    /knowledge-wiki/space/page/recent         # 最近页面
GET    /knowledge-wiki/space/page/favorites      # 收藏页面
DELETE /knowledge-wiki/space/page/{id}/trash    # 移到回收站
PUT    /knowledge-wiki/space/page/{id}/restore   # 恢复页面

# 协作功能
POST   /knowledge-wiki/space/collaborationInvitation    # 创建协作邀请
GET    /knowledge-wiki/space/{id}/members               # 空间成员
GET    /knowledge-wiki/space/page/{pageId}/collaborators # 页面协作者
GET    /knowledge-wiki/space/page/invited               # 受邀页面
```

**现有实现**: `SpaceController.java:1-230`

#### 插件市场 (`knowledge-wiki`)

```
POST   /knowledge-wiki/plugin                    # 创建插件
GET    /knowledge-wiki/plugin/public             # 公开插件列表
GET    /knowledge-wiki/plugin/{id}               # 插件详情
POST   /knowledge-wiki/plugin/install            # 安装插件
GET    /knowledge-wiki/plugin/install/list       # 已安装插件
POST   /knowledge-wiki/plugin/uninstall          # 卸载插件
POST   /knowledge-wiki/plugin/update             # 更新插件
```

**现有实现**: `PluginController.java:1-80`

#### 文件管理 (`knowledge-file-center`)

```
POST   /knowledge-file/file                      # 创建文件
GET    /knowledge-file/repo/{repoKey}/folder/tree # 文件夹树
GET    /knowledge-file/folder/root               # 根文件夹
GET    /knowledge-file/folder/children           # 子文件/文件夹
GET    /knowledge-file/file/{fileId}             # 文件详情
```

**现有实现**: `FileController.java:1-53`

#### 用户管理 (`knowledge-system`)

```
GET    /knowledge-system/user/detail             # 用户详情
GET    /knowledge-system/user/info               # 当前用户信息
POST   /knowledge-system/user/submit             # 创建/更新用户
POST   /knowledge-system/user/update             # 更新用户
POST   /knowledge-system/user/update-password    # 修改密码
POST   /knowledge-system/user/register           # 用户注册
```

**现有实现**: `UserController.java:1-152`

### 2.2 ⚠️ 需要增强的 API

#### 2.2.1 认证模块 - 匿名用户支持

**需求**: 桌面端支持不登录使用，需要生成匿名用户 token

**建议新增**:
```java
// AuthController.java
@PostMapping("/anonymous")
@ApiOperation(value = "匿名登录", notes = "桌面端免登录使用")
public R<AuthInfo> anonymousLogin(
    @RequestParam String deviceId,
    @RequestParam(required = false) String deviceName) {
    // 1. 基于 deviceId 生成匿名用户
    // 2. 返回受限权限的 token
    // 3. 标记为 anonymous 类型
}
```

#### 2.2.2 插件模块 - 文件下载

**需求**: 桌面端需要下载插件 JS 文件到本地缓存

**建议新增**:
```java
// PluginController.java
@GetMapping("/{versionId}/download")
@ApiOperation(value = "下载插件文件", notes = "返回插件JS文件")
public ResponseEntity<Resource> downloadPlugin(
    @PathVariable Long versionId) {
    // 1. 验证用户权限（免费/会员）
    // 2. 记录下载日志
    // 3. 返回 JS 文件流
}

@GetMapping("/{versionId}/hash")
@ApiOperation(value = "获取插件文件哈希", notes = "用于验证缓存")
public R<String> getPluginHash(@PathVariable Long versionId) {
    // 返回文件 SHA-256 哈希值
}
```

#### 2.2.3 用户模块 - 会员系统

**需求**: 支持会员等级、设备绑定

**建议新增**:
```java
// UserController.java
@GetMapping("/membership")
@ApiOperation(value = "获取会员信息")
public R<MembershipVO> getMembership() {
    // 返回: membershipLevel, expireTime, maxDevices
}

@PostMapping("/device/bind")
@ApiOperation(value = "绑定设备")
public R<?> bindDevice(
    @RequestParam String deviceId,
    @RequestParam String deviceName,
    @RequestParam String platform) {
}

@GetMapping("/device/list")
@ApiOperation(value = "设备列表")
public R<List<DeviceVO>> getDevices() {
}

@DeleteMapping("/device/{deviceId}")
@ApiOperation(value = "解绑设备")
public R<?> unbindDevice(@PathVariable String deviceId) {
}
```

#### 2.2.4 同步模块 - 数据同步

**需求**: 会员用户本地数据与云端同步

**建议新增** (可以放在 `knowledge-wiki` 或新建 `knowledge-sync` 服务):
```java
@RestController
@RequestMapping("/sync")
public class SyncController {
    
    @PostMapping("/spaces")
    public R<?> syncSpaces(@RequestBody List<SpaceDTO> spaces) {
        // 批量同步空间
    }
    
    @PostMapping("/pages")
    public R<?> syncPages(@RequestBody List<PageDTO> pages) {
        // 批量同步页面
    }
    
    @GetMapping("/changes")
    public R<SyncChangesVO> getChanges(
        @RequestParam Long since,
        @RequestParam(required = false) String deviceId) {
        // 获取自指定时间戳后的所有变更
    }
    
    @PostMapping("/resolve-conflict")
    public R<?> resolveConflict(@RequestBody ConflictResolutionDTO dto) {
        // 解决同步冲突
    }
}
```

### 2.3 ❌ 需要全新实现的 API

#### 2.3.1 会员支付

**建议**: 集成微信支付/支付宝

```java
@RestController
@RequestMapping("/payment")
public class PaymentController {
    
    @PostMapping("/order/create")
    public R<OrderVO> createOrder(@RequestBody CreateOrderDTO dto) {
        // 创建支付订单
    }
    
    @GetMapping("/order/{orderId}")
    public R<OrderVO> getOrder(@PathVariable String orderId) {
    }
    
    @PostMapping("/notify/wechat")
    public String wechatNotify(@RequestBody String xmlData) {
        // 微信支付回调
    }
}
```

## 三、Electron 桌面端集成方案

### 3.1 API 调用架构

```
┌─────────────────────────────────────────┐
│   Electron App (Renderer Process)      │
│  ┌─────────────────────────────────┐   │
│  │  React Components               │   │
│  └─────────┬───────────────────────┘   │
│            │                             │
│  ┌─────────▼───────────────────────┐   │
│  │  packages/electron-adapter      │   │
│  │  - AuthManager (token管理)      │   │
│  │  - StorageAdapter (本地/云端)   │   │
│  │  - SyncService (数据同步)       │   │
│  └─────────┬───────────────────────┘   │
│            │                             │
│            │ IPC                         │
│  ┌─────────▼───────────────────────┐   │
│  │  Main Process                   │   │
│  │  - HTTP Client                  │   │
│  │  - SQLite Database              │   │
│  └─────────┬───────────────────────┘   │
└────────────┼───────────────────────────┘
             │ HTTPS
             ▼
    ┌────────────────────┐
    │  API Gateway       │
    │  :1889             │
    └────────┬───────────┘
             │
     ┌───────┴────────┐
     │                │
┌────▼────┐    ┌─────▼─────┐
│  Auth   │    │   Wiki    │
│  :8100  │    │   :7778   │
└─────────┘    └───────────┘
```

### 3.2 环境配置

在 Electron 中配置 API Base URL:

```typescript
// packages/electron-adapter/src/config.ts
export const API_CONFIG = {
  // 开发环境
  development: {
    baseURL: 'http://localhost:1889',
    timeout: 30000,
  },
  
  // 生产环境
  production: {
    baseURL: 'https://api.knowledge.com',  // 你的实际域名
    timeout: 30000,
  },
}

// 自动检测环境
export const getApiConfig = () => {
  return API_CONFIG[process.env.NODE_ENV] || API_CONFIG.development
}
```

### 3.3 HTTP Client 封装

```typescript
// packages/electron-adapter/src/http/client.ts
import axios, { AxiosInstance } from 'axios'
import { getApiConfig } from '../config'

export class HttpClient {
  private client: AxiosInstance
  private tokenStore: TokenStore
  
  constructor() {
    const config = getApiConfig()
    
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    // 请求拦截器 - 自动添加 token
    this.client.interceptors.request.use((config) => {
      const token = this.tokenStore.getToken()
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`
      }
      return config
    })
    
    // 响应拦截器 - 处理 401
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Token 过期，尝试刷新
          const refreshed = await this.refreshToken()
          if (refreshed) {
            // 重试原请求
            return this.client.request(error.config)
          } else {
            // 刷新失败，跳转登录
            this.emit('auth:expired')
          }
        }
        return Promise.reject(error)
      }
    )
  }
  
  // 封装常用方法
  async get<T>(url: string, params?: any): Promise<T> {
    const response = await this.client.get(url, { params })
    return response.data
  }
  
  async post<T>(url: string, data?: any): Promise<T> {
    const response = await this.client.post(url, data)
    return response.data
  }
  
  async put<T>(url: string, data?: any): Promise<T> {
    const response = await this.client.put(url, data)
    return response.data
  }
  
  async delete<T>(url: string): Promise<T> {
    const response = await this.client.delete(url)
    return response.data
  }
  
  // 下载文件（用于下载插件）
  async downloadFile(url: string, savePath: string): Promise<void> {
    const response = await this.client.get(url, {
      responseType: 'arraybuffer',
    })
    
    const fs = require('fs-extra')
    await fs.writeFile(savePath, response.data)
  }
}
```

### 3.4 认证管理器

```typescript
// packages/electron-adapter/src/auth/auth-manager.ts
export class AuthManager {
  private httpClient: HttpClient
  private db: Database
  
  /**
   * 匿名登录（桌面端首次启动）
   */
  async loginAsAnonymous(): Promise<AuthInfo> {
    const deviceId = await this.getOrCreateDeviceId()
    const deviceName = os.hostname()
    
    const result = await this.httpClient.post<R<AuthInfo>>(
      '/knowledge-auth/anonymous',
      { deviceId, deviceName }
    )
    
    if (result.code === 200) {
      await this.saveAuthInfo(result.data)
      return result.data
    }
    
    throw new Error('Anonymous login failed')
  }
  
  /**
   * 账号密码登录
   */
  async loginWithPassword(account: string, password: string): Promise<AuthInfo> {
    const result = await this.httpClient.post<R<AuthInfo>>(
      '/knowledge-auth/token',
      {
        grantType: 'password',
        account,
        password,
      }
    )
    
    if (result.code === 200) {
      await this.saveAuthInfo(result.data)
      // 登录后触发同步
      this.emit('auth:login', result.data)
      return result.data
    }
    
    throw new Error(result.msg || 'Login failed')
  }
  
  /**
   * 刷新 token
   */
  async refreshToken(): Promise<boolean> {
    const authInfo = await this.getAuthInfo()
    if (!authInfo?.refreshToken) return false
    
    try {
      const result = await this.httpClient.post<R<AuthInfo>>(
        '/knowledge-auth/token',
        {
          grantType: 'refresh_token',
          refreshToken: authInfo.refreshToken,
        }
      )
      
      if (result.code === 200) {
        await this.saveAuthInfo(result.data)
        return true
      }
    } catch (error) {
      console.error('Refresh token failed:', error)
    }
    
    return false
  }
  
  /**
   * 登出
   */
  async logout(): Promise<void> {
    await this.db.prepare('DELETE FROM auth_info').run()
    this.emit('auth:logout')
  }
  
  /**
   * 获取当前用户信息
   */
  async getCurrentUser(): Promise<UserInfo | null> {
    const authInfo = await this.getAuthInfo()
    if (!authInfo) return null
    
    const result = await this.httpClient.get<R<UserVO>>(
      '/knowledge-system/user/info'
    )
    
    return result.code === 200 ? result.data : null
  }
  
  /**
   * 获取会员信息
   */
  async getMembership(): Promise<MembershipInfo | null> {
    const result = await this.httpClient.get<R<MembershipVO>>(
      '/knowledge-system/user/membership'
    )
    
    return result.code === 200 ? result.data : null
  }
}
```

### 3.5 数据同步服务

```typescript
// packages/electron-adapter/src/sync/sync-service.ts
export class SyncService {
  private httpClient: HttpClient
  private db: Database
  private authManager: AuthManager
  
  /**
   * 执行全量同步
   */
  async syncAll(): Promise<void> {
    // 只有会员才能同步
    const membership = await this.authManager.getMembership()
    if (!membership || membership.level === 'free') {
      throw new Error('Sync requires membership')
    }
    
    console.log('Starting full sync...')
    
    // 1. 同步空间
    await this.syncSpaces()
    
    // 2. 同步页面
    await this.syncPages()
    
    // 3. 同步插件
    await this.syncPlugins()
    
    console.log('Sync completed')
    this.emit('sync:completed')
  }
  
  /**
   * 增量同步
   */
  async syncIncremental(): Promise<void> {
    const lastSyncTime = await this.getLastSyncTime()
    const deviceId = await this.authManager.getDeviceId()
    
    // 获取服务端变更
    const result = await this.httpClient.get<R<SyncChangesVO>>(
      '/knowledge-sync/changes',
      { since: lastSyncTime, deviceId }
    )
    
    if (result.code === 200) {
      const changes = result.data
      
      // 应用变更到本地
      await this.applyChanges(changes)
      
      // 更新同步时间
      await this.updateLastSyncTime(Date.now())
    }
  }
  
  /**
   * 上传本地变更
   */
  async pushLocalChanges(): Promise<void> {
    const localChanges = await this.getLocalChanges()
    
    if (localChanges.spaces.length > 0) {
      await this.httpClient.post('/knowledge-sync/spaces', localChanges.spaces)
    }
    
    if (localChanges.pages.length > 0) {
      await this.httpClient.post('/knowledge-sync/pages', localChanges.pages)
    }
    
    // 标记为已同步
    await this.markChangesAsSynced(localChanges)
  }
}
```

## 四、联调步骤

### 4.1 后端准备

1. **启动后端服务**
   ```bash
   cd /home/Leong/workspace/knowledgecloud
   
   # 启动 Nacos (服务注册中心)
   # 启动 Gateway (1889)
   # 启动 Auth (8100)
   # 启动 Wiki (7778)
   # 启动 File Center (7004)
   ```

2. **验证服务健康状态**
   ```bash
   curl http://localhost:1889/actuator/health
   ```

3. **测试认证接口**
   ```bash
   # 获取验证码
   curl http://localhost:1889/knowledge-auth/captcha
   
   # 登录
   curl -X POST http://localhost:1889/knowledge-auth/token \
     -d "account=admin&password=admin&grantType=password"
   ```

### 4.2 前端开发

1. **配置 API 代理** (开发环境避免 CORS)
   ```typescript
   // apps/web/vite.config.ts
   export default defineConfig({
     server: {
       proxy: {
         '/api': {
           target: 'http://localhost:1889',
           changeOrigin: true,
           rewrite: (path) => path.replace(/^\/api/, ''),
         },
       },
     },
   })
   ```

2. **创建 API Service**
   ```typescript
   // packages/shared/src/api/space.ts
   export class SpaceApi {
     async getPersonalSpace(): Promise<SpaceVO> {
       return httpClient.get('/knowledge-wiki/space/personal')
     }
     
     async createSpace(dto: SpaceDTO): Promise<void> {
       return httpClient.post('/knowledge-wiki/space', dto)
     }
     
     async getPageTree(spaceId: number): Promise<Tree<number>[]> {
       return httpClient.get(`/knowledge-wiki/space/${spaceId}/page/tree`)
     }
   }
   ```

3. **集成到 React 组件**
   ```tsx
   // apps/web/src/components/SpaceList.tsx
   const SpaceList = () => {
     const [spaces, setSpaces] = useState<SpaceVO[]>([])
     
     useEffect(() => {
       const loadSpaces = async () => {
         const result = await spaceApi.getPersonalSpace()
         setSpaces(result)
       }
       
       loadSpaces()
     }, [])
     
     return (
       <div>
         {spaces.map(space => (
           <SpaceCard key={space.id} space={space} />
         ))}
       </div>
     )
   }
   ```

### 4.3 联调测试

1. **测试认证流程**
   - [ ] 匿名登录（待后端实现）
   - [ ] 账号密码登录
   - [ ] Token 刷新
   - [ ] Token 过期处理

2. **测试空间和页面**
   - [ ] 获取个人空间
   - [ ] 创建新空间
   - [ ] 获取页面树
   - [ ] 创建页面
   - [ ] 编辑页面内容
   - [ ] 删除页面（回收站）

3. **测试插件系统**
   - [ ] 获取插件市场列表
   - [ ] 查看插件详情
   - [ ] 安装插件
   - [ ] 下载插件文件（待后端实现）
   - [ ] 卸载插件

4. **测试会员功能**
   - [ ] 获取会员信息（待后端实现）
   - [ ] 升级会员（待后端实现）
   - [ ] 绑定设备（待后端实现）
   - [ ] 数据同步（待后端实现）

## 五、需要后端新增的接口总结

### 优先级 P0 (必须实现)

```java
// 1. 匿名登录
POST /knowledge-auth/anonymous

// 2. 插件文件下载
GET /knowledge-wiki/plugin/{versionId}/download
GET /knowledge-wiki/plugin/{versionId}/hash

// 3. 会员信息
GET /knowledge-system/user/membership
```

### 优先级 P1 (重要但不紧急)

```java
// 4. 设备管理
POST   /knowledge-system/user/device/bind
GET    /knowledge-system/user/device/list
DELETE /knowledge-system/user/device/{deviceId}

// 5. 数据同步
POST /knowledge-sync/spaces
POST /knowledge-sync/pages
GET  /knowledge-sync/changes
POST /knowledge-sync/resolve-conflict
```

### 优先级 P2 (可延后)

```java
// 6. 支付系统
POST /knowledge-payment/order/create
GET  /knowledge-payment/order/{orderId}
POST /knowledge-payment/notify/wechat
```

## 六、数据库表设计建议

### 会员表 (user_membership)

```sql
CREATE TABLE user_membership (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  level VARCHAR(20) NOT NULL DEFAULT 'free',  -- free, pro, enterprise
  expire_time DATETIME,
  max_devices INT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id)
);
```

### 设备表 (user_devices)

```sql
CREATE TABLE user_devices (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  device_id VARCHAR(64) NOT NULL UNIQUE,
  device_name VARCHAR(128),
  platform VARCHAR(32),  -- windows, macos, linux
  last_sync_time DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_device_id (device_id)
);
```

### 插件版本增强

```sql
-- 在现有的插件版本表中添加字段
ALTER TABLE plugin_version ADD COLUMN file_hash VARCHAR(64);  -- SHA-256
ALTER TABLE plugin_version ADD COLUMN file_size BIGINT;       -- 文件大小(字节)
ALTER TABLE plugin_version ADD COLUMN download_count INT DEFAULT 0;
ALTER TABLE plugin_version ADD COLUMN is_premium TINYINT DEFAULT 0;  -- 是否需要会员
```

## 七、开发计划建议

### 第一阶段: 基础功能对接 (1-2 周)

1. 实现 HTTP Client 封装
2. 对接现有的认证、空间、页面 API
3. 实现本地 SQLite 数据存储
4. 基本的 CRUD 功能验证

### 第二阶段: 插件系统 (1 周)

1. 后端实现插件文件下载接口
2. 前端实现插件缓存管理
3. 插件安装/卸载/更新流程

### 第三阶段: 会员系统 (2 周)

1. 后端实现会员相关接口
2. 后端实现设备管理接口
3. 前端集成会员功能 UI
4. 支付系统对接

### 第四阶段: 数据同步 (2-3 周)

1. 后端实现同步接口
2. 前端实现同步服务
3. 冲突解决策略
4. 增量同步优化

## 八、AI Agent Chat 集成

> Scope: the `knowledge-agent` SSE endpoint that powers the editor's in-document AI assistant. After the frontend skills-architecture refactor, the **frontend no longer performs skill discovery or activation**; it simply ships the full capability catalog on every turn and executes the tool calls the server asks for. The backend owns progressive discovery / skill activation end-to-end.

### 8.1 Endpoint

```
POST /api/knowledge-agent/api/v1/chat/completions   # SSE streaming
GET  /api/knowledge-agent/api/v1/models             # available models
```

Authentication: `Authorization: Bearer <token>` (same scheme as the rest of this guide).

No new endpoint was introduced for capability registration — the catalog travels inline with every chat request.

### 8.2 Extended request body

The request body is an OpenAI-compatible chat payload extended with three fields: `skills`, `tools`, `capabilitiesVersion`.

```jsonc
{
    "model": "deepseek-chat",
    "stream": true,
    "temperature": 0.7,
    "maxTokens": 4096,
    "conversationId": "conv_...",
    "sessionId": "sess_...",          // optional, for context recovery
    "userId": 123,
    "messages": [
        { "role": "system", "content": "..." },
        { "role": "user",   "content": "Translate section 2 to English" }
    ],

    // ---- NEW: full capability catalog ----
    "capabilitiesVersion": "a1b2c3d4",  // stable FNV-1a 32-bit hex of (skills, tools)
    "skills": [ /* SkillPayload[] */ ],
    "tools":  [ /* ToolPayload[]  */ ],

    "data": { /* optional frontend passthrough */ }
}
```

Contract guarantees from the frontend:

- `skills` and `tools` contain the **complete** built-in + plugin + user-installed catalog available in the current session. No client-side filtering is performed.
- `tools[]` uses the `ToolPayload` shape below — **not** OpenAI's `{ type: 'function', function: {...} }` shape. The backend is expected to select a subset and convert to the LLM-facing format as progressive discovery proceeds.
- `capabilitiesVersion` is a stable hash over the catalog. The backend MAY cache the parsed catalog by this hash and skip re-parsing when it is unchanged across turns within the same session.
- When `tools` / `skills` are empty or omitted, the backend should treat the session as having no external capabilities (the model may still answer with plain text).

### 8.3 Payload schemas

#### `SkillPayload`

```ts
interface SkillPayload {
    name: string                    // unique skill id (e.g. "translation")
    description: string
    requiredTools: string[]         // tool names this skill needs to operate
    optionalTools?: string[]
    systemPromptFragment?: string   // prompt snippet to splice in when the skill activates
    tags?: string[]
    source: 'builtin' | 'plugin' | 'user'
    pluginName?: string             // set when source is 'plugin' or 'user'
}
```

The backend is responsible for:

- Deciding **when** a skill should activate based on the user's message + tool-call history.
- Splicing `systemPromptFragment` into the system prompt when it activates a skill.
- Exposing `requiredTools` (and optionally `optionalTools`) from the supplied `tools[]` catalog to the LLM.

#### `ToolPayload`

```ts
interface ToolPayload {
    name: string
    description: string
    parameters: object              // JSON Schema (produced from the tool's Zod schema)
    category: string                // e.g. "navigation", "edit", "analysis"
    priority: number                // higher = more general-purpose
    tags: string[]
    source: 'builtin' | 'plugin'
    pluginName?: string
}
```

`parameters` is a plain JSON Schema object — the backend should forward it (possibly after trimming) as the `function.parameters` field when surfacing the tool to the LLM.

### 8.4 Responsibility split

| Concern | Owner |
|---|---|
| Collecting built-in / plugin / user skills and tools into one catalog | Frontend (`CapabilityCatalog`) |
| Computing `capabilitiesVersion` hash | Frontend |
| Deciding which tools to expose to the LLM in the current turn | **Backend** |
| Progressive skill activation (`discoverCapabilities`, `activateSkill`, `loadTool`) | **Backend** — implemented as internal server-side tools, never exposed to the frontend |
| Splicing `systemPromptFragment` into the system prompt | **Backend** |
| Executing tools named in `tool_calls` and returning `tool_result` | Frontend |

The frontend **never** calls `discoverCapabilities`, `listSkills`, `activateSkill`, or `loadTool`. Those tools, if present, are backend-only and must not appear in any streamed `tool-call` event targeted at the client.

### 8.5 Streaming contract (unchanged)

The SSE event stream is the same as before the refactor. For a complete catalog of `ChatStreamEvent` types (text-delta, reasoning-delta, tool-call, tool-result, annotation, session-info, finish, error), see `packages/common/src/ai/chat-client/types.ts`. The existing tool_call → tool_result round-trip remains the mechanism by which the backend drives frontend-side tool execution.

### 8.6 Reference frontend implementation

For backend developers wiring up this contract, the authoritative client is:

- Request builder: `packages/common/src/ai/chat-client/index.ts` → `KnowledgeChatClient.buildRequestBody`
- Catalog collector: `packages/common/src/ai/capabilities/CapabilityCatalog.ts` → `collectCapabilityCatalog`
- Types: `packages/common/src/ai/chat-client/types.ts` (`ChatRequest`, `SkillPayload`, `ToolPayload`)

---

## 附录: API 响应格式

您的后端使用统一的响应格式:

```java
public class R<T> {
    private int code;      // 200 表示成功
    private String msg;    // 提示消息
    private T data;        // 实际数据
}
```

前端需要统一处理:

```typescript
interface ApiResponse<T> {
  code: number
  msg: string
  data: T
}

// HTTP Client 自动解包
async get<T>(url: string): Promise<T> {
  const response = await this.client.get<ApiResponse<T>>(url)
  
  if (response.data.code !== 200) {
    throw new Error(response.data.msg || 'Request failed')
  }
  
  return response.data.data
}
```

---

**总结**: 您的后端已经具备了大部分核心功能,只需要补充匿名登录、插件文件下载、会员系统和数据同步这几个模块,就可以完整支持桌面端的需求。现有的 API 完全可以复用,开发成本不高。
