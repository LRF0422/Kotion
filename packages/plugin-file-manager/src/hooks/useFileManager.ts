import { useCallback, useEffect, useState, useRef } from 'react';
import { useApi, useFileService, useSafeState } from '@kn/core';
import { toast } from '@kn/ui';
import { APIS } from '../api';
import { FileItem, BreadcrumbItem } from '../editor-extensions/component/FileContext';

interface UseFileManagerProps {
    initialFolderId?: string;
}

export const useFileManager = ({ initialFolderId = '' }: UseFileManagerProps = {}) => {
    const [currentFolderId, setCurrentFolderId] = useSafeState<string>(initialFolderId);
    const [currentItem, setCurrentItem] = useState<FileItem>();
    const [updateFlag, setUpdateFlag] = useState(0);
    const [currentFolderItems, setCurrentFolderItems] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
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
        const baseItem = {
            id: file.id,
            name: file.name,
            isFolder: file.type.value === 'FOLDER',
            type: file.type,
            path: file.path,
        };

        if (file.children) {
            return {
                ...baseItem,
                children: file.children.map((item: any) => reslove(item)),
            };
        }

        return baseItem;
    }, []);

    const fetchFolderContents = useCallback(
        async (folderId: string | null) => {
            setLoading(true);
            setError(null);

            try {
                const api = folderId ? APIS.GET_CHILDREN : APIS.GET_ROOT_FOLDER;
                const params = folderId ? { folderId } : undefined;
                const res = await useApi(api, params);
                const items = res.data.map((item: any) => reslove(item));
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
        [reslove]
    );

    const createFolder = useCallback(
        async (name: string, repoKey: string) => {
            try {
                await useApi(APIS.CREATE_FOLDER, null, {
                    name,
                    parentId: currentFolderId,
                    type: 'FOLDER',
                    repositoryKey: repoKey,
                });
                setUpdateFlag((prev) => prev + 1);
                toast.success('Folder created successfully');
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Failed to create folder';
                toast.error(errorMessage);
                throw err;
            }
        },
        [currentFolderId]
    );

    const uploadFile = useCallback(
        async (repoKey: string) => {
            try {
                const res = await fileService.upload();
                const promise = useApi(APIS.CREATE_FOLDER, null, {
                    name: res.originalName,
                    parentId: currentFolderId,
                    type: 'FILE',
                    repositoryKey: repoKey,
                    path: res.name,
                });

                toast.promise(promise, {
                    loading: 'Uploading...',
                    success: 'Uploaded successfully',
                    error: 'Upload failed',
                });

                await promise;
                setUpdateFlag((prev) => prev + 1);
            } catch (err) {
                // Error already handled by toast.promise
                throw err;
            }
        },
        [currentFolderId, fileService]
    );

    const deleteFiles = useCallback(async (ids: string[]) => {
        // TODO: Implement delete API call
        toast.info('Delete functionality not yet implemented');
    }, []);

    // New file operations
    const renameFile = useCallback(async (file: FileItem, newName: string) => {
        try {
            await useApi(APIS.RENAME_FILE, null, {
                id: file.id,
                name: newName,
                type: file.isFolder ? 'FOLDER' : 'FILE',
            });
            setUpdateFlag((prev) => prev + 1);
            toast.success(`${file.isFolder ? 'Folder' : 'File'} renamed successfully`);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : `Failed to rename ${file.isFolder ? 'folder' : 'file'}`;
            toast.error(errorMessage);
            throw err;
        }
    }, []);

    const moveFiles = useCallback(async (files: FileItem[], targetFolderId: string) => {
        // TODO: Implement move API call
        const count = files.length;
        toast.success(`Moved ${count} item${count > 1 ? 's' : ''} successfully`);
        setUpdateFlag((prev) => prev + 1);
    }, []);

    const copyFiles = useCallback(async (files: FileItem[]) => {
        // TODO: Implement copy to clipboard functionality
        const count = files.length;
        toast.success(`Copied ${count} item${count > 1 ? 's' : ''} to clipboard`);
    }, []);

    const duplicateFiles = useCallback(async (files: FileItem[]) => {
        // TODO: Implement duplicate API call
        const count = files.length;
        toast.success(`Duplicated ${count} item${count > 1 ? 's' : ''}`);
        setUpdateFlag((prev) => prev + 1);
    }, []);

    // Navigation functions
    const navigateToFolder = useCallback((folderId: string, folderName: string = 'Folder') => {
        setCurrentFolderId(folderId);

        // Update history
        const newHistoryItem = { id: folderId, name: folderName };
        const newHistory = navigationHistory.current.slice(0, historyIndex.current + 1);
        newHistory.push(newHistoryItem);
        navigationHistory.current = newHistory;
        historyIndex.current = newHistory.length - 1;

        // Update breadcrumb path
        const existingIndex = breadcrumbPath.findIndex(item => item.id === folderId);
        if (existingIndex >= 0) {
            // Navigate to existing path item - trim path
            setBreadcrumbPath(breadcrumbPath.slice(0, existingIndex + 1));
        } else {
            // Add new breadcrumb item
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

            // Update breadcrumb to match history
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

            // Update breadcrumb to match history
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

    useEffect(() => {
        fetchFolderContents(currentFolderId || null);
    }, [currentFolderId, updateFlag, fetchFolderContents]);

    return {
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
        refreshFolder: () => setUpdateFlag((prev) => prev + 1),
        // Navigation
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
    };
};
