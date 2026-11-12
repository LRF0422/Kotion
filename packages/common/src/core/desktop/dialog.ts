/** Native dialogs (open/save/message). */
export interface DesktopFileFilter {
    name: string
    extensions: string[]
}

export interface DesktopOpenFileOptions {
    title?: string
    filters?: DesktopFileFilter[]
    multiSelections?: boolean
}

export interface DesktopOpenFolderOptions {
    title?: string
}

export interface DesktopSaveFileOptions {
    title?: string
    defaultPath?: string
    filters?: DesktopFileFilter[]
}

export interface DesktopMessageOptions {
    type?: 'none' | 'info' | 'error' | 'question' | 'warning'
    title?: string
    message: string
    detail?: string
    buttons?: string[]
}
export interface DesktopDialogFileResult {
    canceled: boolean
    filePaths: string[]
}

export interface DesktopDialogFolderResult {
    canceled: boolean
    folderPath: string | null
}

export interface DesktopDialogSaveResult {
    canceled: boolean
    filePath: string | null
}
