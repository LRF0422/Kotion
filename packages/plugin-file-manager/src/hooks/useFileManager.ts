import { useCallback, useEffect, useState, useRef } from 'react';
import {
    useApi,
    useFileService,
    useSafeState,
    useOptionalUploadTaskService,
    type UploadFileHandle,
    type UploadSource,
} from '@kn/common';
import { toast } from '@kn/ui';
import { APIS } from '../api';
import { FileItem, BreadcrumbItem } from '../editor-extensions/component/FileContext';
import { normalizeFileName } from '../utils/fileUtils';

interface UseFileManagerProps {
    initialFolderId?: string;
}

interface FilePickerWindow extends Window {
    showOpenFilePicker?: (options: { multiple: boolean }) => Promise<UploadFileHandle[]>;
}

/** 侧栏视图:普通文件夹浏览 / 最近 / 收藏 / 回收站 / 搜索 */
export type FileView = 'home' | 'recent' | 'favorites' | 'trash' | 'search';

export const useFileManager = ({ initialFolderId = '' }: UseFileManagerProps = {}) => {
    const [currentFolderId, setCurrentFolderId] = useSafeState<string>(initialFolderId);
    const [currentItem, setCurrentItem] = useState<FileItem>();
    const [updateFlag, setUpdateFlag] = useState(0);
    const [currentFolderItems, setCurrentFolderItems] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<FileView>('home');
    const [searchKeyword, setSearchKeyword] = useState('');
    const fileService = useFileService();
    const uploadTaskService = useOptionalUploadTaskService();

    // Navigation state
    const [breadcrumbPath, setBreadcrumbPath] = useState<BreadcrumbItem[]>([{
        id: initialFolderId,
        name: 'Home',
        path: initialFolderId
    }]);
    const navigationHistory = useRef<Array<{ id: string; name: string }>>([{
        id: initialFolderId,
        name: 'Home'
    }]);
    const historyIndex = useRef<number>(0);
    const uploadRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const observedCompletedUploadsRef = useRef<Set<string>>(new Set());

    const resolveFileItem = useCallback((file: any): FileItem => {
        const baseItem: FileItem = {
            id: String(file.id),
            name: normalizeFileName(file.name, file.id),
            isFolder: file.type?.value === 'FOLDER' || file.type === 'FOLDER',
            type: file.type,
            // path may be null when OSS link is unavailable; fall back to fileKey
            // so the frontend can still construct a download URL via the backend.
            path: file.path || file.fileKey,
            size: file.size,
            mediaType: file.mediaType,
            favorite: file.favorite,
            trashed: file.trashed,
            createdAt: file.createTime,
            updatedAt: file.updateTime,
            lastAccessedTime: file.lastAccessedTime,
            trashedTime: file.trashedTime,
        };

        if (file.children) {
            return {
                ...baseItem,
                children: file.children.map((item: any) => resolveFileItem(item)),
            };
        }

        return baseItem;
    }, []);

    /** 静默刷新标记:true 时本次刷新不切换全局 loading,避免列表闪烁 */
    const silentRefreshRef = useRef(false);
    const requestVersionRef = useRef(0);

    useEffect(() => () => {
        requestVersionRef.current += 1;
        if (uploadRefreshTimerRef.current) clearTimeout(uploadRefreshTimerRef.current);
    }, []);

    const refresh = useCallback((opts?: { silent?: boolean }) => {
        silentRefreshRef.current = opts?.silent === true;
        setUpdateFlag((prev) => prev + 1);
    }, []);

    useEffect(() => {
        if (!uploadTaskService) return;
        uploadTaskService.getSnapshot().tasks
            .filter((task) => task.status === 'COMPLETED')
            .forEach((task) => observedCompletedUploadsRef.current.add(task.id));
        return uploadTaskService.subscribe(() => {
            const newlyCompleted = uploadTaskService.getSnapshot().tasks.filter((task) =>
                task.status === 'COMPLETED'
                && !observedCompletedUploadsRef.current.has(task.id)
                && task.destination.parentId === (currentFolderId || '0'));
            if (!newlyCompleted.length) return;
            newlyCompleted.forEach((task) => observedCompletedUploadsRef.current.add(task.id));
            if (uploadRefreshTimerRef.current) clearTimeout(uploadRefreshTimerRef.current);
            uploadRefreshTimerRef.current = setTimeout(() => refresh({ silent: true }), 350);
        });
    }, [currentFolderId, refresh, uploadTaskService]);

    const fetchFolderContents = useCallback(
        async (folderId: string | null) => {
            const requestVersion = ++requestVersionRef.current;
            const silent = silentRefreshRef.current;
            silentRefreshRef.current = false;
            setLoading(!silent);
            setError(null);

            try {
                let res: any;
                switch (view) {
                    case 'recent':
                        res = await useApi(APIS.LIST_RECENT, { limit: 50 });
                        break;
                    case 'favorites':
                        res = await useApi(APIS.LIST_FAVORITES);
                        break;
                    case 'trash':
                        res = await useApi(APIS.LIST_TRASH);
                        break;
                    case 'search':
                        if (!searchKeyword.trim()) {
                            if (requestVersion === requestVersionRef.current) {
                                setCurrentFolderItems([]);
                            }
                            return [];
                        }
                        res = await useApi(APIS.SEARCH_FILES, { keyword: searchKeyword });
                        break;
                    case 'home':
                    default:
                        res = await useApi(APIS.GET_CHILDREN, { folderId: folderId || '0' });
                        break;
                }
                const items = (res?.data || []).map((item: any) => resolveFileItem(item));
                if (requestVersion === requestVersionRef.current) {
                    setCurrentFolderItems(items);
                }
                return items;
            } catch (err) {
                if (requestVersion === requestVersionRef.current) {
                    const errorMessage = err instanceof Error ? err.message : 'Failed to load folder contents';
                    setError(errorMessage);
                    toast.error(errorMessage);
                }
                return [];
            } finally {
                if (requestVersion === requestVersionRef.current) {
                    setLoading(false);
                }
            }
        },
        [resolveFileItem, view, searchKeyword]
    );

    const createFolder = useCallback(
        async (name: string, repoKey: string) => {
            try {
                await useApi(APIS.CREATE_FILE, null, {
                    name,
                    parentId: currentFolderId || '0',
                    type: 'FOLDER',
                    repositoryKey: repoKey,
                });
                refresh({ silent: true });
                toast.success('Folder created successfully');
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Failed to create folder';
                toast.error(errorMessage);
                throw err;
            }
        },
        [currentFolderId, refresh]
    );

    /** Queue files for direct, resumable multipart upload. */
    const uploadFile = useCallback(
        async (repoKey: string, files?: File[]) => {
            let sources: UploadSource[] = [];
            try {
                if (files?.length) {
                    sources = files.map((file) => ({ file }));
                } else {
                    const picker = (window as FilePickerWindow).showOpenFilePicker;
                    if (picker) {
                        const handles = await picker({ multiple: true });
                        sources = await Promise.all(handles.map(async (handle) => ({
                            file: await handle.getFile(),
                            handle,
                        })));
                    } else if (fileService.pickFiles) {
                        const picked = await fileService.pickFiles({ mimeTypes: ['*/*'], multiple: true });
                        sources = picked.map((file) => ({ file }));
                    }
                }
            } catch (pickerError) {
                if (pickerError instanceof DOMException && pickerError.name === 'AbortError') return;
                throw pickerError;
            }

            if (!sources.length) return;
            if (uploadTaskService) {
                const taskIds = await uploadTaskService.enqueue(sources, {
                    parentId: currentFolderId || '0',
                    repositoryKey: repoKey,
                });
                const enqueuedTasks = uploadTaskService.getSnapshot().tasks
                    .filter((task) => taskIds.includes(task.id));
                const queuedCount = enqueuedTasks.filter((task) => task.status !== 'FAILED').length;
                if (queuedCount > 0) {
                    toast.success(`${queuedCount} file${queuedCount > 1 ? 's' : ''} queued for upload`);
                    return;
                }
                const resumableUnavailable = enqueuedTasks.every((task) =>
                    task.errorCode === 'RESUMABLE_UPLOAD_UNAVAILABLE');
                if (!resumableUnavailable || sources.some(({ file }) => file.size > 64 * 1024 * 1024)) return;
                await Promise.all(taskIds.map((taskId) => uploadTaskService.cancel(taskId)));
                taskIds.forEach((taskId) => uploadTaskService.clear(taskId));
                if (!fileService.uploadToFileCenter) throw new Error('uploadToFileCenter not available');
                const legacy = await Promise.allSettled(sources.map(({ file }) =>
                    fileService.uploadToFileCenter?.(file, currentFolderId, repoKey, { forceLegacy: true })));
                if (legacy.some((result) => result.status === 'fulfilled')) refresh({ silent: true });
                if (legacy.some((result) => result.status === 'rejected')) toast.error('One or more uploads failed');
                return;
            }

            if (!fileService.uploadToFileCenter) throw new Error('uploadToFileCenter not available');
            const results = await Promise.allSettled(sources.map(({ file }) =>
                fileService.uploadToFileCenter?.(file, currentFolderId, repoKey)));
            const uploaded = results.filter((result) => result.status === 'fulfilled').length;
            if (uploaded > 0) refresh({ silent: true });
            if (uploaded < sources.length) toast.error(`${sources.length - uploaded} file upload(s) failed`);
        },
        [currentFolderId, fileService, refresh, uploadTaskService]
    );

    /** 删除 → 移入回收站(批量) */
    const deleteFiles = useCallback(async (ids: string[]) => {
        if (!ids.length) return;
        try {
            await Promise.all(ids.map((id) => useApi(APIS.TRASH_FILE, { fileId: id })));
            refresh({ silent: true });
            toast.success(`Moved ${ids.length} item${ids.length > 1 ? 's' : ''} to trash`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to delete';
            toast.error(msg);
            throw err;
        }
    }, [refresh]);

    /** 移动 */
    const moveFiles = useCallback(async (files: FileItem[], targetFolderId: string) => {
        if (!files.length) return;
        try {
            await Promise.all(files.map((f) =>
                useApi(APIS.MOVE_FILE, null, { sourceId: f.id, targetId: targetFolderId })
            ));
            refresh({ silent: true });
            toast.success(`Moved ${files.length} item${files.length > 1 ? 's' : ''}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to move';
            toast.error(msg);
            throw err;
        }
    }, [refresh]);

    /** 复制 / 副本 —— 复制到当前目录 */
    const copyFiles = useCallback(async (files: FileItem[]) => {
        if (!files.length) return;
        try {
            await Promise.all(files.map((f) =>
                useApi(APIS.COPY_FILE, { fileId: f.id, targetParentId: currentFolderId })
            ));
            refresh({ silent: true });
            toast.success(`Copied ${files.length} item${files.length > 1 ? 's' : ''}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to copy';
            toast.error(msg);
            throw err;
        }
    }, [currentFolderId, refresh]);

    const duplicateFiles = copyFiles;

    const renameFile = useCallback(async (file: FileItem, newName: string) => {
        try {
            await useApi(APIS.RENAME_FILE, { fileId: file.id }, { newName });
            refresh({ silent: true });
            toast.success(`${file.isFolder ? 'Folder' : 'File'} renamed successfully`);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : `Failed to rename`;
            toast.error(errorMessage);
            throw err;
        }
    }, [refresh]);

    /** 收藏 / 取消收藏(乐观更新,避免整表刷新闪烁) */
    const toggleFavorite = useCallback(async (file: FileItem) => {
        const next = !(file.favorite === 1);
        setCurrentFolderItems((prev) => {
            // 收藏视图中取消收藏:该项随即不再属于本列表,直接移除
            if (view === 'favorites' && !next) {
                return prev.filter((it) => it.id !== file.id);
            }
            return prev.map((it) => (it.id === file.id ? { ...it, favorite: next ? 1 : 0 } : it));
        });
        try {
            await useApi(APIS.TOGGLE_FAVORITE, { fileId: file.id, favorite: next });
            toast.success(next ? 'Added to favorites' : 'Removed from favorites');
        } catch (err) {
            // 失败时回滚:重新拉取服务端真实状态
            refresh({ silent: true });
            const msg = err instanceof Error ? err.message : 'Failed to update favorite';
            toast.error(msg);
        }
    }, [refresh, view]);

    /** 回收站:还原 */
    const restoreFiles = useCallback(async (ids: string[]) => {
        if (!ids.length) return;
        try {
            await Promise.all(ids.map((id) => useApi(APIS.RESTORE_FILE, { fileId: id })));
            refresh({ silent: true });
            toast.success(`Restored ${ids.length} item${ids.length > 1 ? 's' : ''}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to restore';
            toast.error(msg);
        }
    }, [refresh]);

    /** 回收站:永久删除 */
    const purgeFiles = useCallback(async (ids: string[]) => {
        if (!ids.length) return;
        try {
            await Promise.all(ids.map((id) => useApi(APIS.PURGE_FILE, { fileId: id })));
            refresh({ silent: true });
            toast.success(`Permanently deleted ${ids.length} item${ids.length > 1 ? 's' : ''}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to delete permanently';
            toast.error(msg);
        }
    }, [refresh]);

    /** 清空回收站 */
    const emptyTrash = useCallback(async () => {
        try {
            await useApi(APIS.EMPTY_TRASH);
            refresh({ silent: true });
            toast.success('Trash emptied');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to empty trash';
            toast.error(msg);
        }
    }, [refresh]);

    /** 搜索 */
    const searchFiles = useCallback((keyword: string) => {
        setSearchKeyword(keyword);
        setView('search');
    }, []);

    /** 下载 */
    const downloadFile = useCallback(async (file: FileItem) => {
        if (file.isFolder) {
            toast.info('Cannot download a folder');
            return;
        }
        try {
            if (file.path && fileService.download) {
                await fileService.download(file.path);
            } else if (fileService.getDownloadUrl) {
                window.open(fileService.getDownloadUrl(file.path || ''), '_blank');
            }
            // 标记最近访问
            useApi(APIS.GET_BY_ID, { fileId: file.id }).catch(() => { });
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to download';
            toast.error(msg);
        }
    }, [fileService]);

    // Navigation functions
    const navigateToFolder = useCallback((folderId: string, folderName: string = 'Folder') => {
        const normalizedFolderId = String(folderId);
        setView('home');
        setCurrentFolderId(normalizedFolderId);

        const newHistoryItem = { id: normalizedFolderId, name: folderName };
        const newHistory = navigationHistory.current.slice(0, historyIndex.current + 1);
        newHistory.push(newHistoryItem);
        navigationHistory.current = newHistory;
        historyIndex.current = newHistory.length - 1;

        setBreadcrumbPath((current) => {
            const existingIndex = current.findIndex(item => item.id === normalizedFolderId);
            if (existingIndex >= 0) return current.slice(0, existingIndex + 1);
            return [...current, {
                id: normalizedFolderId,
                name: folderName,
                path: normalizedFolderId,
            }];
        });
    }, [setCurrentFolderId]);

    const goBack = useCallback(() => {
        if (historyIndex.current > 0) {
            historyIndex.current -= 1;
            const historyItem = navigationHistory.current[historyIndex.current];
            setView('home');
            setCurrentFolderId(historyItem.id);
            setBreadcrumbPath((current) => {
                const breadcrumbIndex = current.findIndex(item => item.id === historyItem.id);
                return breadcrumbIndex >= 0 ? current.slice(0, breadcrumbIndex + 1) : current;
            });
        }
    }, [setCurrentFolderId]);

    const goForward = useCallback(() => {
        if (historyIndex.current < navigationHistory.current.length - 1) {
            historyIndex.current += 1;
            const historyItem = navigationHistory.current[historyIndex.current];
            setView('home');
            setCurrentFolderId(historyItem.id);
            setBreadcrumbPath((current) => {
                const existingIndex = current.findIndex(item => item.id === historyItem.id);
                if (existingIndex >= 0) return current.slice(0, existingIndex + 1);
                return [...current, {
                    id: historyItem.id,
                    name: historyItem.name,
                    path: historyItem.id,
                }];
            });
        }
    }, [setCurrentFolderId]);

    const canGoBack = historyIndex.current > 0;
    const canGoForward = historyIndex.current < navigationHistory.current.length - 1;

    // 切换 view / 关键词 / 文件夹 / 刷新标记 时重新拉取
    useEffect(() => {
        fetchFolderContents(currentFolderId || null);
    }, [currentFolderId, updateFlag, view, searchKeyword, fetchFolderContents]);

    return {
        currentFolderId,
        setCurrentFolderId,
        currentItem,
        setCurrentItem,
        currentFolderItems,
        loading,
        error,
        view,
        setView,
        searchKeyword,
        createFolder,
        uploadFile,
        deleteFiles,
        refreshFolder: refresh,
        // Navigation
        breadcrumbPath,
        canGoBack,
        canGoForward,
        goBack,
        goForward,
        navigateToFolder,
        // File operations
        renameFile,
        moveFiles,
        copyFiles,
        duplicateFiles,
        toggleFavorite,
        restoreFiles,
        purgeFiles,
        emptyTrash,
        searchFiles,
        downloadFile,
    };
};
