import { useCallback, useEffect, useState, useRef } from 'react';
import {
    useApi,
    useFileService,
    useSafeState,
    useOptionalUploadTaskService,
    type UploadDestination,
    type UploadFileHandle,
    type UploadSource,
} from '@kn/common';
import { toast } from '@kn/ui';
import { APIS } from '../api';
import { useDownloadFile } from './useDownloadFile';
import { FileItem, BreadcrumbItem } from '../editor-extensions/component/FileContext';
import { normalizeFileName } from '../utils/fileUtils';
import {
    groupFilesByDirectory,
    pickFolderSelection,
    planFolderUpload,
    type FolderUploadResult,
    type FolderUploadSelection,
} from '../utils/folder-upload';

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
                        // Scope the search to the folder currently being browsed;
                        // the file-center service filters by folder subtree server-side.
                        res = await useApi(APIS.SEARCH_FILES, { keyword: searchKeyword, folderId: folderId || '0' });
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

    /**
     * Create a single folder record (no toast / refresh).
     *
     * Resolves once the request succeeds (the interceptor already rejects real
     * failures). The new id is returned when the backend provides one, but its
     * absence must not be reported as a creation failure — older backends only
     * return a bare success envelope.
     */
    const createFolderNode = useCallback(
        async (name: string, parentId: string, repoKey: string): Promise<string | undefined> => {
            const res = await useApi(APIS.CREATE_FILE, null, {
                name,
                parentId: parentId || '0',
                type: 'FOLDER',
                repositoryKey: repoKey,
            });
            const createdId = res?.data?.id ?? res?.data?.fileId ?? res?.data?.folderId;
            return createdId === undefined || createdId === null || createdId === ''
                ? undefined
                : String(createdId);
        },
        []
    );

    const createFolder = useCallback(
        async (name: string, repoKey: string) => {
            try {
                await createFolderNode(name, currentFolderId || '0', repoKey);
                refresh({ silent: true });
                toast.success('Folder created successfully');
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Failed to create folder';
                toast.error(errorMessage);
                throw err;
            }
        },
        [createFolderNode, currentFolderId, refresh]
    );

    /** Resolve upload sources from an explicit file list or the OS file picker. */
    const pickUploadSources = useCallback(async (files?: File[]): Promise<UploadSource[]> => {
        try {
            if (files?.length) return files.map((file) => ({ file }));
            const pickerWindow = window as FilePickerWindow;
            if (pickerWindow.showOpenFilePicker) {
                // Call on `window`: detached File System Access methods throw Illegal invocation.
                const handles = await pickerWindow.showOpenFilePicker({ multiple: true });
                return await Promise.all(handles.map(async (handle) => ({
                    file: await handle.getFile(),
                    handle,
                })));
            }
            if (fileService.pickFiles) {
                const picked = await fileService.pickFiles({ mimeTypes: ['*/*'], multiple: true });
                return picked.map((file) => ({ file }));
            }
            return [];
        } catch (pickerError) {
            if (pickerError instanceof DOMException && pickerError.name === 'AbortError') return [];
            throw pickerError;
        }
    }, [fileService]);

    /** Queue/upload sources into one destination, falling back to the legacy endpoint for small files. */
    const enqueueUploadSources = useCallback(async (
        sources: UploadSource[],
        destination: UploadDestination,
    ): Promise<{ queued: number; uploaded: number; failed: number; taskIds: string[] }> => {
        if (!sources.length) return { queued: 0, uploaded: 0, failed: 0, taskIds: [] };

        if (uploadTaskService) {
            const taskIds = await uploadTaskService.enqueue(sources, destination);
            const enqueuedTasks = uploadTaskService.getSnapshot().tasks
                .filter((task) => taskIds.includes(task.id));
            const queued = enqueuedTasks.filter((task) => task.status !== 'FAILED').length;
            if (queued > 0) return { queued, uploaded: 0, failed: sources.length - queued, taskIds };

            const resumableUnavailable = enqueuedTasks.every((task) =>
                task.errorCode === 'RESUMABLE_UPLOAD_UNAVAILABLE');
            if (!resumableUnavailable || sources.some(({ file }) => file.size > 64 * 1024 * 1024)) {
                return { queued: 0, uploaded: 0, failed: sources.length, taskIds: [] };
            }
            await Promise.all(taskIds.map((taskId) => uploadTaskService.cancel(taskId)));
            taskIds.forEach((taskId) => uploadTaskService.clear(taskId));
            if (!fileService.uploadToFileCenter) throw new Error('uploadToFileCenter not available');
            const legacy = await Promise.allSettled(sources.map(({ file }) =>
                fileService.uploadToFileCenter?.(file, destination.parentId, destination.repositoryKey, { forceLegacy: true })));
            const uploaded = legacy.filter((result) => result.status === 'fulfilled').length;
            return { queued: 0, uploaded, failed: sources.length - uploaded, taskIds: [] };
        }

        if (!fileService.uploadToFileCenter) throw new Error('uploadToFileCenter not available');
        const results = await Promise.allSettled(sources.map(({ file }) =>
            fileService.uploadToFileCenter?.(file, destination.parentId, destination.repositoryKey)));
        const uploaded = results.filter((result) => result.status === 'fulfilled').length;
        return { queued: 0, uploaded, failed: sources.length - uploaded, taskIds: [] };
    }, [fileService, uploadTaskService]);

    /** Queue files for direct, resumable multipart upload. */
    const uploadFile = useCallback(
        async (repoKey: string, files?: File[]) => {
            const sources = await pickUploadSources(files);
            if (!sources.length) return;
            const outcome = await enqueueUploadSources(sources, {
                parentId: currentFolderId || '0',
                repositoryKey: repoKey,
            });
            if (outcome.queued > 0) {
                toast.success(`${outcome.queued} file${outcome.queued > 1 ? 's' : ''} queued for upload`);
            }
            if (outcome.uploaded > 0) refresh({ silent: true });
            if (outcome.failed > 0 && outcome.queued === 0) {
                toast.error(`${outcome.failed} file upload(s) failed`);
            }
        },
        [currentFolderId, enqueueUploadSources, pickUploadSources, refresh]
    );

    /**
     * Upload a local folder, recreating its directory tree under the current folder.
     * Pass `selection` to upload an already-collected tree (e.g. a dropped folder),
     * or omit it to open the OS folder picker.
     */
    const uploadFolder = useCallback(
        async (repoKey: string, selection?: FolderUploadSelection): Promise<FolderUploadResult | null> => {
            let resolved: FolderUploadSelection | null | undefined = selection;
            let progressToastId: string | number | undefined;

            const showPreparing = () => {
                progressToastId = toast.loading(
                    selection ? 'Preparing folder upload…' : 'Reading folder contents…',
                );
            };
            const settle = (message: string, type: 'success' | 'error' | 'info') => {
                const id = progressToastId;
                progressToastId = undefined;
                if (type === 'success') toast.success(message, id === undefined ? undefined : { id });
                else if (type === 'error') toast.error(message, id === undefined ? undefined : { id });
                else toast.info(message, id === undefined ? undefined : { id });
            };
            let preparationPaused = false;
            let preparationCancelled = false;
            let preparationWaiters: Array<() => void> = [];
            const wakePreparation = () => {
                const waiters = preparationWaiters;
                preparationWaiters = [];
                waiters.forEach((resolve) => resolve());
            };
            /** Block the preparation loop while paused; returns immediately once cancelled. */
            const waitWhilePaused = async () => {
                while (preparationPaused && !preparationCancelled) {
                    await new Promise<void>((resolve) => preparationWaiters.push(resolve));
                }
            };

            /** Mirror preparation progress on the toast and in the upload panel. */
            const publishPreparation = (label: string, current: number, total: number) => {
                if (total <= 0) return;
                uploadTaskService?.setPreparation({
                    label,
                    done: current,
                    total,
                    paused: preparationPaused,
                    onPause: () => { preparationPaused = true; publishPreparation(label, current, total); },
                    onResume: () => {
                        preparationPaused = false;
                        publishPreparation(label, current, total);
                        wakePreparation();
                    },
                    onCancel: () => {
                        preparationCancelled = true;
                        publishPreparation(label, current, total);
                        wakePreparation();
                    },
                });
                if (progressToastId !== undefined) {
                    toast.loading(
                        `${label}… ${current}/${total}${preparationPaused ? ' (paused)' : ''}`,
                        { id: progressToastId },
                    );
                }
            };
            const showFolderProgress = (current: number, total: number, name?: string) => {
                publishPreparation(name ? `Creating folder “${name}”` : 'Creating folders', current, total);
            };
            /** Tasks queued by this folder upload, so cancelling can stop them too. */
            const folderTaskIds: string[] = [];
            const cancelFolderTasks = async () => {
                if (!uploadTaskService || !folderTaskIds.length) return;
                await Promise.all(folderTaskIds.map((taskId) => uploadTaskService.cancel(taskId)));
            };

            if (!resolved) {
                try {
                    resolved = await pickFolderSelection(showPreparing);
                } catch (pickerError) {
                    settle(pickerError instanceof Error ? pickerError.message : 'Failed to pick folder', 'error');
                    return null;
                }
            } else {
                showPreparing();
            }
            if (!resolved) {
                if (progressToastId !== undefined) toast.dismiss(progressToastId);
                return null; // user cancelled the folder picker
            }

            const plan = planFolderUpload(resolved);
            if (!plan.directories.length && !plan.files.length) {
                settle('No files found in the selected folder', 'info');
                return null;
            }

            try {
                const childrenByParent = new Map<string, FileItem[]>();
                childrenByParent.set(currentFolderId || '0', currentFolderItems);
                const folderIdByPath = new Map<string, string>();

                const listChildren = async (parentId: string, force = false): Promise<FileItem[]> => {
                    if (!force) {
                        const cached = childrenByParent.get(parentId);
                        if (cached) return cached;
                    }
                    const res = await useApi(APIS.GET_CHILDREN, { folderId: parentId || '0' });
                    const items = (res?.data || []).map((item: any) => resolveFileItem(item));
                    childrenByParent.set(parentId, items);
                    return items;
                };

                let foldersCreated = 0;
                const totalFolders = plan.directories.length;
                for (const [index, directory] of plan.directories.entries()) {
                    await waitWhilePaused();
                    if (preparationCancelled) {
                        await cancelFolderTasks();
                        refresh({ silent: true });
                        settle('Folder upload cancelled', 'info');
                        return null;
                    }
                    showFolderProgress(index + 1, totalFolders, directory.name);
                    const parentId = directory.parentPath
                        ? folderIdByPath.get(directory.parentPath)
                        : (currentFolderId || '0');
                    if (!parentId) continue;
                    let siblings = await listChildren(parentId);
                    const existing = siblings.find((item) =>
                        item.isFolder && normalizeFileName(item.name, item.id) === directory.name);
                    let folderId: string | undefined;
                    if (existing) {
                        folderId = existing.id;
                    } else {
                        folderId = await createFolderNode(directory.name, parentId, repoKey);
                        if (folderId) {
                            siblings.push({ id: folderId, name: directory.name, isFolder: true, type: { value: 'FOLDER' } });
                        } else {
                            // Backend did not return the new id; recover it from a fresh listing.
                            siblings = await listChildren(parentId, true);
                            folderId = siblings.find((item) =>
                                item.isFolder && normalizeFileName(item.name, item.id) === directory.name)?.id;
                        }
                        foldersCreated += 1;
                    }
                    if (!folderId) {
                        throw new Error('Failed to create folder');
                    }
                    folderIdByPath.set(directory.path, folderId);
                }
                showFolderProgress(totalFolders, totalFolders);
                if (plan.files.length > 0) {
                    publishPreparation('Queueing files for upload', 0, plan.files.length);
                }

                let filesQueued = 0;
                let filesUploaded = 0;
                let filesFailed = 0;
                for (const group of groupFilesByDirectory(plan.files)) {
                    await waitWhilePaused();
                    if (preparationCancelled) {
                        await cancelFolderTasks();
                        settle('Folder upload cancelled', 'info');
                        return null;
                    }
                    const parentId = group.directoryPath
                        ? folderIdByPath.get(group.directoryPath)
                        : (currentFolderId || '0');
                    if (!parentId) {
                        filesFailed += group.files.length;
                        continue;
                    }
                    const outcome = await enqueueUploadSources(
                        group.files.map((file) => ({ file })),
                        { parentId, repositoryKey: repoKey },
                    );
                    folderTaskIds.push(...outcome.taskIds);
                    filesQueued += outcome.queued;
                    filesUploaded += outcome.uploaded;
                    filesFailed += outcome.failed;
                }

                if (preparationCancelled) {
                    await cancelFolderTasks();
                    settle('Folder upload cancelled', 'info');
                    return null;
                }

                refresh({ silent: true });

                const folderCount = plan.directories.length;
                const fileCount = plan.files.length;
                if (filesQueued > 0) {
                    const folderNote = folderCount > 0
                        ? ` in ${folderCount} folder${folderCount === 1 ? '' : 's'}`
                        : '';
                    settle(`${filesQueued} file${filesQueued > 1 ? 's' : ''} queued for upload${folderNote}`, 'success');
                } else if (filesUploaded > 0) {
                    settle(`Uploaded ${filesUploaded} file${filesUploaded > 1 ? 's' : ''}`, 'success');
                } else if (filesFailed > 0) {
                    settle(`${filesFailed} file upload${filesFailed > 1 ? 's' : ''} failed`, 'error');
                } else if (fileCount === 0 && folderCount > 0) {
                    settle(`Created ${folderCount} folder${folderCount === 1 ? '' : 's'}`, 'success');
                }
                if (filesFailed > 0 && (filesQueued > 0 || filesUploaded > 0)) {
                    toast.error(`${filesFailed} file upload${filesFailed > 1 ? 's' : ''} failed`);
                }
                return { foldersCreated, filesQueued, filesUploaded, filesFailed };
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to upload folder';
                settle(message, 'error');
                return null;
            } finally {
                uploadTaskService?.setPreparation(null);
            }
        },
        [createFolderNode, currentFolderId, currentFolderItems, enqueueUploadSources, refresh, resolveFileItem, uploadTaskService]
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
    const runDownload = useDownloadFile();
    const downloadFile = useCallback(async (file: FileItem) => {
        if (file.isFolder) {
            toast.info('Cannot download a folder');
            return;
        }
        await runDownload({ id: file.id, name: file.name, path: file.path, size: file.size });
        // 标记最近访问
        useApi(APIS.GET_BY_ID, { fileId: file.id }).catch(() => { });
    }, [runDownload]);

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
        uploadFolder,
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
