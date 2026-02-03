// Shared types between main and renderer processes

export interface AppInfo {
  version: string;
  platform: string;
  arch: string;
}

export interface StorageInfo {
  mode: 'local' | 'cloud' | 'hybrid';
  dbSize: number;
  cacheSize: number;
}
