/** Filesystem primitives and their inline-failure result shapes. */
export interface DesktopDirEntry {
    name: string
    isDirectory: boolean
    isFile: boolean
}

export interface DesktopFileStat {
    size: number
    isDirectory: boolean
    isFile: boolean
    createdAt: number
    modifiedAt: number
}
/** File operations report failures inline instead of rejecting. */
export interface DesktopFileResult<T = never> {
    data?: T | null
    success?: boolean
    error?: string
}
