// API Response wrapper
export interface ApiResponse<T = any> {
  code: number;
  msg: string;
  data: T;
}

// Auth related types
export interface AuthInfo {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  userId: number;
  tenantId?: string;
  account: string;
  userName?: string;
  avatar?: string;
}

export interface LoginCredentials {
  account: string;
  password: string;
  tenantId?: string;
  captchaKey?: string;
  captchaCode?: string;
}

export interface AnonymousLoginParams {
  deviceId: string;
  deviceName: string;
}

export enum UserRole {
  ANONYMOUS = 'anonymous',
  AUTHENTICATED = 'authenticated',
  MEMBER = 'member',
}

export enum MembershipLevel {
  FREE = 'free',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

export interface MembershipInfo {
  level: MembershipLevel;
  expireTime?: number;
  maxDevices: number;
  features: string[];
}

export interface UserInfo {
  id: number;
  account: string;
  name?: string;
  realName?: string;
  avatar?: string;
  email?: string;
  phone?: string;
  roleId?: string;
  roleName?: string;
  deptId?: number;
  postId?: number;
  tenantId?: string;
}

// Device types
export interface DeviceInfo {
  id: string;
  deviceId: string;
  deviceName: string;
  platform: string; // windows, macos, linux
  lastSyncTime?: number;
  createdAt: number;
  updatedAt: number;
}

// Space types
export interface Space {
  id: number;
  name: string;
  description?: string;
  icon?: string;
  isPublic: boolean;
  isTemplate?: boolean;
  creatorId: number;
  createdAt: number;
  updatedAt: number;
  // Local-only fields
  localOnly?: boolean;
  syncStatus?: SyncStatus;
}

export interface SpaceDTO {
  name: string;
  description?: string;
  icon?: string;
  isPublic?: boolean;
}

// Page types
export interface Page {
  id: number;
  spaceId: number;
  title: string;
  content?: string;
  parentId?: number;
  icon?: string;
  cover?: string;
  isDeleted: boolean;
  creatorId: number;
  createdAt: number;
  updatedAt: number;
  // Local-only fields
  localOnly?: boolean;
  syncStatus?: SyncStatus;
}

export interface PageDTO {
  spaceId: number;
  title: string;
  content?: string;
  parentId?: number;
  icon?: string;
  cover?: string;
}

export interface PageBlock {
  id: string;
  pageId: number;
  type: string;
  content: any;
  properties?: Record<string, any>;
  parentId?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

// Plugin types
export enum PluginPermission {
  FREE = 'free',
  PREMIUM = 'premium',
}

export interface Plugin {
  id: number;
  name: string;
  description?: string;
  author: string;
  version: string;
  category: string;
  permission: PluginPermission;
  icon?: string;
  tags?: string[];
  downloadUrl?: string;
  homepage?: string;
  repository?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PluginVersion {
  id: number;
  pluginId: number;
  version: string;
  downloadUrl: string;
  fileHash: string;
  fileSize: number;
  releaseNotes?: string;
  isPremium: boolean;
  createdAt: number;
}

export interface InstalledPlugin {
  id: number;
  pluginId: number;
  name: string;
  version: string;
  category: string;
  isPremium: boolean;
  installedAt: number;
  cloudId?: number;
  filePath: string;
  enabled: boolean;
}

export interface PluginDTO {
  name: string;
  description?: string;
  author: string;
  version: string;
  category: string;
  permission?: string;
  icon?: string;
  tags?: string[];
}

// File types
export interface FileInfo {
  id: number;
  name: string;
  type: 'file' | 'folder';
  parentId?: number;
  repoKey?: string;
  path: string;
  size?: number;
  mimeType?: string;
  creatorId: number;
  createdAt: number;
  updatedAt: number;
}

export interface FileDTO {
  name: string;
  type: 'file' | 'folder';
  parentId?: number;
  repoKey?: string;
}

// Sync types
export enum SyncStatus {
  SYNCED = 'synced',
  PENDING = 'pending',
  SYNCING = 'syncing',
  CONFLICT = 'conflict',
  ERROR = 'error',
}

export interface SyncChange {
  type: 'space' | 'page' | 'plugin';
  action: 'create' | 'update' | 'delete';
  entityId: number;
  data: any;
  timestamp: number;
  deviceId: string;
}

export interface SyncConflict {
  type: 'space' | 'page';
  entityId: number;
  localData: any;
  remoteData: any;
  localTimestamp: number;
  remoteTimestamp: number;
}

// Storage types
export enum StorageMode {
  LOCAL = 'local',
  CLOUD = 'cloud',
  HYBRID = 'hybrid',
}

// Query types
export interface PaginationParams {
  page?: number;
  size?: number;
}

export interface QuerySpaceDTO extends PaginationParams {
  keyword?: string;
  isTemplate?: boolean;
}

export interface QueryPageDTO extends PaginationParams {
  spaceId?: number;
  keyword?: string;
  isDeleted?: boolean;
}

export interface QueryPluginDTO extends PaginationParams {
  keyword?: string;
  category?: string;
  isPremium?: boolean;
}

export interface PageResult<T> {
  records: T[];
  total: number;
  size: number;
  current: number;
  pages: number;
}

// Tree types
export interface TreeNode<T> {
  id: T;
  name: string;
  parentId?: T;
  children?: TreeNode<T>[];
  [key: string]: any;
}

// Config types
export interface ApiConfig {
  baseURL: string;
  timeout: number;
}

export interface ElectronAdapterConfig {
  api: ApiConfig;
  dbPath: string;
  cachePath: string;
  enableSync: boolean;
  syncInterval: number; // in milliseconds
}
