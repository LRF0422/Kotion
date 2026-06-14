import { Check, ClockIcon, DownloadIcon, FileIcon, FilePlus2Icon, FolderIcon, FolderOpenIcon, FolderPlusIcon, HomeIcon, ListIcon, LayoutGridIcon, LucideHome, PlusIcon, StarIcon, Trash2, UploadIcon, XIcon, ArrowLeft, ArrowRight, ChevronRight, Pencil, FolderInput, Copy, Files, CheckSquare, Square, Menu as MenuIcon, MoreVertical } from "@kn/icon";
import { Button, EmptyState, Input, ScrollArea, Separator, TreeView, cn, Skeleton, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, useIsMobile, Sheet, SheetContent, SheetTrigger, SheetTitle, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@kn/ui";
import React, { useCallback, useEffect, useState, useMemo } from "react";
import { FileCardList } from "./FileCard";
import { FileListView } from "./FileList";
import { useSafeState, useApi } from "@kn/common";
import { APIS } from "../../api";
import { Menu } from "./Menu";
import { FileItem, FileManageContext, ViewMode } from "./FileContext";
import { useFileManager } from "../../hooks/useFileManager";
import { Breadcrumb } from "./Breadcrumb";
import { RenameDialog, MoveDialog, FileDetailsDialog, CreateFolderDialog } from "./dialogs";



export interface FileManagerProps {
    folderId?: string
    className?: string
    selectable?: boolean
    onCancel?: () => void
    onConfirm?: (files: FileItem[]) => void
    multiple?: boolean
    target?: 'folder' | 'file' | 'both'
    defaultViewMode?: ViewMode
    onViewModeChange?: (mode: ViewMode) => void
}



export const FileManagerView: React.FC<FileManagerProps> = (props) => {

    const isMobile = useIsMobile()
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [viewMode, setViewMode] = useState<ViewMode>(props.defaultViewMode || 'grid')
    const { selectable = false, onCancel, onConfirm, multiple = false, target = 'both', onViewModeChange } = props

    // Handle view mode change
    const handleViewModeChange = useCallback((mode: ViewMode) => {
        setViewMode(mode)
        onViewModeChange?.(mode)
    }, [onViewModeChange])

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
        // Views + trash/favorite/recent/search
        view,
        setView,
        searchKeyword,
        toggleFavorite,
        restoreFiles,
        purgeFiles,
        emptyTrash,
        searchFiles,
        downloadFile,
    } = useFileManager({ initialFolderId: props.folderId || "" })

    const isTrash = view === 'trash'
    // 仅普通文件夹浏览视图允许上传(拖拽/按钮)
    const canUpload = view === 'home'

    // Debounced sidebar search
    const searchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const handleSearchInput = useCallback((value: string) => {
        if (searchTimer.current) clearTimeout(searchTimer.current)
        searchTimer.current = setTimeout(() => {
            const kw = value.trim()
            if (kw) {
                searchFiles(kw)
            } else {
                navigateToFolder(props.folderId || "", "Home")
            }
        }, 350)
    }, [searchFiles, navigateToFolder, props.folderId])

    // Drag & drop upload
    const [isDragging, setIsDragging] = useState(false)
    const dragDepth = React.useRef(0)
    const handleDragEnter = useCallback((e: React.DragEvent) => {
        if (!canUpload) return
        if (!Array.from(e.dataTransfer.types || []).includes('Files')) return
        e.preventDefault()
        dragDepth.current += 1
        setIsDragging(true)
    }, [canUpload])
    const handleDragOver = useCallback((e: React.DragEvent) => {
        if (!canUpload) return
        if (Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault()
    }, [canUpload])
    const handleDragLeave = useCallback((e: React.DragEvent) => {
        if (!canUpload) return
        dragDepth.current -= 1
        if (dragDepth.current <= 0) {
            dragDepth.current = 0
            setIsDragging(false)
        }
    }, [canUpload])
    const handleDrop = useCallback((e: React.DragEvent) => {
        if (!canUpload) return
        e.preventDefault()
        dragDepth.current = 0
        setIsDragging(false)
        const files = Array.from(e.dataTransfer.files || [])
        if (files.length) uploadFile(repoKey, files)
    }, [canUpload, uploadFile, repoKey])

    // Dialog states
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [moveDialogOpen, setMoveDialogOpen] = useState(false);
    const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
    const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);

    // Generic confirm dialog (delete / purge / empty trash)
    const [confirmState, setConfirmState] = useState<{
        open: boolean;
        title: string;
        description: string;
        destructive?: boolean;
        onConfirm: () => void;
    }>({ open: false, title: "", description: "", onConfirm: () => { } });

    const askConfirm = useCallback((opts: { title: string; description: string; destructive?: boolean; onConfirm: () => void }) => {
        setConfirmState({ open: true, ...opts });
    }, []);

    const setPurgeConfirmOpen = useCallback((_: boolean) => {
        askConfirm({
            title: "Delete forever?",
            description: "This will permanently delete the selected item(s). This action cannot be undone.",
            destructive: true,
            onConfirm: () => purgeFiles(selectedFiles.map(f => f.id)),
        });
    }, [askConfirm, purgeFiles, selectedFiles]);

    const defaultMenus = [
        {
            isGroup: true,
            name: <div className="flex flex-row items-center gap-2 text-nowrap">
                导航
                <Input
                    defaultValue={view === 'search' ? searchKeyword : ''}
                    onChange={(e) => handleSearchInput(e.target.value)}
                    className="h-7"
                    placeholder="Search..."
                />
            </div>,
            children: [
                {
                    name: "Home",
                    id: "home",
                    key: 'home',
                    icon: <HomeIcon className="h-4 w-4" />,
                    onClick: () => {
                        navigateToFolder(props.folderId || "", "Home")
                    }
                },
                {
                    name: "Recent",
                    id: "recent",
                    key: 'recent',
                    icon: <ClockIcon className="h-4 w-4" />,
                    onClick: () => setView('recent')
                },
                {
                    name: "Favorites",
                    id: "Favorites",
                    key: 'Favorites',
                    icon: <StarIcon className="h-4 w-4" />,
                    onClick: () => setView('favorites')
                },
                {
                    name: "Trash",
                    id: "Trash",
                    key: 'Trash',
                    icon: <Trash2 className="h-4 w-4" />,
                    onClick: () => setView('trash')
                }
            ]
        }
    ]


    const handleCreateFile = useCallback((type: 'FOLDER' | 'FILE', name?: string) => {
        if (type === 'FOLDER') {
            // If no name is provided, open the dialog to get a name from user
            if (!name) {
                setCreateFolderDialogOpen(true);
                return;
            }
            createFolder(name, repoKey)
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
    const buildTreeElements = useCallback((items: any[]) => {
        return items.map((item: any) => {
            const resolvedItem = reslove(item);

            // Create a folder element with dropdown menu for folders only
            if (resolvedItem.isFolder) {
                return {
                    ...resolvedItem,
                    // Customize the name to include dropdown menu
                    name: (
                        <div className="flex items-center justify-between flex-1 group">
                            <span className="truncate flex-1">{resolvedItem.name}</span>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <MoreVertical className="h-3 w-3" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-[180px]">
                                    <DropdownMenuItem onClick={() => {
                                        setRenameDialogOpen(true);
                                        // Set the current item to the folder being renamed
                                        setCurrentItem(resolvedItem);
                                    }}>
                                        <Pencil className="h-4 w-4 mr-2" />
                                        Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => {
                                        handleDelete([resolvedItem.id]);
                                    }} className="text-destructive focus:text-destructive">
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    ),
                    onClick: () => {
                        navigateToFolder(resolvedItem.id, resolvedItem.name);
                        setCurrentItem(resolvedItem);
                    },
                };
            }

            // For non-folders, return as is
            return {
                ...resolvedItem,
                onClick: () => {
                    setCurrentItem(resolvedItem);
                },
            };
        });
    }, [reslove, navigateToFolder, setCurrentItem, handleDelete]);

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
                const items = buildTreeElements(res.data);
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
    }, [folderId, buildTreeElements, isInitialLoad])

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
        viewMode,
        setViewMode,
        // Views + trash/favorite/recent/search
        view,
        setView,
        toggleFavorite,
        restoreFiles,
        purgeFiles,
        emptyTrash,
        searchFiles,
        downloadFile,
    }), [selectedFiles, currentFolderId, currentFolderItems, currentItem, selectable, repoKey, handleCreateFile, handleDelete, loading, error, breadcrumbPath, canGoBack, canGoForward, goBack, goForward, navigateToFolder, handleRename, handleMove, handleCopy, handleDuplicate, selectAll, clearSelection, viewMode, view, setView, toggleFavorite, restoreFiles, purgeFiles, emptyTrash, searchFiles, downloadFile])

    // Sidebar content for reuse
    const SidebarContent = useMemo(() => (
        <>
            <div className="bg-muted/80 border-b h-[40px] flex items-center gap-1 px-1 w-full">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={() => {
                        navigateToFolder(props.folderId || "", "Home")
                        if (isMobile) setSidebarOpen(false)
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
                    className={cn("m-0", isMobile ? "w-full" : "w-full")}
                    elements={files}
                    onTreeSelected={() => {
                        if (isMobile) setSidebarOpen(false)
                    }}
                />
            )}
        </>
    ), [sidebarLoading, currentFolderId, files, props.folderId, loading, isMobile, navigateToFolder, handleCreateFile])

    return <FileManageContext.Provider value={contextValue}>
        <div className={cn("rounded-sm flex flex-col border not-prose", props.className)}>
            {/* Toolbar */}
            <div className={cn(
                "w-full bg-muted border-b flex items-center justify-between h-[40px] px-1 relative z-20",
                isMobile && "overflow-x-auto"
            )}>
                <div className="flex items-center h-full gap-1">
                    {/* Mobile menu button */}
                    {isMobile && (
                        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                            <SheetTrigger asChild>
                                <Button size="sm" variant="ghost">
                                    <MenuIcon className="h-4 w-4" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="w-[260px] p-0">
                                <SheetTitle className="sr-only">File Navigation</SheetTitle>
                                <div className="h-full overflow-auto">
                                    {SidebarContent}
                                </div>
                            </SheetContent>
                        </Sheet>
                    )}

                    {!isTrash && (
                        <>
                            <Button size="sm" variant="ghost" onClick={() => handleCreateFile('FILE')} disabled={loading}>
                                <UploadIcon className="-ms-1 me-2 opacity-60 mr-1" size={16} strokeWidth={2} aria-hidden="true" />
                                {!isMobile && "Upload"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleCreateFile('FOLDER')} disabled={loading}>
                                <FolderPlusIcon className="-ms-1 me-2 opacity-60 mr-1" size={16} strokeWidth={2} aria-hidden="true" />
                                {!isMobile && "New Folder"}
                            </Button>
                        </>
                    )}

                    {isTrash && (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => askConfirm({
                                title: "Empty trash?",
                                description: "All items in the trash will be permanently deleted. This cannot be undone.",
                                destructive: true,
                                onConfirm: () => emptyTrash(),
                            })}
                            disabled={loading || currentFolderItems.length === 0}
                        >
                            <Trash2 className="-ms-1 me-2 opacity-60 mr-1 text-destructive" size={16} strokeWidth={2} aria-hidden="true" />
                            {!isMobile && "Empty Trash"}
                        </Button>
                    )}

                    {!isMobile && <Separator orientation="vertical" className="h-6" />}

                    {/* Selection actions */}
                    {!isMobile && (
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
                    )}

                    {selectedFiles.length > 0 && (
                        <>
                            {!isMobile && <Separator orientation="vertical" className="h-6" />}

                            {/* Actions for selected files */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="ghost">
                                        {isMobile ? `(${selectedFiles.length})` : `Actions (${selectedFiles.length})`}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-[180px]">
                                    {isTrash ? (
                                        <>
                                            <DropdownMenuItem onClick={() => restoreFiles(selectedFiles.map(f => f.id))}>
                                                <ArrowLeft className="h-4 w-4 mr-2" />
                                                Restore
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onClick={() => { setPurgeConfirmOpen(true); }}
                                                className="text-destructive focus:text-destructive"
                                            >
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Delete forever
                                            </DropdownMenuItem>
                                        </>
                                    ) : (
                                        <>
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
                                            <DropdownMenuItem
                                                disabled={selectedFiles.every(f => f.isFolder)}
                                                onClick={() => selectedFiles.filter(f => !f.isFolder).forEach(f => downloadFile(f))}
                                            >
                                                <DownloadIcon className="h-4 w-4 mr-2" />
                                                Download
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onClick={() => askConfirm({
                                                    title: `Delete ${selectedFiles.length} item${selectedFiles.length > 1 ? 's' : ''}?`,
                                                    description: "The selected item(s) will be moved to the trash. You can restore them later.",
                                                    destructive: true,
                                                    onConfirm: () => handleDelete(selectedFiles.map(f => f.id)),
                                                })}
                                                className="text-destructive focus:text-destructive"
                                            >
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Delete
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {!isMobile && !isTrash && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => askConfirm({
                                        title: `Delete ${selectedFiles.length} item${selectedFiles.length > 1 ? 's' : ''}?`,
                                        description: "The selected item(s) will be moved to the trash. You can restore them later.",
                                        destructive: true,
                                        onConfirm: () => handleDelete(selectedFiles.map(f => f.id)),
                                    })}
                                    disabled={loading}
                                >
                                    <Trash2 className="-ms-1 me-2 opacity-60 mr-1 text-destructive" size={16} strokeWidth={2} aria-hidden="true" />
                                    Delete
                                </Button>
                            )}
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
                <div className="flex items-center gap-1">
                    <Button
                        size="sm"
                        variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                        onClick={() => handleViewModeChange('grid')}
                        title="Grid view"
                    >
                        <LayoutGridIcon size={16} strokeWidth={2} aria-hidden="true" />
                    </Button>
                    <Button
                        size="sm"
                        variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                        onClick={() => handleViewModeChange('list')}
                        title="List view"
                    >
                        <ListIcon size={16} strokeWidth={2} aria-hidden="true" />
                    </Button>
                </div>
            </div>
            <div className={cn(
                "flex-1 overflow-auto h-[calc(100%-40px)]",
                isMobile ? "flex flex-col" : "grid w-full grid-cols-[250px_1fr]"
            )}>
                {/* Desktop Sidebar */}
                {!isMobile && (
                    <div className="border-r overflow-y-auto h-full w-full">
                        {SidebarContent}
                    </div>
                )}
                <div
                    className={cn(
                        "overflow-auto w-full flex flex-col relative",
                        isMobile ? "flex-1" : "h-full"
                    )}
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {isDragging && canUpload && (
                        <div className="absolute inset-0 z-30 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary pointer-events-none">
                            <div className="flex flex-col items-center gap-2 text-primary">
                                <UploadIcon className="h-8 w-8" />
                                <span className="text-sm font-medium">Drop files to upload</span>
                            </div>
                        </div>
                    )}
                    <div className="w-full border-b bg-muted/50 min-h-[40px] flex items-center justify-between px-2 relative z-10" >
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
                            {/* Breadcrumb / View label */}
                            {view === 'home' ? (
                                <Breadcrumb
                                    items={breadcrumbPath}
                                    onNavigate={navigateToFolder}
                                />
                            ) : (
                                <div className="flex items-center gap-2 text-sm font-medium capitalize">
                                    {view === 'recent' && <ClockIcon className="h-4 w-4" />}
                                    {view === 'favorites' && <StarIcon className="h-4 w-4" />}
                                    {view === 'trash' && <Trash2 className="h-4 w-4" />}
                                    {view === 'search'
                                        ? <span>Search: “{searchKeyword}”</span>
                                        : <span>{view}</span>}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className={cn(
                        "flex-1 overflow-auto",
                        isMobile ? "" : "h-[calc(100%-45px)]"
                    )}>
                        {
                            loading ? (
                                <div className="p-6 space-y-4 animate-in fade-in duration-200">
                                    <div className="flex flex-wrap gap-2">
                                        {[...Array(6)].map((_, i) => (
                                            <Skeleton key={i} className="w-[200px] h-[180px]" />
                                        ))}
                                    </div>
                                </div>
                            ) : error ? (
                                <div className="animate-in fade-in zoom-in-95 duration-300">
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
                                </div>
                            ) : currentFolderItems.length > 0 ? (
                                <div key={currentFolderId} className="animate-in fade-in zoom-in-95 duration-300">
                                    <Menu>
                                        {viewMode === 'grid' ? <FileCardList /> : <FileListView />}
                                    </Menu>
                                </div>
                            ) : (
                                <div className="animate-in fade-in zoom-in-95 duration-300">
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
                                </div>
                            )
                        }
                    </div>
                </div>
            </div>
        </div>

        {/* Dialogs */}
        <CreateFolderDialog
            open={createFolderDialogOpen}
            onOpenChange={setCreateFolderDialogOpen}
            onCreate={(name) => createFolder(name, repoKey)}
        />
        <RenameDialog
            open={renameDialogOpen}
            onOpenChange={setRenameDialogOpen}
            file={(selectedFiles.length === 1 ? selectedFiles[0] : currentItem) as FileItem}
            onConfirm={(file, newName) => {
                // If we have a currentItem (from sidebar), use it; otherwise use selectedFiles
                const targetFile = currentItem || (selectedFiles.length === 1 ? selectedFiles[0] : null);
                if (targetFile) {
                    handleRename(targetFile, newName);
                }
                setRenameDialogOpen(false);
            }}
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

        {/* Generic confirm dialog */}
        <AlertDialog open={confirmState.open} onOpenChange={(open) => setConfirmState(prev => ({ ...prev, open }))}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{confirmState.title}</AlertDialogTitle>
                    <AlertDialogDescription>{confirmState.description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        className={confirmState.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
                        onClick={() => {
                            confirmState.onConfirm();
                            setConfirmState(prev => ({ ...prev, open: false }));
                        }}
                    >
                        Confirm
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </FileManageContext.Provider>
}