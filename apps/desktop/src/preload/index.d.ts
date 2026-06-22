import { ElectronAPI } from '@electron-toolkit/preload'

// API Response types
interface ApiResult<T = any> {
  data?: T
  success?: boolean
  error?: string
  canceled?: boolean
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

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      // General
      ping: () => void
      invoke: <T = any>(channel: string, ...args: any[]) => Promise<T>
      send: (channel: string, ...args: any[]) => void
      on: (channel: string, callback: (...args: any[]) => void) => void

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

export { }
