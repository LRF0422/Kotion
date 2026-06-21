import {
    FileIcon, FolderIcon, FolderOpenIcon, FolderPlusIcon, UploadIcon, Trash2,
    ListIcon, LayoutGridIcon, ArrowLeft, ArrowRight, Menu as MenuIcon,
    Search, ClockIcon, StarIcon,
} from "@kn/icon";
import {
    Button, EmptyState, Input, Separator, cn, Skeleton,
    Sheet, SheetContent, SheetTrigger, SheetTitle,
    AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
    AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
    useResponsive,
} from "@kn/ui";
import React, { useCallback, useEffect, useState, useMemo } from "react";
import { useSafeState, useApi } from "@kn/common";
import { APIS } from "../../api";
import { Menu } from "./Menu";
import { FileCardList } from "./FileCard";
import { FileListView } from "./FileList";
import { FileSidebar } from "./FileSidebar";
import { SelectionBar } from "./SelectionBar";
import { Breadcrumb } from "./Breadcrumb";
import {
    FileItem, FileManageContext, FileView, SortBy, SortOrder, ViewMode,
} from "./FileContext";
import { useFileManager } from "../../hooks/useFileManager";
import { useFileSelection } from "../../hooks/useFileSelection";
import { isPreviewable } from "../../utils/fileUtils";
import { RenameDialog, MoveDialog, FileDetailsDialog, CreateFolderDialog, FilePreviewDialog } from "./dialogs";

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

const VIEW_META: Record<Exclude<FileView, 'home' | 'search'>, { label: string; icon: React.ReactNode }> = {
    recent: { label: 'Recent', icon: <ClockIcon className="h-4 w-4" /> },
    favorites: { label: 'Favorites', icon: <StarIcon className="h-4 w-4" /> },
    trash: { label: 'Trash', icon: <Trash2 className="h-4 w-4" /> },
};

export const FileManagerView: React.FC<FileManagerProps> = (props) => {
    const { isMobileOrTablet: isTouch } = useResponsive();
    const { selectable = false, onCancel, onConfirm, onViewModeChange } = props;

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [viewMode, setViewModeState] = useState<ViewMode>(props.defaultViewMode || 'grid');
    const [sortBy, setSortBy] = useState<SortBy>('name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

    const [selectedFiles, setSelectFiles] = useSafeState<FileItem[]>([]);
    const [repoKey] = useState<string>("");
    const [treeElements, setTreeElements] = useSafeState<any[]>([]);
    const [sidebarLoading, setSidebarLoading] = useState(true);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const { folderId } = props;

    const {
        currentFolderId, setCurrentFolderId, currentItem, setCurrentItem,
        currentFolderItems, loading, error,
        createFolder, uploadFile, deleteFiles, refreshFolder,
        breadcrumbPath, canGoBack, canGoForward, goBack: goBackRaw, goForward: goForwardRaw,
        navigateToFolder: navigateRaw,
        renameFile, moveFiles, copyFiles, duplicateFiles,
        view, setView: setViewRaw, searchKeyword,
        toggleFavorite, restoreFiles, purgeFiles, emptyTrash, searchFiles, downloadFile,
    } = useFileManager({ initialFolderId: props.folderId || "" });

    const isTrash = view === 'trash';
    const canUpload = view === 'home';

    const { isSelected, selectItem } = useFileSelection(selectedFiles, setSelectFiles);
    const clearSelection = useCallback(() => setSelectFiles([]), [setSelectFiles]);

    // ---- view mode / sorting ----
    const setViewMode = useCallback((mode: ViewMode) => {
        setViewModeState(mode);
        onViewModeChange?.(mode);
    }, [onViewModeChange]);

    const setSort = useCallback((by: SortBy) => {
        if (by === sortBy) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
        else { setSortBy(by); setSortOrder('asc'); }
    }, [sortBy]);

    const sortedItems = useMemo(() => {
        const arr = [...currentFolderItems];
        arr.sort((a, b) => {
            if (a.isFolder && !b.isFolder) return -1;
            if (!a.isFolder && b.isFolder) return 1;
            let c = 0;
            if (sortBy === 'name') c = a.name.localeCompare(b.name);
            else if (sortBy === 'size') c = (a.size || 0) - (b.size || 0);
            else c = new Date(a.updatedAt || a.createdAt || 0).getTime() - new Date(b.updatedAt || b.createdAt || 0).getTime();
            return sortOrder === 'asc' ? c : -c;
        });
        return arr;
    }, [currentFolderItems, sortBy, sortOrder]);

    const selectAll = useCallback(() => setSelectFiles([...sortedItems]), [sortedItems, setSelectFiles]);

    // ---- navigation wrappers (clear selection on context change) ----
    const navigateToFolder = useCallback((id: string, name?: string) => {
        clearSelection();
        navigateRaw(id, name);
    }, [clearSelection, navigateRaw]);

    const setView = useCallback((v: FileView) => {
        clearSelection();
        setViewRaw(v);
    }, [clearSelection, setViewRaw]);

    const goBack = useCallback(() => { clearSelection(); goBackRaw(); }, [clearSelection, goBackRaw]);
    const goForward = useCallback(() => { clearSelection(); goForwardRaw(); }, [clearSelection, goForwardRaw]);
    const goHome = useCallback(() => navigateToFolder(props.folderId || "", "Home"), [navigateToFolder, props.folderId]);

    // ---- centralized dialogs ----
    const [renameTarget, setRenameTarget] = useState<FileItem | null>(null);
    const [moveTargets, setMoveTargets] = useState<FileItem[]>([]);
    const [detailsTarget, setDetailsTarget] = useState<FileItem | null>(null);
    const [previewTarget, setPreviewTarget] = useState<FileItem | null>(null);
    const [createFolderOpen, setCreateFolderOpen] = useState(false);
    const [confirmState, setConfirmState] = useState<{
        open: boolean; title: string; description: string; destructive?: boolean; onConfirm: () => void;
    }>({ open: false, title: "", description: "", onConfirm: () => { } });

    const askConfirm = useCallback((opts: { title: string; description: string; destructive?: boolean; onConfirm: () => void }) => {
        setConfirmState({ open: true, ...opts });
    }, []);

    const requestRename = useCallback((file: FileItem) => setRenameTarget(file), []);
    const requestMove = useCallback((files: FileItem[]) => setMoveTargets(files), []);
    const requestDetails = useCallback((file: FileItem) => setDetailsTarget(file), []);
    const requestPreview = useCallback((file: FileItem) => setPreviewTarget(file), []);

    const requestDelete = useCallback((files: FileItem[]) => {
        const n = files.length;
        askConfirm({
            title: `Delete ${n} item${n > 1 ? 's' : ''}?`,
            description: "The selected item(s) will be moved to the trash. You can restore them later.",
            destructive: true,
            onConfirm: () => { deleteFiles(files.map(f => f.id)); clearSelection(); },
        });
    }, [askConfirm, deleteFiles, clearSelection]);

    const requestPurge = useCallback((files: FileItem[]) => {
        askConfirm({
            title: "Delete forever?",
            description: "This will permanently delete the selected item(s). This action cannot be undone.",
            destructive: true,
            onConfirm: () => { purgeFiles(files.map(f => f.id)); clearSelection(); },
        });
    }, [askConfirm, purgeFiles, clearSelection]);

    // ---- open (double-click / touch tap) ----
    const openItem = useCallback((item: FileItem) => {
        if (isTrash) return;
        if (item.isFolder) navigateToFolder(item.id, item.name);
        else if (isPreviewable(item.name)) setPreviewTarget(item);
        else downloadFile(item);
    }, [isTrash, navigateToFolder, downloadFile]);

    // ---- create / operations ----
    const handleCreateFile = useCallback((type: 'FOLDER' | 'FILE', name?: string) => {
        if (type === 'FOLDER') {
            if (!name) { setCreateFolderOpen(true); return; }
            createFolder(name, repoKey);
        } else {
            uploadFile(repoKey);
        }
    }, [createFolder, uploadFile, repoKey]);

    const handleDelete = useCallback((ids: string[]) => deleteFiles(ids), [deleteFiles]);
    const handleRename = useCallback((file: FileItem, newName: string) => renameFile(file, newName), [renameFile]);
    const handleMove = useCallback((files: FileItem[], target: string) => moveFiles(files, target), [moveFiles]);
    const handleCopy = useCallback((files: FileItem[]) => copyFiles(files), [copyFiles]);
    const handleDuplicate = useCallback((files: FileItem[]) => duplicateFiles(files), [duplicateFiles]);

    // ---- drag & drop upload ----
    const [isDragging, setIsDragging] = useState(false);
    const dragDepth = React.useRef(0);
    const handleDragEnter = useCallback((e: React.DragEvent) => {
        if (!canUpload || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
        e.preventDefault(); dragDepth.current += 1; setIsDragging(true);
    }, [canUpload]);
    const handleDragOver = useCallback((e: React.DragEvent) => {
        if (!canUpload) return;
        if (Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault();
    }, [canUpload]);
    const handleDragLeave = useCallback(() => {
        if (!canUpload) return;
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) { dragDepth.current = 0; setIsDragging(false); }
    }, [canUpload]);
    const handleDrop = useCallback((e: React.DragEvent) => {
        if (!canUpload) return;
        e.preventDefault(); dragDepth.current = 0; setIsDragging(false);
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length) uploadFile(repoKey, files);
    }, [canUpload, uploadFile, repoKey]);

    // ---- sidebar search (debounced) ----
    const searchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleSearchInput = useCallback((value: string) => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            const kw = value.trim();
            clearSelection();
            if (kw) searchFiles(kw);
            else navigateRaw(props.folderId || "", "Home");
        }, 350);
    }, [searchFiles, navigateRaw, props.folderId, clearSelection]);

    // ---- build sidebar folder tree ----
    const resolveTree = useCallback((file: any): any => {
        const node = {
            id: file.id,
            name: file.name,
            isFolder: file.type?.value === 'FOLDER' || file.type === 'FOLDER',
            icon: (file.type?.value === 'FOLDER' || file.type === 'FOLDER')
                ? <FolderIcon className="h-4 w-4" /> : <FileIcon className="h-4 w-4" />,
            onClick: () => {
                if (file.type?.value === 'FOLDER' || file.type === 'FOLDER') navigateToFolder(file.id, file.name);
            },
        };
        if (file.children) return { ...node, children: file.children.map(resolveTree) };
        return node;
    }, [navigateToFolder]);

    useEffect(() => {
        const fetchTree = async () => {
            if (isInitialLoad) setSidebarLoading(true);
            try {
                const api = folderId ? APIS.GET_CHILDREN : APIS.GET_ROOT_FOLDER;
                const params = folderId ? { folderId } : undefined;
                const res = await useApi(api, params);
                setTreeElements((res.data || []).map(resolveTree));
            } catch (err) {
                console.error('Failed to load folders:', err);
            } finally {
                if (isInitialLoad) { setSidebarLoading(false); setIsInitialLoad(false); }
            }
        };
        fetchTree();
    }, [folderId, resolveTree, isInitialLoad, setTreeElements]);

    const contextValue = useMemo(() => ({
        selectable,
        onConfirmSelectable: onConfirm,
        isTouch,
        currentFolderItems, sortedItems,
        selectedFiles, setSelectFiles,
        currentFolderId, setCurrentFolderId, currentItem, setCurrentItem,
        repoKey,
        handleUpload: handleCreateFile, handleDelete,
        loading, error,
        breadcrumbPath, canGoBack, canGoForward, goBack, goForward, navigateToFolder,
        handleRename, handleMove, handleCopy, handleDuplicate,
        selectItem, isSelected, selectAll, clearSelection, openItem,
        requestRename, requestMove, requestDetails, requestPreview, requestDelete, requestPurge,
        viewMode, setViewMode, sortBy, sortOrder, setSort,
        view, setView, toggleFavorite, restoreFiles, purgeFiles, emptyTrash, searchFiles, downloadFile,
    }), [
        selectable, onConfirm, isTouch, currentFolderItems, sortedItems, selectedFiles, setSelectFiles,
        currentFolderId, setCurrentFolderId, currentItem, setCurrentItem, repoKey, handleCreateFile, handleDelete,
        loading, error, breadcrumbPath, canGoBack, canGoForward, goBack, goForward, navigateToFolder,
        handleRename, handleMove, handleCopy, handleDuplicate, selectItem, isSelected, selectAll, clearSelection,
        openItem, requestRename, requestMove, requestDetails, requestPreview, requestDelete, requestPurge,
        viewMode, setViewMode, sortBy, sortOrder, setSort, view, setView, toggleFavorite, restoreFiles,
        purgeFiles, emptyTrash, searchFiles, downloadFile,
    ]);

    const sidebar = (
        <FileSidebar
            view={view}
            currentFolderId={currentFolderId}
            treeElements={treeElements}
            loading={sidebarLoading}
            onHome={() => { goHome(); if (isTouch) setSidebarOpen(false); }}
            onSelectView={(v) => setView(v)}
            onAfterNavigate={() => { if (isTouch) setSidebarOpen(false); }}
        />
    );

    return (
        <FileManageContext.Provider value={contextValue}>
            <div className={cn("flex flex-col rounded-lg border overflow-hidden not-prose bg-background", props.className)}>
                {/* ===== Single command bar ===== */}
                <div className="relative z-20 flex h-12 w-full items-center gap-1 border-b bg-background px-2">
                    {/* left: nav */}
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                        {isTouch && (
                            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                                <SheetTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0">
                                        <MenuIcon className="h-4 w-4" />
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="left" className="w-[280px] p-0">
                                    <SheetTitle className="sr-only">File navigation</SheetTitle>
                                    {sidebar}
                                </SheetContent>
                            </Sheet>
                        )}
                        <div className="flex flex-shrink-0 items-center">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goBack} disabled={!canGoBack || loading} title="Back">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goForward} disabled={!canGoForward || loading} title="Forward">
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </div>
                        <Separator orientation="vertical" className="mx-1 h-5 flex-shrink-0" />
                        <div className="min-w-0 flex-1 overflow-hidden">
                            {view === 'home' ? (
                                <Breadcrumb items={breadcrumbPath} onNavigate={navigateToFolder} />
                            ) : (
                                <div className="flex items-center gap-2 px-1 text-sm font-medium">
                                    {view === 'search'
                                        ? <><Search className="h-4 w-4" /><span className="truncate">“{searchKeyword}”</span></>
                                        : <>{VIEW_META[view as keyof typeof VIEW_META]?.icon}<span>{VIEW_META[view as keyof typeof VIEW_META]?.label}</span></>}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* right: search + view toggle + actions */}
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                        <div className="relative hidden sm:block">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                defaultValue={view === 'search' ? searchKeyword : ''}
                                onChange={(e) => handleSearchInput(e.target.value)}
                                className="h-8 w-[150px] pl-8 lg:w-[200px]"
                                placeholder="Search files…"
                            />
                        </div>

                        <div className="flex items-center overflow-hidden rounded-md border">
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn("h-8 w-8 rounded-none", viewMode === 'grid' && "bg-accent text-accent-foreground")}
                                onClick={() => setViewMode('grid')}
                                title="Grid view"
                            >
                                <LayoutGridIcon className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn("h-8 w-8 rounded-none", viewMode === 'list' && "bg-accent text-accent-foreground")}
                                onClick={() => setViewMode('list')}
                                title="List view"
                            >
                                <ListIcon className="h-4 w-4" />
                            </Button>
                        </div>

                        {isTrash ? (
                            <Button
                                size="sm" variant="outline" className="h-8 gap-1.5"
                                onClick={() => askConfirm({
                                    title: "Empty trash?",
                                    description: "All items in the trash will be permanently deleted. This cannot be undone.",
                                    destructive: true,
                                    onConfirm: () => emptyTrash(),
                                })}
                                disabled={loading || currentFolderItems.length === 0}
                            >
                                <Trash2 className="h-4 w-4 text-destructive" />
                                <span className="hidden md:inline">Empty Trash</span>
                            </Button>
                        ) : (
                            <>
                                <Button
                                    size="sm" variant="outline" className="h-8 gap-1.5"
                                    onClick={() => handleCreateFile('FILE')}
                                    disabled={loading}
                                >
                                    <UploadIcon className="h-4 w-4" />
                                    <span className="hidden md:inline">Upload</span>
                                </Button>
                                <Button
                                    size="sm" className="h-8 gap-1.5"
                                    onClick={() => handleCreateFile('FOLDER')}
                                    disabled={loading}
                                >
                                    <FolderPlusIcon className="h-4 w-4" />
                                    <span className="hidden md:inline">New Folder</span>
                                </Button>
                            </>
                        )}

                        {selectable && (
                            <Button size="sm" variant="ghost" className="h-8" onClick={() => onCancel?.()}>
                                Cancel
                            </Button>
                        )}
                    </div>
                </div>

                {/* ===== Body: sidebar + content ===== */}
                <div className="flex min-h-0 flex-1">
                    {!isTouch && (
                        <div className="h-full w-[230px] flex-shrink-0 border-r">
                            {sidebar}
                        </div>
                    )}

                    <div
                        className="relative flex min-w-0 flex-1 flex-col overflow-hidden"
                        onDragEnter={handleDragEnter}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        {isDragging && canUpload && (
                            <div className="absolute inset-0 z-40 m-2 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10 pointer-events-none">
                                <div className="flex flex-col items-center gap-2 text-primary">
                                    <UploadIcon className="h-8 w-8" />
                                    <span className="text-sm font-medium">Drop files to upload</span>
                                </div>
                            </div>
                        )}

                        <div className="min-h-0 flex-1 overflow-auto">
                            {loading ? (
                                viewMode === 'grid' ? (
                                    <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2 p-4">
                                        {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-[132px] rounded-xl" />)}
                                    </div>
                                ) : (
                                    <div className="flex flex-col">
                                        {[...Array(10)].map((_, i) => (
                                            <div key={i} className="flex h-11 items-center gap-3 border-b px-3">
                                                <Skeleton className="h-5 w-5 rounded" />
                                                <Skeleton className="h-4 max-w-[240px] flex-1" />
                                                <Skeleton className="h-4 w-[60px]" />
                                            </div>
                                        ))}
                                    </div>
                                )
                            ) : error ? (
                                <EmptyState
                                    icons={[FolderOpenIcon]}
                                    title="Error loading files"
                                    description={error}
                                    className="h-full w-full max-w-none rounded-none border-none"
                                    action={{ label: 'Retry', onClick: refreshFolder }}
                                />
                            ) : sortedItems.length > 0 ? (
                                <Menu>
                                    <div key={`${view}-${currentFolderId}`} className="h-full animate-in fade-in duration-150">
                                        {viewMode === 'grid' ? <FileCardList /> : <FileListView />}
                                    </div>
                                </Menu>
                            ) : (
                                <EmptyState
                                    icons={[FolderOpenIcon]}
                                    title={isTrash ? "Trash is empty" : "No files yet"}
                                    description={isTrash ? "" : "Upload files or create a folder to get started."}
                                    className="h-full w-full max-w-none rounded-none border-none"
                                    action={!isTrash ? { label: 'Upload Files', onClick: () => handleCreateFile('FILE') } : undefined}
                                />
                            )}
                        </div>

                        <SelectionBar />
                    </div>
                </div>
            </div>

            {/* ===== Dialogs ===== */}
            <CreateFolderDialog
                open={createFolderOpen}
                onOpenChange={setCreateFolderOpen}
                onCreate={(name) => createFolder(name, repoKey)}
            />
            <RenameDialog
                open={!!renameTarget}
                onOpenChange={(o) => !o && setRenameTarget(null)}
                file={renameTarget}
                onConfirm={(file, newName) => { handleRename(file, newName); setRenameTarget(null); }}
            />
            <MoveDialog
                open={moveTargets.length > 0}
                onOpenChange={(o) => !o && setMoveTargets([])}
                files={moveTargets}
                onConfirm={(files, target) => { handleMove(files, target); setMoveTargets([]); clearSelection(); }}
                currentFolderId={currentFolderId}
            />
            <FileDetailsDialog
                open={!!detailsTarget}
                onOpenChange={(o) => !o && setDetailsTarget(null)}
                file={detailsTarget}
            />
            <FilePreviewDialog
                open={!!previewTarget}
                onOpenChange={(o) => !o && setPreviewTarget(null)}
                file={previewTarget}
                onDownload={downloadFile}
            />

            <AlertDialog open={confirmState.open} onOpenChange={(open) => setConfirmState((p) => ({ ...p, open }))}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirmState.title}</AlertDialogTitle>
                        <AlertDialogDescription>{confirmState.description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className={confirmState.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
                            onClick={() => { confirmState.onConfirm(); setConfirmState((p) => ({ ...p, open: false })); }}
                        >
                            Confirm
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </FileManageContext.Provider>
    );
};
