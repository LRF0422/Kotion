import {
    FolderIcon, FolderOpenIcon, FolderPlusIcon, UploadIcon, Trash2,
    ListIcon, LayoutGridIcon, ArrowLeft, ArrowRight, Menu as MenuIcon,
    Search, ClockIcon, StarIcon,
} from "@kn/icon";
import {
    Button, Input, Separator, cn, Skeleton,
    Sheet, SheetContent, SheetTrigger, SheetTitle,
    Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
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
import { isPreviewable, normalizeFileName } from "../../utils/fileUtils";
import {
    isItemSelectable as matchesSelectionPolicy,
    normalizeConfirmedSelection,
    reconcileSelectedFiles,
} from "../../utils/file-selection";
import { RenameDialog, MoveDialog, FileDetailsDialog, CreateFolderDialog, FilePreviewDialog } from "./dialogs";
import { useI18n } from "../../i18n/use-i18n";
import { FileManagerEmptyState } from "./FileManagerEmptyState";

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
    const { isMobile, isTablet, isMobileOrTablet: isTouch } = useResponsive();
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
    const [tabletSidebarCollapsed, setTabletSidebarCollapsed] = useState(false);
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
            if (sortBy === 'name') c = normalizeFileName(a.name, a.id).localeCompare(normalizeFileName(b.name, b.id));
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
        else if (isPreviewable(item.name, item.mediaType)) setPreviewTarget(item);
        else downloadFile(item);
    }, [isTrash, navigateToFolder, downloadFile]);

    // ---- create / operations ----
    const handleCreateFile = useCallback((type: 'FOLDER' | 'FILE', name?: string) => {
        if (!canUpload) return;
        if (type === 'FOLDER') {
            if (!name) { setCreateFolderOpen(true); return; }
            createFolder(name, repoKey);
        } else {
            uploadFile(repoKey);
        }
    }, [canUpload, createFolder, uploadFile, repoKey]);

    const handleDelete = useCallback((ids: string[]) => deleteFiles(ids), [deleteFiles]);
    const handleRename = useCallback((file: FileItem, newName: string) => renameFile(file, newName), [renameFile]);
    const handleMove = useCallback((files: FileItem[], target: string) => moveFiles(files, target), [moveFiles]);
    const handleCopy = useCallback((files: FileItem[]) => copyFiles(files), [copyFiles]);
    const handleDuplicate = useCallback((files: FileItem[]) => duplicateFiles(files), [duplicateFiles]);

    // ---- drag & drop upload ----
    const [isDragging, setIsDragging] = useState(false);
    const dragDepth = React.useRef(0);
    const handleDragEnter = useCallback((e: React.DragEvent) => {
        if (!Array.from(e.dataTransfer.types || []).includes('Files')) return;
        e.preventDefault();
        if (!canUpload) return;
        dragDepth.current += 1; setIsDragging(true);
    }, [canUpload]);
    const handleDragOver = useCallback((e: React.DragEvent) => {
        if (!Array.from(e.dataTransfer.types || []).includes('Files')) return;
        e.preventDefault();
    }, []);
    const handleDragLeave = useCallback(() => {
        if (!canUpload) return;
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) { dragDepth.current = 0; setIsDragging(false); }
    }, [canUpload]);
    const handleDrop = useCallback((e: React.DragEvent) => {
        if (!Array.from(e.dataTransfer.types || []).includes('Files')) return;
        e.preventDefault();
        if (!canUpload) return;
        dragDepth.current = 0; setIsDragging(false);
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
        const id = String(file.id);
        const name = normalizeFileName(file.name, file.id);
        return {
            id,
            name,
            isFolder: true,
            icon: <FolderIcon className="h-4 w-4" />,
            onClick: () => navigateToFolder(id, name),
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

    const renderSidebar = (options?: { collapsed?: boolean; collapsible?: boolean }) => (
        <FileSidebar
            view={view}
            currentFolderId={currentFolderId}
            rootFolderId={props.folderId || ''}
            treeElements={treeElements}
            loading={sidebarLoading}
            selectable={selectable}
            collapsed={options?.collapsed}
            collapsible={options?.collapsible}
            onToggleCollapsed={() => setTabletSidebarCollapsed((collapsed) => !collapsed)}
            onHome={() => {
                goHome();
                if (isMobile) setSidebarOpen(false);
            }}
            onSelectView={(nextView) => setView(nextView)}
            onAfterNavigate={() => {
                if (isMobile) setSidebarOpen(false);
            }}
        />
    );

    return (
        <FileManageContext.Provider value={contextValue}>
            <div className={cn("flex flex-col overflow-hidden rounded-lg border bg-background not-prose", props.className)}>
                <TooltipProvider delayDuration={250}>
                    <div className="relative z-20 grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 border-b bg-background px-2 py-1.5 lg:min-h-12 lg:grid-cols-[minmax(0,1fr)_220px_auto_auto] lg:gap-x-1.5 lg:py-1">
                        <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-0.5 lg:col-start-1 lg:row-start-1">
                            {isMobile && showSidebar && (
                                <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <SheetTrigger asChild>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-11 w-11 flex-shrink-0 rounded-lg transition-colors duration-150 active:bg-muted/70 motion-reduce:transition-none lg:h-8 lg:w-8"
                                                    aria-label={t('toolbar.fileNavigation')}
                                                >
                                                    <MenuIcon className="h-4 w-4" />
                                                </Button>
                                            </SheetTrigger>
                                        </TooltipTrigger>
                                        <TooltipContent>{t('toolbar.fileNavigation')}</TooltipContent>
                                    </Tooltip>
                                    <SheetContent side="left" className="w-[min(84vw,288px)] p-0 [&>button]:h-11 [&>button]:w-11">
                                        <SheetTitle className="sr-only">{t('toolbar.fileNavigation')}</SheetTitle>
                                        <div className="h-full pb-safe pt-safe">{renderSidebar()}</div>
                                    </SheetContent>
                                </Sheet>
                            )}
                            <div className="flex flex-shrink-0 items-center">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-11 w-11 rounded-lg transition-colors duration-150 active:bg-muted/70 motion-reduce:transition-none lg:h-8 lg:w-8"
                                            onClick={goBack}
                                            disabled={!canGoBack || loading}
                                            aria-label={t('toolbar.back')}
                                        >
                                            <ArrowLeft className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t('toolbar.back')}</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-11 w-11 rounded-lg transition-colors duration-150 active:bg-muted/70 motion-reduce:transition-none lg:h-8 lg:w-8"
                                            onClick={goForward}
                                            disabled={!canGoForward || loading}
                                            aria-label={t('toolbar.forward')}
                                        >
                                            <ArrowRight className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t('toolbar.forward')}</TooltipContent>
                                </Tooltip>
                            </div>
                            <Separator orientation="vertical" className="mx-1 hidden h-5 flex-shrink-0 md:block" />
                            <div className="min-w-0 flex-1 overflow-hidden">
                                {view === 'home' ? (
                                    <Breadcrumb
                                        items={breadcrumbPath}
                                        onNavigate={navigateToFolder}
                                        maxItems={isMobile ? 3 : isTablet ? 4 : 5}
                                        showHomeLabel={!isMobile}
                                    />
                                ) : (
                                    <div className="flex min-w-0 items-center gap-2 px-1 text-sm font-medium">
                                        {view === 'search'
                                            ? <><Search className="h-4 w-4 flex-shrink-0" /><span className="truncate">“{searchKeyword}”</span></>
                                            : <>{VIEW_META[view as keyof typeof VIEW_META]?.icon}<span className="truncate">{t(VIEW_LABEL_KEY[view as keyof typeof VIEW_LABEL_KEY])}</span></>}
                                    </div>
                                )}
                            </div>
                            <div
                                data-file-manager-upload-task-slot=""
                                className="ml-2 hidden h-8 flex-shrink-0 items-center justify-end lg:flex"
                            />
                        </div>

                        <div className="col-start-2 row-start-1 flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5 lg:col-start-3 lg:row-start-1">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className={cn(
                                            "h-11 w-11 rounded-md outline-none transition-colors duration-150 active:bg-muted/70 motion-reduce:transition-none lg:h-8 lg:w-8",
                                            viewMode === 'grid'
                                                ? "bg-background text-foreground ring-1 ring-inset ring-border hover:bg-background"
                                                : "text-muted-foreground hover:text-foreground",
                                        )}
                                        onClick={() => setViewMode('grid')}
                                        aria-label={t('toolbar.gridView')}
                                        aria-pressed={viewMode === 'grid'}
                                    >
                                        <LayoutGridIcon className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('toolbar.gridView')}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className={cn(
                                            "h-11 w-11 rounded-md outline-none transition-colors duration-150 active:bg-muted/70 motion-reduce:transition-none lg:h-8 lg:w-8",
                                            viewMode === 'list'
                                                ? "bg-background text-foreground ring-1 ring-inset ring-border hover:bg-background"
                                                : "text-muted-foreground hover:text-foreground",
                                        )}
                                        onClick={() => setViewMode('list')}
                                        aria-label={t('toolbar.listView')}
                                        aria-pressed={viewMode === 'list'}
                                    >
                                        <ListIcon className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('toolbar.listView')}</TooltipContent>
                            </Tooltip>
                        </div>

                        <div className="relative col-start-1 row-start-2 min-w-0 lg:col-start-2 lg:row-start-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                defaultValue={view === 'search' ? searchKeyword : ''}
                                onChange={(event) => handleSearchInput(event.target.value)}
                                className="h-11 w-full rounded-lg border-transparent bg-muted/60 pl-9 shadow-none transition-colors duration-150 hover:bg-muted focus-visible:border-input focus-visible:bg-background motion-reduce:transition-none lg:h-8 lg:w-[220px] lg:rounded-md"
                                placeholder={t('toolbar.searchPlaceholder')}
                            />
                        </div>

                        <div className="col-start-2 row-start-2 flex flex-shrink-0 items-center justify-end gap-1 lg:col-start-4 lg:row-start-1">
                            {!selectable && (isTrash ? (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-11 w-11 gap-1.5 rounded-lg px-0 text-destructive transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive active:bg-destructive/15 motion-reduce:transition-none lg:h-8 lg:w-auto lg:px-3"
                                            onClick={() => askConfirm({
                                                title: t('confirm.emptyTrashTitle'),
                                                description: t('confirm.emptyTrashDescription'),
                                                destructive: true,
                                                onConfirm: () => emptyTrash(),
                                            })}
                                            disabled={loading || currentFolderItems.length === 0}
                                            aria-label={t('toolbar.emptyTrash')}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            <span className="hidden lg:inline">{t('toolbar.emptyTrash')}</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t('toolbar.emptyTrash')}</TooltipContent>
                                </Tooltip>
                            ) : (
                                <>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-11 w-11 gap-1.5 rounded-lg px-0 text-muted-foreground transition-colors duration-150 hover:text-foreground active:bg-muted/70 motion-reduce:transition-none lg:h-8 lg:w-auto lg:px-3"
                                                onClick={() => handleCreateFile('FILE')}
                                                disabled={loading || !canUpload}
                                                aria-label={t('toolbar.upload')}
                                            >
                                                <UploadIcon className="h-4 w-4" />
                                                <span className="hidden lg:inline">{t('toolbar.upload')}</span>
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{t('toolbar.upload')}</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-11 w-11 gap-1.5 rounded-lg px-0 shadow-none transition-colors duration-150 active:bg-muted/70 motion-reduce:transition-none lg:h-8 lg:w-auto lg:px-3"
                                                onClick={() => handleCreateFile('FOLDER')}
                                                disabled={loading || !canUpload}
                                                aria-label={t('toolbar.newFolder')}
                                            >
                                                <FolderPlusIcon className="h-4 w-4" />
                                                <span className="hidden lg:inline">{t('toolbar.newFolder')}</span>
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{t('toolbar.newFolder')}</TooltipContent>
                                    </Tooltip>
                                </>
                            ))}

                            {selectable && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-11 rounded-lg px-3 transition-colors duration-150 active:bg-muted/70 motion-reduce:transition-none lg:h-8"
                                    onClick={() => onCancel?.()}
                                >
                                    {t('toolbar.cancel')}
                                </Button>
                            )}
                        </div>
                    </div>
                </TooltipProvider>

                <div className="flex min-h-0 flex-1">
                    {showSidebar && isTablet && (
                        <div
                            className={cn(
                                "h-full flex-shrink-0 overflow-hidden border-r transition-[width] duration-150 ease-out motion-reduce:transition-none",
                                tabletSidebarCollapsed ? "w-[52px]" : "w-56",
                            )}
                        >
                            {renderSidebar({ collapsed: tabletSidebarCollapsed, collapsible: true })}
                        </div>
                    )}
                    {showSidebar && !isMobile && !isTablet && (
                        <div className="h-full w-[230px] flex-shrink-0 border-r">
                            {renderSidebar()}
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
                                <FileManagerEmptyState
                                    icon={FolderOpenIcon}
                                    title={t('emptyState.errorLoading')}
                                    description={error}
                                    tone="error"
                                    className="h-full rounded-none border-0"
                                    action={{ label: t('emptyState.retry'), onClick: refreshFolder }}
                                />
                            ) : sortedItems.length > 0 ? (
                                <Menu>
                                    <div key={`${view}-${currentFolderId}`} className="h-full animate-in fade-in duration-150">
                                        {viewMode === 'grid' ? <FileCardList /> : <FileListView />}
                                    </div>
                                </Menu>
                            ) : (
                                <FileManagerEmptyState
                                    icon={FolderOpenIcon}
                                    title={isTrash ? t('emptyState.trashEmpty') : t('emptyState.noFiles')}
                                    description={isTrash ? undefined : t('emptyState.noFilesDescription')}
                                    className="h-full rounded-none border-0"
                                    action={canUpload ? { label: t('emptyState.uploadFiles'), onClick: () => handleCreateFile('FILE') } : undefined}
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
