import { useCallback, useEffect, useState, useRef } from 'react';
import { useApi, useFileService, useSafeState } from '@kn/common';
import { toast } from '@kn/ui';
import { APIS } from '../api';
import { FileItem, BreadcrumbItem } from '../editor-extensions/component/FileContext';

interface UseFileManagerProps {
    initialFolderId?: string;
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

    const reslove = useCallback((file: any): FileItem => {
        const baseItem: FileItem = {
            id: file.id,
            name: file.name,
            isFolder: file.type?.value === 'FOLDER' || file.type === 'FOLDER',
            type: file.type,
            path: file.path,
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
                children: file.children.map((item: any) => reslove(item)),
            };
        }

        return baseItem;
    }, []);

    const refresh = useCallback(() => setUpdateFlag((prev) => prev + 1), []);

    const fetchFolderContents = useCallback(
        async (folderId: string | null) => {
            setLoading(true);
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
                            setCurrentFolderItems([]);
                            return [];
                        }
                        res = await useApi(APIS.SEARCH_FILES, { keyword: searchKeyword });
                        break;
                    case 'home':
                    default:
                        if (folderId) {
                            res = await useApi(APIS.GET_CHILDREN, { folderId });
                        } else {
                            res = await useApi(APIS.GET_ROOT_FOLDER);
                        }
                        break;
                }
                const items = (res?.data || []).map((item: any) => reslove(item));
                setCurrentFolderItems(items);
                return items;
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Failed to load folder contents';
                setError(errorMessage);
                toast.error(errorMessage);
                return [];
            } finally {
                setLoading(false);
            }
        },
        [reslove, view, searchKeyword]
    );

    const createFolder = useCallback(
        async (name: string, repoKey: string) => {
            try {
                await useApi(APIS.CREATE_FILE, null, {
                    name,
                    parentId: currentFolderId,
                    type: 'FOLDER',
                    repositoryKey: repoKey,
                });
                refresh();
                toast.success('Folder created successfully');
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Failed to create folder';
                toast.error(errorMessage);
                throw err;
            }
        },
        [currentFolderId, refresh]
    );

    /** 上传:走后端单步 /file/upload(multipart),一次完成 OSS + 建记录。
     *  files 为空时弹文件选择器(按钮触发);非空时直接上传(拖拽触发)。 */
    const uploadFile = useCallback(
        async (repoKey: string, files?: File[]) => {
            const toUpload = files && files.length > 0
                ? files
                : (fileService.pickFiles ? await fileService.pickFiles() : []);

            if (!toUpload.length) return;

            const promise = Promise.all(
                toUpload.map((file) =>
                    fileService.uploadToFileCenter
                        ? fileService.uploadToFileCenter(file, currentFolderId, repoKey)
                        : Promise.reject(new Error('uploadToFileCenter not available'))
                )
            );

            toast.promise(promise, {
                loading: `Uploading ${toUpload.length} file${toUpload.length > 1 ? 's' : ''}...`,
                success: 'Uploaded successfully',
                error: 'Upload failed',
            });

            await promise;
            refresh();
        },
        [currentFolderId, fileService, refresh]
    );

    /** 删除 → 移入回收站(批量) */
    const deleteFiles = useCallback(async (ids: string[]) => {
        if (!ids.length) return;
        try {
            await Promise.all(ids.map((id) => useApi(APIS.TRASH_FILE, { fileId: id })));
            refresh();
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
            refresh();
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
            refresh();
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
            refresh();
            toast.success(`${file.isFolder ? 'Folder' : 'File'} renamed successfully`);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : `Failed to rename`;
            toast.error(errorMessage);
            throw err;
        }
    }, [refresh]);

    /** 收藏 / 取消收藏 */
    const toggleFavorite = useCallback(async (file: FileItem) => {
        const next = !(file.favorite === 1);
        try {
            await useApi(APIS.TOGGLE_FAVORITE, { fileId: file.id, favorite: next });
            refresh();
            toast.success(next ? 'Added to favorites' : 'Removed from favorites');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to update favorite';
            toast.error(msg);
        }
    }, [refresh]);

    /** 回收站:还原 */
    const restoreFiles = useCallback(async (ids: string[]) => {
        if (!ids.length) return;
        try {
            await Promise.all(ids.map((id) => useApi(APIS.RESTORE_FILE, { fileId: id })));
            refresh();
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
            refresh();
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
            refresh();
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
        setView('home');
        setCurrentFolderId(folderId);

        const newHistoryItem = { id: folderId, name: folderName };
        const newHistory = navigationHistory.current.slice(0, historyIndex.current + 1);
        newHistory.push(newHistoryItem);
        navigationHistory.current = newHistory;
        historyIndex.current = newHistory.length - 1;

        const existingIndex = breadcrumbPath.findIndex(item => item.id === folderId);
        if (existingIndex >= 0) {
            setBreadcrumbPath(breadcrumbPath.slice(0, existingIndex + 1));
        } else {
            setBreadcrumbPath([...breadcrumbPath, {
                id: folderId,
                name: folderName,
                path: folderId
            }]);
        }
    }, [breadcrumbPath, setCurrentFolderId]);

    const goBack = useCallback(() => {
        if (historyIndex.current > 0) {
            historyIndex.current -= 1;
            const historyItem = navigationHistory.current[historyIndex.current];
            setCurrentFolderId(historyItem.id);

            const breadcrumbIndex = breadcrumbPath.findIndex(item => item.id === historyItem.id);
            if (breadcrumbIndex >= 0) {
                setBreadcrumbPath(breadcrumbPath.slice(0, breadcrumbIndex + 1));
            }
        }
    }, [breadcrumbPath, setCurrentFolderId]);

    const goForward = useCallback(() => {
        if (historyIndex.current < navigationHistory.current.length - 1) {
            historyIndex.current += 1;
            const historyItem = navigationHistory.current[historyIndex.current];
            setCurrentFolderId(historyItem.id);

            const existingIndex = breadcrumbPath.findIndex(item => item.id === historyItem.id);
            if (existingIndex >= 0) {
                setBreadcrumbPath(breadcrumbPath.slice(0, existingIndex + 1));
            } else {
                setBreadcrumbPath([...breadcrumbPath, {
                    id: historyItem.id,
                    name: historyItem.name,
                    path: historyItem.id
                }]);
            }
        }
    }, [breadcrumbPath, setCurrentFolderId]);

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
