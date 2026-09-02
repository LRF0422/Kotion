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
import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { logger, useSafeState, useApi } from "@kn/common";
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
import {
    isItemSelectable as matchesSelectionPolicy,
    normalizeConfirmedSelection,
    reconcileSelectedFiles,
} from "../../utils/file-selection";
import { RenameDialog, MoveDialog, FileDetailsDialog, CreateFolderDialog, FilePreviewDialog } from "./dialogs";
import { useI18n } from "../../i18n/use-i18n";

export interface FileManagerProps {
    folderId?: string
    className?: string
    selectable?: boolean
    onCancel?: () => void
    onConfirm?: (files: FileItem[]) => void
    multiple?: boolean
    target?: 'folder' | 'file' | 'both'
    accept?: string[]
    defaultViewMode?: ViewMode
    onViewModeChange?: (mode: ViewMode) => void
    showSidebar?: boolean
}

const VIEW_META: Record<Exclude<FileView, 'home' | 'search'>, { icon: React.ReactNode }> = {
    recent: { icon: <ClockIcon className="h-4 w-4" /> },
    favorites: { icon: <StarIcon className="h-4 w-4" /> },
    trash: { icon: <Trash2 className="h-4 w-4" /> },
};

const VIEW_LABEL_KEY: Record<Exclude<FileView, 'home' | 'search'>, string> = {
    recent: 'views.recent',
    favorites: 'views.favorites',
    trash: 'views.trash',
};

const EMPTY_ACCEPT: string[] = [];

export const FileManagerView: React.FC<FileManagerProps> = (props) => {
    const { isMobileOrTablet: isTouch } = useResponsive();
    const {
        selectable = false,
        onCancel,
        onConfirm,
        onViewModeChange,
        showSidebar = true,
        target = 'both',
    } = props;
    const accept = props.accept ?? EMPTY_ACCEPT;
    const multiple = selectable ? (props.multiple ?? false) : true;
    const { t } = useI18n();

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [viewMode, setViewModeState] = useState<ViewMode>(props.defaultViewMode || 'grid');
    const [sortBy, setSortBy] = useState<SortBy>('name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

    const [selectedFiles, setSelectFiles] = useSafeState<FileItem[]>([]);
    const [repoKey] = useState<string>("");
    const [rawTreeItems, setRawTreeItems] = useState<any[]>([]);
    const [sidebarLoading, setSidebarLoading] = useState(showSidebar);
    const sidebarRequestVersion = useRef(0);
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
    const canUpload = !selectable && view === 'home';
    const selectionPolicy = useMemo(
        () => ({ target, accept, multiple }),
        [target, accept, multiple],
    );
    const itemIsSelectable = useCallback(
        (item: FileItem) => !selectable || matchesSelectionPolicy(item, selectionPolicy),
        [selectable, selectionPolicy],
    );
    const { isSelected, selectItem } = useFileSelection(selectedFiles, setSelectFiles, {
        multiple,
        isItemSelectable: itemIsSelectable,
    });
    const clearSelection = useCallback(() => setSelectFiles([]), [setSelectFiles]);
    const confirmSelection = useCallback(
        (files: FileItem[]) => onConfirm?.(normalizeConfirmedSelection(files, selectionPolicy)),
        [onConfirm, selectionPolicy],
    );

    useEffect(() => {
        setSelectFiles((current) => {
            const reconciled = reconcileSelectedFiles(current, currentFolderItems);
            const unchanged = reconciled.length === current.length
                && reconciled.every((file, index) => file === current[index]);
            return unchanged ? current : reconciled;
        });
    }, [currentFolderItems, setSelectFiles]);

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

    const selectAll = useCallback(() => {
        const selectableItems = sortedItems.filter(itemIsSelectable);
        setSelectFiles(multiple ? selectableItems : selectableItems.slice(0, 1));
    }, [itemIsSelectable, multiple, setSelectFiles, sortedItems]);

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
    const goHome = useCallback(() => navigateToFolder(props.folderId || "", t('sidebar.home')), [navigateToFolder, props.folderId, t]);

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
            title: t('confirm.deleteTitle', { count: n }),
            description: t('confirm.deleteDescription'),
            destructive: true,
            onConfirm: () => { deleteFiles(files.map(f => f.id)); clearSelection(); },
        });
    }, [askConfirm, deleteFiles, clearSelection, t]);

    const requestPurge = useCallback((files: FileItem[]) => {
        askConfirm({
            title: t('confirm.purgeTitle'),
            description: t('confirm.purgeDescription'),
            destructive: true,
            onConfirm: () => { purgeFiles(files.map(f => f.id)); clearSelection(); },
        });
    }, [askConfirm, purgeFiles, clearSelection, t]);

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
            else navigateRaw(props.folderId || "", t('sidebar.home'));
        }, 350);
    }, [searchFiles, navigateRaw, props.folderId, clearSelection, t]);

    useEffect(() => () => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
    }, []);

    // ---- build sidebar folder tree ----
    const resolveTree = useCallback((file: any): any => {
        const children = Array.isArray(file.children)
            ? file.children
                .filter((child: any) => child.type?.value === 'FOLDER' || child.type === 'FOLDER')
                .map(resolveTree)
            : undefined;
        return {
            id: String(file.id),
            name: file.name,
            isFolder: true,
            icon: <FolderIcon className="h-4 w-4" />,
            onClick: () => navigateToFolder(String(file.id), file.name),
            ...(children?.length ? { children } : {}),
        };
    }, [navigateToFolder]);

    const treeElements = useMemo(
        () => rawTreeItems
            .filter((file) => file.type?.value === 'FOLDER' || file.type === 'FOLDER')
            .map(resolveTree),
        [rawTreeItems, resolveTree],
    );

    useEffect(() => {
        const requestVersion = ++sidebarRequestVersion.current;
        if (!showSidebar) {
            setRawTreeItems([]);
            setSidebarLoading(false);
            return;
        }

        setSidebarLoading(true);
        const fetchTree = async () => {
            try {
                const api = folderId ? APIS.GET_CHILDREN : APIS.GET_ROOT_FOLDER;
                const params = folderId ? { folderId } : undefined;
                const res = await useApi(api, params);
                if (requestVersion === sidebarRequestVersion.current) {
                    setRawTreeItems(res.data || []);
                }
            } catch (err) {
                if (requestVersion === sidebarRequestVersion.current) {
                    logger.error('Failed to load file-manager folders', err);
                    setRawTreeItems([]);
                }
            } finally {
                if (requestVersion === sidebarRequestVersion.current) {
                    setSidebarLoading(false);
                }
            }
        };
        fetchTree();

        return () => {
            if (requestVersion === sidebarRequestVersion.current) {
                sidebarRequestVersion.current += 1;
            }
        };
    }, [folderId, showSidebar]);

    const contextValue = useMemo(() => ({
        selectable,
        multiple,
        target,
        accept,
        onConfirmSelectable: confirmSelection,
        isItemSelectable: itemIsSelectable,
        t,
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
        selectable, multiple, target, accept, confirmSelection, itemIsSelectable, t, isTouch,
        currentFolderItems, sortedItems, selectedFiles, setSelectFiles,
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
            selectable={selectable}
            onHome={() => { goHome(); if (isTouch) setSidebarOpen(false); }}
            onSelectView={(v) => setView(v)}
            onAfterNavigate={() => { if (isTouch) setSidebarOpen(false); }}
        />
    );

    return (
        <FileManageContext.Provider value={contextValue}>
            <div className={cn("flex flex-col rounded-lg border overflow-hidden not-prose bg-background", props.className)}>
                {/* ===== Single command bar ===== */}
                <div className="relative z-20 flex min-h-14 w-full items-center gap-1 border-b bg-background px-2 lg:min-h-12">
                    {/* left: nav */}
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                        {isTouch && showSidebar && (
                            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                                <SheetTrigger asChild>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-11 w-11 flex-shrink-0 lg:h-8 lg:w-8"
                                        aria-label={t('toolbar.fileNavigation')}
                                    >
                                        <MenuIcon className="h-4 w-4" />
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="left" className="w-[280px] p-0">
                                    <SheetTitle className="sr-only">{t('toolbar.fileNavigation')}</SheetTitle>
                                    {sidebar}
                                </SheetContent>
                            </Sheet>
                        )}
                        <div className="flex flex-shrink-0 items-center">
                            <Button variant="ghost" size="icon" className="h-11 w-11 lg:h-8 lg:w-8" onClick={goBack} disabled={!canGoBack || loading} aria-label={t('toolbar.back')}>
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-11 w-11 lg:h-8 lg:w-8" onClick={goForward} disabled={!canGoForward || loading} aria-label={t('toolbar.forward')}>
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
                                        : <>{VIEW_META[view as keyof typeof VIEW_META]?.icon}<span>{t(VIEW_LABEL_KEY[view as keyof typeof VIEW_LABEL_KEY])}</span></>}
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
                                className="h-11 w-[160px] rounded-md border-transparent bg-muted/60 pl-8 shadow-none transition-colors hover:bg-muted focus-visible:border-input focus-visible:bg-background lg:h-8 lg:w-[220px]"
                                placeholder={t('toolbar.searchPlaceholder')}
                            />
                        </div>

                        {/* Notion 风格分段切换 */}
                        <div className="flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5">
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    "h-11 w-11 rounded lg:h-7 lg:w-7",
                                    viewMode === 'grid'
                                        ? "bg-background text-foreground shadow-sm hover:bg-background"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                                onClick={() => setViewMode('grid')}
                                aria-label={t('toolbar.gridView')}
                                aria-pressed={viewMode === 'grid'}
                            >
                                <LayoutGridIcon className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    "h-11 w-11 rounded lg:h-7 lg:w-7",
                                    viewMode === 'list'
                                        ? "bg-background text-foreground shadow-sm hover:bg-background"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                                onClick={() => setViewMode('list')}
                                aria-label={t('toolbar.listView')}
                                aria-pressed={viewMode === 'list'}
                            >
                                <ListIcon className="h-4 w-4" />
                            </Button>
                        </div>

                        {!selectable && (isTrash ? (
                            <Button
                                size="sm" variant="ghost"
                                className="h-11 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive lg:h-8"
                                onClick={() => askConfirm({
                                    title: t('confirm.emptyTrashTitle'),
                                    description: t('confirm.emptyTrashDescription'),
                                    destructive: true,
                                    onConfirm: () => emptyTrash(),
                                })}
                                disabled={loading || currentFolderItems.length === 0}
                            >
                                <Trash2 className="h-4 w-4" />
                                <span className="hidden md:inline">{t('toolbar.emptyTrash')}</span>
                            </Button>
                        ) : (
                            <>
                                <Button
                                    size="sm" variant="ghost"
                                    className="h-11 gap-1.5 text-muted-foreground hover:text-foreground lg:h-8"
                                    onClick={() => handleCreateFile('FILE')}
                                    disabled={loading}
                                >
                                    <UploadIcon className="h-4 w-4" />
                                    <span className="hidden md:inline">{t('toolbar.upload')}</span>
                                </Button>
                                <Button
                                    size="sm" className="h-11 gap-1.5 lg:h-8"
                                    onClick={() => handleCreateFile('FOLDER')}
                                    disabled={loading}
                                >
                                    <FolderPlusIcon className="h-4 w-4" />
                                    <span className="hidden md:inline">{t('toolbar.newFolder')}</span>
                                </Button>
                            </>
                        ))}

                        {selectable && (
                            <Button size="sm" variant="ghost" className="h-11 lg:h-8" onClick={() => onCancel?.()}>
                                {t('toolbar.cancel')}
                            </Button>
                        )}
                    </div>
                </div>

                {/* ===== Body: sidebar + content ===== */}
                <div className="flex min-h-0 flex-1">
                    {!isTouch && showSidebar && (
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
                            <div className="pointer-events-none absolute inset-0 z-40 m-2 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/50 bg-primary/5">
                                <div className="flex flex-col items-center gap-3 text-primary">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                                        <UploadIcon className="h-6 w-6" />
                                    </div>
                                    <span className="text-sm font-medium">{t('toolbar.dropFiles')}</span>
                                </div>
                            </div>
                        )}

                        <div className="min-h-0 flex-1 overflow-auto">
                            {loading ? (
                                viewMode === 'grid' ? (
                                    <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 p-3">
                                        {[...Array(10)].map((_, i) => (
                                            <div key={i} className="flex flex-col rounded-lg p-1.5">
                                                <Skeleton className="h-24 w-full rounded-md" />
                                                <Skeleton className="mx-auto mt-2 h-3 w-3/4" />
                                                <Skeleton className="mx-auto mt-1 h-3 w-1/3" />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-0.5 p-1.5">
                                        {[...Array(10)].map((_, i) => (
                                            <div key={i} className="flex h-10 items-center gap-2.5 rounded-md px-2">
                                                <Skeleton className="h-6 w-6 rounded-md" />
                                                <Skeleton className="h-4 max-w-[240px] flex-1" />
                                                <Skeleton className="h-3 w-12" />
                                            </div>
                                        ))}
                                    </div>
                                )
                            ) : error ? (
                                <EmptyState
                                    icons={[FolderOpenIcon]}
                                    title={t('emptyState.errorLoading')}
                                    description={error}
                                    className="h-full w-full max-w-none rounded-none border-none"
                                    action={{ label: t('emptyState.retry'), onClick: refreshFolder }}
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
                                    title={isTrash ? t('emptyState.trashEmpty') : t('emptyState.noFiles')}
                                    description={isTrash ? "" : t('emptyState.noFilesDescription')}
                                    className="h-full w-full max-w-none rounded-none border-none"
                                    action={!isTrash && !selectable ? { label: t('emptyState.uploadFiles'), onClick: () => handleCreateFile('FILE') } : undefined}
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
                        <AlertDialogCancel>{t('confirm.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            className={confirmState.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
                            onClick={() => { confirmState.onConfirm(); setConfirmState((p) => ({ ...p, open: false })); }}
                        >
                            {t('confirm.confirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </FileManageContext.Provider>
    );
};
