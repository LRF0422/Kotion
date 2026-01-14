import { useCallback, useEffect, useState } from 'react';
import { useApi, useUploadFile, useSafeState } from '@kn/core';
import { toast } from '@kn/ui';
import { APIS } from '../api';
import { FileItem } from '../editor-extensions/component/FileContext';

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
    const { upload } = useUploadFile();

    const reslove = useCallback((file: any): FileItem => {
        const baseItem = {
            id: file.id,
            name: file.name,
            isFolder: file.type.value === 'FOLDER',
            type: file.type,
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
                const res = await upload();
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
        [currentFolderId, upload]
    );

    const deleteFiles = useCallback(async (ids: string[]) => {
        // TODO: Implement delete API call
        toast.info('Delete functionality not yet implemented');
    }, []);

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
    };
};
