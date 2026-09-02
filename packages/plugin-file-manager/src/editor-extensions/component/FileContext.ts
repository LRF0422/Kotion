import { createContext, useContext } from "react"

export type ViewMode = 'grid' | 'list'

/** 列表排序字段 */
export type SortBy = 'name' | 'size' | 'date'
export type SortOrder = 'asc' | 'desc'

/** 侧栏视图 */
export type FileView = 'home' | 'recent' | 'favorites' | 'trash' | 'search'

/** 单击/多选时携带的修饰键 */
export interface SelectionModifiers {
    ctrlKey?: boolean
    metaKey?: boolean
    shiftKey?: boolean
}

export interface FileItem {
    name: string,
    isFolder: boolean,
    id: string,
    children?: FileItem[]
    type: {
        value: 'FOLDER' | 'FILE'
    }
    path?: string
    size?: number
    mediaType?: string | { value?: string }
    /** 0/1 收藏标记 */
    favorite?: number
    /** 0/1 回收站标记 */
    trashed?: number
    createdAt?: string
    updatedAt?: string
    lastAccessedTime?: string
    trashedTime?: string
    icon?: React.ReactNode
    onClick?: () => void
}

export interface BreadcrumbItem {
    id: string
    name: string
    path: string
}

/** i18n 翻译函数 */
export type TranslateFn = (key: string, params?: Record<string, string | number>) => string

export interface FileManagerState {
    selectable?: boolean,
    multiple: boolean,
    target: 'folder' | 'file' | 'both',
    accept: string[],
    /** selectable 模式下确认选择的回调(文件夹选择器) */
    onConfirmSelectable?: (files: FileItem[]) => void,
    isItemSelectable: (item: FileItem) => boolean,
    /** i18n 翻译函数 */
    t: TranslateFn,
    /** 设备是否为触屏(mobile/tablet)—— 影响单击=打开 vs 单击=选中 */
    isTouch: boolean,
    currentFolderItems: FileItem[],
    /** 已按当前排序规则排好序的条目(网格/列表/范围选择共用此顺序) */
    sortedItems: FileItem[],
    selectedFiles: FileItem[]
    setSelectFiles: React.Dispatch<React.SetStateAction<FileItem[]>>
    currentFolderId: string
    setCurrentFolderId: React.Dispatch<React.SetStateAction<string>>,
    currentItem?: FileItem,
    setCurrentItem: React.Dispatch<React.SetStateAction<FileItem | undefined>>
    repoKey: string
    handleUpload: (type: 'FOLDER' | 'FILE', name?: string) => void
    handleDelete: (ids: string[]) => void
    loading?: boolean
    error?: string | null
    // Navigation features
    breadcrumbPath: BreadcrumbItem[]
    canGoBack: boolean
    canGoForward: boolean
    goBack: () => void
    goForward: () => void
    navigateToFolder: (folderId: string, folderName?: string) => void
    // New file operations
    handleRename: (file: FileItem, newName: string) => void
    handleMove: (files: FileItem[], targetFolderId: string) => void
    handleCopy: (files: FileItem[]) => void
    handleDuplicate: (files: FileItem[]) => void
    // Selection (single click / ctrl / shift)
    selectItem: (item: FileItem, modifiers: SelectionModifiers, orderedItems: FileItem[]) => void
    isSelected: (id: string) => boolean
    selectAll: () => void
    clearSelection: () => void
    /** 打开条目:文件夹进入 / 可预览文件预览 / 其余下载 */
    openItem: (item: FileItem) => void
    // 集中式对话框请求(由 FileManager 统一挂载对话框)
    requestRename: (file: FileItem) => void
    requestMove: (files: FileItem[]) => void
    requestDetails: (file: FileItem) => void
    requestPreview: (file: FileItem) => void
    requestDelete: (files: FileItem[]) => void
    requestPurge: (files: FileItem[]) => void
    // View mode
    viewMode: ViewMode
    setViewMode: (mode: ViewMode) => void
    // Sorting
    sortBy: SortBy
    sortOrder: SortOrder
    setSort: (by: SortBy) => void
    // Sidebar views + trash/favorite/recent/search operations
    view: FileView
    setView: (view: FileView) => void
    toggleFavorite: (file: FileItem) => void
    restoreFiles: (ids: string[]) => void
    purgeFiles: (ids: string[]) => void
    emptyTrash: () => void
    searchFiles: (keyword: string) => void
    downloadFile: (file: FileItem) => void
}

export const FileManageContext = createContext<FileManagerState | null>(null)

export const useFileManagerState = () => {
    const context = useContext(FileManageContext)
    if (!context) {
        throw new Error('useFileManagerState must be used within FileManageContext.Provider')
    }
    return context
}
