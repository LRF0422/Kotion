import { Check, ClockIcon, DownloadIcon, FileIcon, FilePlus2Icon, FolderIcon, FolderOpenIcon, FolderPlusIcon, HomeIcon, ListIcon, LucideHome, PlusIcon, StarIcon, Trash2, UploadIcon, XIcon, ArrowLeft, ArrowRight, ChevronRight, Pencil, FolderInput, Copy, Files, CheckSquare, Square } from "@kn/icon";
import { Button, EmptyState, Input, ScrollArea, Separator, TreeView, cn, Skeleton, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@kn/ui";
import React, { useCallback, useEffect, useState, useMemo } from "react";
import { FileCardList } from "./FileCard";
import { useSafeState } from "@kn/core";
import { useApi } from "@kn/core";
import { APIS } from "../../api";
import { Menu } from "./Menu";
import { FileItem, FileManageContext } from "./FileContext";
import { useFileManager } from "../../hooks/useFileManager";
import { Breadcrumb } from "./Breadcrumb";
import { RenameDialog, MoveDialog, FileDetailsDialog } from "./dialogs";



export interface FileManagerProps {
    folderId?: string
    className?: string
    selectable?: boolean
    onCancel?: () => void
    onConfirm?: (files: FileItem[]) => void
    multiple?: boolean
    target?: 'folder' | 'file' | 'both'
}



export const FileManagerView: React.FC<FileManagerProps> = (props) => {

    const { selectable = false, onCancel, onConfirm, multiple = false, target = 'both' } = props

    const [selectedFiles, setSelectFiles] = useSafeState<FileItem[]>([])
    const [repoKey, setRepoKey] = useState<string>("")
    const [files, setFiles] = useSafeState<any[]>([])
    const [sidebarLoading, setSidebarLoading] = useState(true)
    const [isInitialLoad, setIsInitialLoad] = useState(true)
    const { folderId } = props

    const {
        currentFolderId,
        setCurrentFolderId,
        currentItem,
        setCurrentItem,
        currentFolderItems,
        loading,
        error,
        createFolder,
        uploadFile,
        deleteFiles,
        refreshFolder,
        breadcrumbPath,
        canGoBack,
        canGoForward,
        goBack,
        goForward,
        navigateToFolder,
        // New file operations
        renameFile,
        moveFiles,
        copyFiles,
        duplicateFiles,
    } = useFileManager({ initialFolderId: props.folderId || "" })

    // Dialog states
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [moveDialogOpen, setMoveDialogOpen] = useState(false);
    const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

    const defaultMenus = [
        {
            isGroup: true,
            name: <div className="flex flex-row items-center gap-2 text-nowrap">
                导航
                <Input onChange={(e) => { }} className="h-7" placeholder="Search..." />
            </div>,
            children: [
                {
                    name: "Home",
                    id: "home",
                    key: 'home',
                    icon: <HomeIcon className="h-4 w-4" />,
                    onClick: () => {
                    }
                },
                {
                    name: "Recent",
                    id: "recent",
                    key: 'recent',
                    icon: <ClockIcon className="h-4 w-4" />,
                    onClick: () => {
                    }
                },
                {
                    name: "Favorites",
                    id: "Favorites",
                    key: 'Favorites',
                    icon: <StarIcon className="h-4 w-4" />,
                    onClick: () => {
                    }
                },
                {
                    name: "Trash",
                    id: "Trash",
                    key: 'Trash',
                    icon: <Trash2 className="h-4 w-4" />,
                    onClick: () => {
                    }
                }
            ]
        }
    ]


    const handleCreateFile = useCallback((type: 'FOLDER' | 'FILE', name?: string) => {
        if (type === 'FOLDER') {
            createFolder(name || "New Folder", repoKey)
        } else {
            uploadFile(repoKey)
        }
    }, [createFolder, uploadFile, repoKey])

    const handleDelete = useCallback((ids: string[]) => {
        deleteFiles(ids)
    }, [deleteFiles])

    // New file operation handlers
    const handleRename = useCallback((file: FileItem, newName: string) => {
        renameFile(file, newName);
    }, [renameFile]);

    const handleMove = useCallback((files: FileItem[], targetFolderId: string) => {
        moveFiles(files, targetFolderId);
    }, [moveFiles]);

    const handleCopy = useCallback((files: FileItem[]) => {
        copyFiles(files);
    }, [copyFiles]);

    const handleDuplicate = useCallback((files: FileItem[]) => {
        duplicateFiles(files);
    }, [duplicateFiles]);

    // Selection handlers
    const selectAll = useCallback(() => {
        setSelectFiles([...currentFolderItems]);
    }, [currentFolderItems, setSelectFiles]);

    const clearSelection = useCallback(() => {
        setSelectFiles([]);
    }, [setSelectFiles]);


    const reslove = useCallback((file: any) => {
        const baseItem = {
            id: file.id,
            name: file.name,
            isFolder: file.type.value === 'FOLDER',
            path: file.path,
            type: file.type,
            icon: file.type.value === 'FOLDER' ? <FolderIcon className="h-4 w-4" /> : <FileIcon className="h-4 w-4" />,
            onClick: () => {
                if (file.type.value === 'FOLDER') {
                    navigateToFolder(file.id, file.name)
                }
                setCurrentItem(file)
            }
        }

        if (file.children) {
            return {
                ...baseItem,
                children: file.children.map((item: any) => reslove(item))
            }
        }

        return baseItem
    }, [navigateToFolder, setCurrentItem])
    useEffect(() => {
        const fetchData = async () => {
            // Only show skeleton on initial load
            if (isInitialLoad) {
                setSidebarLoading(true)
            }
            try {
                const api = folderId ? APIS.GET_CHILDREN : APIS.GET_ROOT_FOLDER
                const params = folderId ? { folderId } : undefined
                const res = await useApi(api, params)
                const items = res.data.map((item: any) => reslove(item))
                setFiles([...defaultMenus, {
                    isGroup: true,
                    name: "Folders",
                    children: [...items],
                    height: folderId ? 700 : 500
                }])
            } catch (err) {
                console.error('Failed to load folders:', err)
            } finally {
                if (isInitialLoad) {
                    setSidebarLoading(false)
                    setIsInitialLoad(false)
                }
            }
        }
        fetchData()
    }, [folderId, reslove, isInitialLoad])

    const contextValue = useMemo(() => ({
        selectedFiles,
        setSelectFiles,
        currentFolderId,
        setCurrentFolderId,
        currentFolderItems,
        currentItem,
        selectable,
        setCurrentItem,
        repoKey,
        handleUpload: handleCreateFile,
        handleDelete: handleDelete,
        loading,
        error,
        breadcrumbPath,
        canGoBack,
        canGoForward,
        goBack,
        goForward,
        navigateToFolder,
        // New file operations
        handleRename,
        handleMove,
        handleCopy,
        handleDuplicate,
        selectAll,
        clearSelection,
    }), [selectedFiles, currentFolderId, currentFolderItems, currentItem, selectable, repoKey, handleCreateFile, handleDelete, loading, error, breadcrumbPath, canGoBack, canGoForward, goBack, goForward, navigateToFolder, handleRename, handleMove, handleCopy, handleDuplicate, selectAll, clearSelection])

    return <FileManageContext.Provider value={contextValue}>
        <div className={cn("rounded-sm flex flex-col border not-prose", props.className)}>
            <div className="w-full bg-muted border-b flex items-center justify-between h-[40px] px-1">
                <div className="flex items-center h-full gap-1">
                    <Button size="sm" variant="ghost" onClick={() => handleCreateFile('FILE')} disabled={loading}>
                        <UploadIcon className="-ms-1 me-2 opacity-60 mr-1" size={16} strokeWidth={2} aria-hidden="true" />
                        Upload
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleCreateFile('FOLDER')} disabled={loading}>
                        <FolderPlusIcon className="-ms-1 me-2 opacity-60 mr-1" size={16} strokeWidth={2} aria-hidden="true" />
                        New Folder
                    </Button>

                    <Separator orientation="vertical" className="h-6" />

                    {/* Selection actions */}
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={selectedFiles.length === currentFolderItems.length ? clearSelection : selectAll}
                        disabled={loading || currentFolderItems.length === 0}
                    >
                        {selectedFiles.length === currentFolderItems.length && currentFolderItems.length > 0 ? (
                            <><Square className="-ms-1 me-2 opacity-60 mr-1" size={16} strokeWidth={2} aria-hidden="true" />Deselect</>
                        ) : (
                            <><CheckSquare className="-ms-1 me-2 opacity-60 mr-1" size={16} strokeWidth={2} aria-hidden="true" />Select All</>
                        )}
                    </Button>

                    {selectedFiles.length > 0 && (
                        <>
                            <Separator orientation="vertical" className="h-6" />

                            {/* Actions for selected files */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="ghost">
                                        Actions ({selectedFiles.length})
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-[180px]">
                                    {selectedFiles.length === 1 && (
                                        <>
                                            <DropdownMenuItem onClick={() => setRenameDialogOpen(true)}>
                                                <Pencil className="h-4 w-4 mr-2" />
                                                Rename
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setDetailsDialogOpen(true)}>
                                                <FileIcon className="h-4 w-4 mr-2" />
                                                Properties
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                        </>
                                    )}
                                    <DropdownMenuItem onClick={() => setMoveDialogOpen(true)}>
                                        <FolderInput className="h-4 w-4 mr-2" />
                                        Move to...
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleCopy(selectedFiles)}>
                                        <Copy className="h-4 w-4 mr-2" />
                                        Copy
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleDuplicate(selectedFiles)}>
                                        <Files className="h-4 w-4 mr-2" />
                                        Duplicate
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem disabled={selectedFiles.every(f => f.isFolder)}>
                                        <DownloadIcon className="h-4 w-4 mr-2" />
                                        Download
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() => handleDelete(selectedFiles.map(f => f.id))}
                                        className="text-destructive focus:text-destructive"
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <Button size="sm" variant="ghost" onClick={() => handleDelete(selectedFiles.map(f => f.id))} disabled={loading}>
                                <Trash2 className="-ms-1 me-2 opacity-60 mr-1 text-destructive" size={16} strokeWidth={2} aria-hidden="true" />
                                Delete
                            </Button>
                        </>
                    )}

                    {
                        selectable &&
                        <>
                            <Separator orientation="vertical" className="h-6" />
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
            <div className="grid w-full grid-cols-[220px_1fr] flex-1 overflow-auto h-[calc(100%-40px)]">
                <div className="border-r overflow-y-auto h-full">
                    <div className="bg-muted/80 border-b h-[40px] flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => {
                                navigateToFolder(props.folderId || "", "Home")
                            }}
                            disabled={sidebarLoading}
                        >
                            <LucideHome className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => handleCreateFile('FOLDER')}
                            disabled={loading || sidebarLoading}>
                            <FolderPlusIcon className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => handleCreateFile('FILE')}
                            disabled={loading || sidebarLoading}>
                            <FilePlus2Icon className="w-4 h-4" />
                        </Button>
                    </div>
                    {sidebarLoading ? (
                        <div className="p-2 space-y-2">
                            <div className="space-y-1">
                                <Skeleton className="h-8 w-full" />
                                <div className="pl-4 space-y-1">
                                    <Skeleton className="h-7 w-full" />
                                    <Skeleton className="h-7 w-full" />
                                    <Skeleton className="h-7 w-full" />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Skeleton className="h-8 w-full" />
                                <div className="pl-4 space-y-1">
                                    <Skeleton className="h-7 w-[80%]" />
                                    <Skeleton className="h-7 w-[90%]" />
                                    <Skeleton className="h-7 w-[85%]" />
                                    <Skeleton className="h-7 w-[75%]" />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <TreeView
                            initialSelectedId={currentFolderId}
                            selectParent={true}
                            size="sm"
                            className="w-[200px] m-0"
                            elements={files}
                        />
                    )}
                </div>
                <div className="overflow-auto w-full flex flex-col h-full">
                    <div className="w-full border-b bg-muted/50 min-h-[40px] flex items-center justify-between px-2" >
                        <div className="flex items-center gap-2 flex-1">
                            {/* Back/Forward Navigation Buttons */}
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={goBack}
                                    disabled={!canGoBack || loading}
                                    title="Go back"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={goForward}
                                    disabled={!canGoForward || loading}
                                    title="Go forward"
                                >
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                            </div>
                            <Separator orientation="vertical" className="h-6" />
                            {/* Breadcrumb Navigation */}
                            <Breadcrumb
                                items={breadcrumbPath}
                                onNavigate={navigateToFolder}
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto h-[calc(100%-45px)]">
                        {
                            loading ? (
                                <div className="p-6 space-y-4">
                                    <div className="flex flex-wrap gap-2">
                                        {[...Array(6)].map((_, i) => (
                                            <Skeleton key={i} className="w-[200px] h-[180px]" />
                                        ))}
                                    </div>
                                </div>
                            ) : error ? (
                                <EmptyState
                                    icons={[FolderOpenIcon]}
                                    title="Error loading files"
                                    description={error}
                                    className=" h-full w-full max-w-none border-none rounded-none"
                                    action={{
                                        label: 'Retry',
                                        onClick: refreshFolder
                                    }}
                                />
                            ) : currentFolderItems.length > 0 ? (
                                <Menu>
                                    <FileCardList />
                                </Menu>
                            ) : (
                                <EmptyState
                                    icons={[FolderOpenIcon]}
                                    title="No files"
                                    description=""
                                    className=" h-full w-full max-w-none border-none rounded-none"
                                    action={{
                                        label: 'Upload Files',
                                        onClick: () => handleCreateFile('FILE')
                                    }}
                                />
                            )
                        }
                    </div>
                </div>
            </div>
        </div>

        {/* Dialogs */}
        <RenameDialog
            open={renameDialogOpen}
            onOpenChange={setRenameDialogOpen}
            file={selectedFiles.length === 1 ? selectedFiles[0] : null}
            onConfirm={handleRename}
        />
        <MoveDialog
            open={moveDialogOpen}
            onOpenChange={setMoveDialogOpen}
            files={selectedFiles}
            onConfirm={handleMove}
            currentFolderId={currentFolderId}
        />
        <FileDetailsDialog
            open={detailsDialogOpen}
            onOpenChange={setDetailsDialogOpen}
            file={selectedFiles.length === 1 ? selectedFiles[0] : null}
        />
    </FileManageContext.Provider>
}