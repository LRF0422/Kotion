import { Check, DownloadIcon, FileIcon, FolderIcon, FolderOpenIcon, ListIcon, Trash2, UploadIcon, XIcon } from "@kn/icon";
import { Button, EmptyState, Separator, TreeView, cn } from "@kn/ui";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { FileCardList } from "./FileCard";
import { useSafeState, useUploadFile } from "@kn/core";
import { useApi } from "@kn/core";
import { APIS } from "../../api";
import { Menu } from "./Menu";
import { toast } from "@kn/ui";


export interface FileItem {
    name: string,
    isFolder: boolean,
    id: string,
    children?: FileItem[]
    type: {
        value: 'FOLDER' | 'FILE'
    }
}

export interface FileManagerProps {
    folderId?: string
    className?: string
    selectable?: boolean
    onCancel?: () => void
    onConfirm?: (files: FileItem[]) => void
    multiple?: boolean
    target?: 'folder' | 'file' | 'both'
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
}

export const FileManageContext = createContext<FileManagerState | null>(null)
export const useFileManagerState = () => useContext(FileManageContext)
export const FileManagerView: React.FC<FileManagerProps> = (props) => {

    const { selectable = false, onCancel, onConfirm, multiple = false, target = 'both' } = props

    const [selectedFiles, setSelectFiles] = useSafeState<FileItem[]>([])
    const [currentFolderId, setCurrentFolderId] = useSafeState<string>(props.folderId || "")
    const [currentItem, setCurrentItem] = useState<FileItem>()
    const [updateFlag, setUpdateFlag] = useState(0)
    const [currentFolderItems, setCurrentFolderItems] = useState<FileItem[]>([])
    const [repoKey, setRepoKey] = useState<string>("")
    const [files, setFiles] = useSafeState<any[]>([])
    const { folderId } = props
    const { uploadedFiles, upload } = useUploadFile()


    const createFile = useCallback((type: 'FOLDER' | 'FILE', name?: string) => {
        if (type === 'FOLDER') {
            useApi(APIS.CREATE_FOLDER, null, {
                name: name || "New Folder",
                parentId: currentFolderId,
                type: type,
                repositoryKey: repoKey,
            }).then(() => {
                setUpdateFlag(updateFlag + 1)
            })
        } else {
            upload().then((res) => {
                const promise = useApi(APIS.CREATE_FOLDER, null, {
                    name: res.originalName,
                    parentId: currentFolderId,
                    type: type,
                    repositoryKey: repoKey,
                    path: res.name
                }).then(() => {
                    setUpdateFlag(updateFlag + 1)
                })
                toast.promise(promise, {
                    loading: 'Uploading...',
                    success: 'Uploaded',
                    error: 'Upload failed',
                })
            })
        }
    }, [currentFolderId])

    const handleDelete = useCallback((ids: string[]) => {
    }, [])


    const reslove = (file: any) => {
        if (!file.children) {
            return {
                id: file.id,
                name: file.name,
                isFolder: file.type.value === 'FOLDER',
                icon: file.type.value === 'FOLDER' ? <FolderIcon className="h-4 w-4" /> : <FileIcon className="h-4 w-4" />,
                onClick: () => {
                    if (file.type.value === 'FOLDER') {
                        setCurrentFolderId(file.id)
                    }
                    setCurrentItem(file)
                }
            }
        } else {
            return {
                id: file.id,
                name: file.name,
                isFolder: file.type.value === 'FOLDER',
                children: file.children.map((item: any) => reslove(item)),
                icon: file.type.value === 'FOLDER' ? <FolderIcon className="h-4 w-4" /> : <FileIcon className="h-4 w-4" />,
                onClick: () => {
                    if (file.type.value === 'FOLDER') {
                        setCurrentFolderId(file.id)
                    }
                    setCurrentItem(file)
                }
            }
        }
    }
    useEffect(() => {
        if (!folderId) {
            useApi(APIS.GET_ROOT_FOLDER).then(res => {
                const items = res.data.map((item: any) => reslove(item))
                setFiles(items)
                setCurrentFolderItems(items)
            })
        } else {
            useApi(APIS.GET_CHILDREN, { folderId }).then(res => {
                const items = res.data.map((item: any) => reslove(item))
                setFiles(items)
                setCurrentFolderItems(items)
            })
        }
    }, [folderId])

    useEffect(() => {
        if (!currentFolderId) {
            useApi(APIS.GET_ROOT_FOLDER).then(res => {
                const items = res.data.map((item: any) => reslove(item))
                setCurrentFolderItems(items)
            })
        } else {
            useApi(APIS.GET_CHILDREN, { folderId: currentFolderId }).then(res => {
                const items = res.data.map((item: any) => reslove(item))
                setCurrentFolderItems(items)
            })
        }
    }, [currentFolderId, updateFlag])

    // useEffect(() => {
    //     if (currentItem && currentItem.type.value === 'FOLDER') {
    //         useApi(APIS.GET_CHILDREN, { folderId: currentItem.id }).then(res => {
    //             setCurrentFolderItems(res.data.map((item: any) => reslove(item)))
    //         })
    //     }
    // }, [currentItem, updateFlag])

    return <FileManageContext.Provider value={{
        selectedFiles,
        setSelectFiles,
        currentFolderId,
        setCurrentFolderId,
        currentFolderItems,
        currentItem,
        selectable,
        setCurrentItem,
        repoKey,
        handleUpload: createFile,
        handleDelete: handleDelete

    }}>
        <div className={cn("rounded-sm flex flex-col border not-prose", props.className)}>
            <div className="w-full bg-muted border-b flex items-center justify-between h-[40px]">
                <div className="flex items-center h-full gap-1">
                    <Button size="sm" variant="ghost" onClick={() => {
                        createFile('FILE')
                    }}>
                        <UploadIcon className="-ms-1 me-2 opacity-60 mr-1" size={16} strokeWidth={2} aria-hidden="true" />
                        Upload
                    </Button>
                    <Button size="sm" variant="ghost">
                        <Trash2 className="-ms-1 me-2 opacity-60 mr-1" size={16} strokeWidth={2} aria-hidden="true" />
                        Delete
                    </Button>
                    <Button size="sm" variant="ghost">
                        <DownloadIcon className="-ms-1 me-2 opacity-60 mr-1" size={16} strokeWidth={2} aria-hidden="true" />
                        Download
                    </Button>
                    {
                        selectable &&
                        <>
                            <Separator orientation="vertical" />
                            {
                                selectedFiles.length > 0 &&
                                <Button size="sm" className="h-8" onClick={() => {
                                    onConfirm && onConfirm(selectedFiles)
                                }}>
                                    <Check className="-ms-1 me-2 opacity-60 mr-1" size={16} strokeWidth={2} aria-hidden="true" />
                                    Confirm
                                </Button>
                            }
                            <Button size="sm" className="h-8" onClick={() => { onCancel && onCancel() }} >
                                <XIcon className="-ms-1 me-2 opacity-60 mr-1" size={16} strokeWidth={2} aria-hidden="true" />
                                Cancel
                            </Button>
                        </>
                    }
                </div>
                <div className="flex items-center">
                    <Button size="sm" variant="ghost">
                        <ListIcon className="-ms-1 me-2 opacity-60 mr-1" size={16} strokeWidth={2} aria-hidden="true" />
                    </Button>
                </div>
            </div>
            <div className="grid w-full grid-cols-[200px_1fr] flex-1 overflow-auto h-[calc(100%-40px)]">
                <div className="border-r">
                    <div className=" p-1 bg-muted/80">
                        Files
                    </div>
                    <TreeView
                        initialSelectedId={currentFolderId}
                        selectParent={true}
                        size="sm"
                        className="w-full m-0"
                        elements={files}
                    />
                </div>
                <div className="overflow-auto w-full flex flex-col h-full">
                    <div className="w-full border-b bg-muted/50 h-[45px] flex items-center" >
                        <div className="ml-2">
                            Files
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto h-[calc(100%-45px)]">
                        {
                            currentFolderItems.length > 0 ? (
                                <Menu>
                                    <FileCardList />
                                </Menu>
                            ) :
                                <EmptyState
                                    icons={[FolderOpenIcon]}
                                    title="No files"
                                    description=""
                                    className=" h-full w-full max-w-none border-none rounded-none"
                                    action={{
                                        label: 'Upload Files',
                                        onClick: () => {
                                            createFile('FILE')
                                        }
                                    }}
                                />
                        }
                    </div>
                </div>
            </div>
        </div>
    </FileManageContext.Provider>
}