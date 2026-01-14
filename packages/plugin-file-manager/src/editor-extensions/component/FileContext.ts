import { createContext, useContext } from "react"

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
    createdAt?: string
    updatedAt?: string
    icon?: React.ReactNode
    onClick?: () => void
}

export interface BreadcrumbItem {
    id: string
    name: string
    path: string
}

export interface FileManagerState {
    selectable?: boolean,
    currentFolderItems: FileItem[],
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
}

export const FileManageContext = createContext<FileManagerState | null>(null)

export const useFileManagerState = () => {
    const context = useContext(FileManageContext)
    if (!context) {
        throw new Error('useFileManagerState must be used within FileManageContext.Provider')
    }
    return context
}