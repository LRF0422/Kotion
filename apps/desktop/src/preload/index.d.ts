import { ElectronAPI } from '@electron-toolkit/preload'

// API Response types
interface ApiResult<T = any> {
  data?: T
  success?: boolean
  error?: string
  canceled?: boolean
}

// Auth types
interface LoginCredentials {
  account: string
  password: string
  tenantId?: string
}

interface AuthInfo {
  accessToken: string
  refreshToken: string
  tokenType: string
  expiresIn: number
  userId: number
  tenantId?: string
  account: string
  userName?: string
  avatar?: string
}

interface UserInfo {
  id: number
  account: string
  name?: string
  realName?: string
  avatar?: string
  email?: string
  phone?: string
}

interface MembershipInfo {
  level: 'free' | 'pro' | 'enterprise'
  expireTime?: number
  maxDevices: number
  features: string[]
}

// Space types
interface Space {
  id: number
  name: string
  description?: string
  icon?: string
  isPublic: boolean
  isTemplate?: boolean
  creatorId: number
  createdAt: number
  updatedAt: number
}

interface SpaceDTO {
  name: string
  description?: string
  icon?: string
  isPublic?: boolean
}

// Page types
interface Page {
  id: number
  spaceId: number
  title: string
  content?: string
  parentId?: number
  icon?: string
  cover?: string
  isDeleted: boolean
  creatorId: number
  createdAt: number
  updatedAt: number
}

interface PageDTO {
  spaceId: number
  title: string
  content?: string
  parentId?: number
  icon?: string
  cover?: string
}

interface PageBlock {
  id: string
  pageId: number
  type: string
  content: any
  properties?: Record<string, any>
  parentId?: string
  order: number
}

// File types
interface FileInfo {
  id: number
  name: string
  type: 'file' | 'folder'
  parentId?: number
  repoKey?: string
  path: string
  size?: number
  mimeType?: string
}

// Plugin types
interface InstalledPlugin {
  id: number
  pluginId: number
  name: string
  version: string
  category: string
  isPremium: boolean
  installedAt: number
  filePath: string
  enabled: boolean
}

// Tree types
interface TreeNode<T> {
  id: T
  name: string
  parentId?: T
  children?: TreeNode<T>[]
}

// Dialog types
interface OpenFileOptions {
  title?: string
  filters?: { name: string; extensions: string[] }[]
  multiSelections?: boolean
}

interface SaveFileOptions {
  title?: string
  defaultPath?: string
  filters?: { name: string; extensions: string[] }[]
}

interface MessageBoxOptions {
  type?: 'none' | 'info' | 'error' | 'question' | 'warning'
  title?: string
  message: string
  detail?: string
  buttons?: string[]
}

// System types
interface AppInfo {
  version: string
  name: string
  platform: string
  arch: string
  userDataPath: string
  locale: string
}

interface SystemPaths {
  userData: string
  downloads: string
  documents: string
  desktop: string
  temp: string
}

// File stat types
interface FileStat {
  size: number
  isDirectory: boolean
  isFile: boolean
  createdAt: number
  modifiedAt: number
}

interface DirEntry {
  name: string
  isDirectory: boolean
  isFile: boolean
}

// Database stats
interface DbStats {
  size: number
  tables: { name: string; rowCount: number }[]
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      // General
      ping: () => void
      invoke: <T = any>(channel: string, ...args: any[]) => Promise<T>
      send: (channel: string, ...args: any[]) => void
      on: (channel: string, callback: (...args: any[]) => void) => void

      // Auth
      'auth:login': (credentials: LoginCredentials) => Promise<AuthInfo>
      'auth:loginAnonymous': () => Promise<AuthInfo>
      'auth:logout': () => Promise<void>
      'auth:getInfo': () => Promise<AuthInfo | null>
      'auth:getUserInfo': () => Promise<UserInfo | null>
      'auth:getMembership': () => Promise<MembershipInfo | null>
      'auth:isLoggedIn': () => Promise<boolean>
      'auth:isMember': () => Promise<boolean>
      'auth:updatePassword': (oldPassword: string, newPassword: string, confirmPassword: string) => Promise<void>
      'auth:register': (data: { account: string; password: string; name?: string; email?: string }) => Promise<void>

      // User
      'user:getInfo': () => Promise<UserInfo | null>
      'user:search': (query: string) => Promise<ApiResult<UserInfo[]>>

      // Space
      'space:create': (dto: SpaceDTO) => Promise<Space>
      'space:get': (id: number) => Promise<Space | null>
      'space:list': () => Promise<ApiResult<Space[]>>
      'space:getAll': () => Promise<Space[]>
      'space:getPersonal': () => Promise<ApiResult<Space | null>>
      'space:getDetail': (id: string) => Promise<ApiResult<Space | null>>
      'space:addFavorite': (id: string) => Promise<ApiResult>
      'space:removeFavorite': (id: string) => Promise<ApiResult>
      'space:getFavorites': () => Promise<ApiResult<Space[]>>
      'space:getMembers': (id: string) => Promise<ApiResult<any[]>>
      'space:getTemplates': () => Promise<ApiResult<Space[]>>
      'space:update': (id: number, data: Partial<Space>) => Promise<void>
      'space:delete': (id: number) => Promise<void>

      // Page
      'page:create': (dto: PageDTO) => Promise<Page>
      'page:get': (id: number) => Promise<Page | null>
      'page:getBySpace': (spaceId: number) => Promise<Page[]>
      'page:getTree': (spaceId: number) => Promise<TreeNode<number>[]>
      'page:getRecent': (limit?: number) => Promise<Page[]>
      'page:update': (id: number, data: Partial<Page>) => Promise<void>
      'page:delete': (id: number) => Promise<void>
      'page:restore': (id: number) => Promise<void>
      'page:save': (data: PageDTO & { id?: number }) => Promise<ApiResult<Page>>
      'page:list': (params?: { spaceId?: number }) => Promise<ApiResult<Page[]>>
      'page:getContent': (id: string) => Promise<ApiResult<Page | null>>
      'page:moveToTrash': (id: string) => Promise<ApiResult>
      'page:getFavorites': () => Promise<ApiResult<Page[]>>
      'page:getTemplates': () => Promise<ApiResult<Page[]>>
      'page:saveAsTemplate': (id: string) => Promise<ApiResult>
      'page:addFavorite': (id: string) => Promise<ApiResult>
      'page:removeFavorite': (id: string) => Promise<ApiResult>
      'page:getBlocks': (params: { pageId: number }) => Promise<ApiResult<PageBlock[]>>
      'page:getBlockInfo': (id: string) => Promise<ApiResult<PageBlock | null>>
      'page:createBlock': (block: { id: string; pageId: number; type: string; content?: any; properties?: Record<string, any>; parentId?: string; order?: number }) => Promise<ApiResult>
      'page:updateBlock': (blockId: string, data: any) => Promise<ApiResult>
      'page:deleteBlock': (blockId: string) => Promise<ApiResult>
      'page:getCollaborators': (pageId: string) => Promise<ApiResult<any[]>>
      'page:search': (keyword: string, spaceId?: number) => Promise<ApiResult<Page[]>>
      'page:getTrash': (spaceId?: number) => Promise<ApiResult<Page[]>>
      'page:permanentDelete': (id: string) => Promise<ApiResult>
      'page:emptyTrash': (spaceId?: number) => Promise<ApiResult>

      // Plugin
      'plugin:search': (dto: any) => Promise<any>
      'plugin:getDetail': (id: number) => Promise<any>
      'plugin:install': (versionId: number, pluginId: string, version: string) => Promise<{ filePath: string }>
      'plugin:uninstall': (id: string) => Promise<void>
      'plugin:getInstalled': () => Promise<InstalledPlugin[]>
      'plugin:setEnabled': (id: string, enabled: boolean) => Promise<void>

      // File
      'file:upload': (data: { filePath: string; parentId?: number; repoKey?: string }) => Promise<ApiResult<FileInfo>>
      'file:getRootFolder': () => Promise<ApiResult<TreeNode<number>[]>>
      'file:getChildren': (parentId: string, repoKey?: string) => Promise<ApiResult<FileInfo[]>>
      'file:createFolder': (data: { name: string; parentId?: number; repoKey?: string }) => Promise<ApiResult>
      'file:download': (id: string) => Promise<ApiResult<{ path: string }>>

      // Database
      'db:getStats': () => Promise<DbStats>
      'db:backup': (backupPath: string) => Promise<void>
      'db:vacuum': () => Promise<void>

      // Storage
      'storage:getMode': () => Promise<'local' | 'cloud' | 'hybrid'>

      // System
      'system:getAppInfo': () => Promise<AppInfo>
      'system:getPaths': () => Promise<SystemPaths>

      // Dialog
      'dialog:openFile': (options?: OpenFileOptions) => Promise<{ canceled: boolean; filePaths: string[] }>
      'dialog:openFolder': (options?: { title?: string }) => Promise<{ canceled: boolean; folderPath: string | null }>
      'dialog:saveFile': (options?: SaveFileOptions) => Promise<{ canceled: boolean; filePath: string | null }>
      'dialog:showMessage': (options: MessageBoxOptions) => Promise<{ response: number }>

      // FileSystem
      'fs:readFile': (filePath: string, encoding?: BufferEncoding) => Promise<ApiResult<string>>
      'fs:writeFile': (filePath: string, content: string | Buffer, encoding?: BufferEncoding) => Promise<ApiResult>
      'fs:exists': (filePath: string) => Promise<boolean>
      'fs:mkdir': (dirPath: string) => Promise<ApiResult>
      'fs:remove': (path: string) => Promise<ApiResult>
      'fs:readdir': (dirPath: string) => Promise<ApiResult<DirEntry[]>>
      'fs:stat': (filePath: string) => Promise<ApiResult<FileStat>>
      'fs:copy': (src: string, dest: string) => Promise<ApiResult>
      'fs:move': (src: string, dest: string) => Promise<ApiResult>
    }
  }
}

export {}
