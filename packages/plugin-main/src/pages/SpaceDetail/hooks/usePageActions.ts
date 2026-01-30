import { useCallback } from 'react';
import { useApi } from '@kn/core';
import { useNavigator } from '@kn/core';
import { APIS } from '../../../api';

interface UsePageActionsProps {
    spaceId: string | undefined;
    onPageChange?: () => void;
    onFavoriteChange?: () => void;
    onTrashChange?: () => void;
}

interface UsePageActionsReturn {
    createPage: (parentId?: string) => Promise<void>;
    createPageFromTemplate: (templateId: string, parentId?: string) => Promise<void>;
    moveToTrash: (pageId: string) => Promise<void>;
    restorePage: (pageId: string) => Promise<void>;
    addToFavorites: (pageId: string) => Promise<void>;
    duplicatePage: (pageId: string) => Promise<void>;
}

/**
 * Custom hook for page-related actions
 * Consolidates all page manipulation logic
 */
export const usePageActions = ({
    spaceId,
    onPageChange,
    onFavoriteChange,
    onTrashChange,
}: UsePageActionsProps): UsePageActionsReturn => {
    const navigator = useNavigator();

    const createPage = useCallback(async (parentId: string = '0') => {
        if (!spaceId) return;

        const param = {
            spaceId,
            parentId,
            content: JSON.stringify({
                type: 'doc',
                content: [
                    {
                        type: 'title',
                        content: [
                            {
                                type: 'heading',
                                content: [
                                    {
                                        type: 'text',
                                        text: 'Untitled',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            }),
        };

        try {
            const res = await useApi(APIS.CREATE_OR_SAVE_PAGE, null, param);
            const page = res.data;
            navigator.go({
                to: `/space-detail/${spaceId}/page/edit/${page.id}`,
            });
            onPageChange?.();
        } catch (err) {
            console.error('Error creating page:', err);
            throw err;
        }
    }, [spaceId, navigator, onPageChange]);

    const createPageFromTemplate = useCallback(async (templateId: string, parentId?: string) => {
        if (!spaceId) return;

        try {
            await useApi(APIS.CREATE_OR_SAVE_PAGE, null, {
                templateId,
                spaceId,
                parentId,
            });
            onPageChange?.();
        } catch (err) {
            console.error('Error creating page from template:', err);
            throw err;
        }
    }, [spaceId, onPageChange]);

    const moveToTrash = useCallback(async (pageId: string) => {
        try {
            await useApi(APIS.MOVE_TO_TRASH, { id: pageId });
            onPageChange?.();
            onTrashChange?.();
        } catch (err) {
            console.error('Error moving page to trash:', err);
            throw err;
        }
    }, [onPageChange, onTrashChange]);

    const restorePage = useCallback(async (pageId: string) => {
        try {
            await useApi(APIS.RESTORE_PAGE, { id: pageId });
            onPageChange?.();
            onTrashChange?.();
        } catch (err) {
            console.error('Error restoring page:', err);
            throw err;
        }
    }, [onPageChange, onTrashChange]);

    const addToFavorites = useCallback(async (pageId: string) => {
        try {
            await useApi(APIS.ADD_SPACE_FAVORITE, { id: pageId });
            onFavoriteChange?.();
        } catch (err) {
            console.error('Error adding to favorites:', err);
            throw err;
        }
    }, [onFavoriteChange]);

    const duplicatePage = useCallback(async (pageId: string) => {
        // TODO: Implement duplicate page functionality
        console.log('Duplicate page:', pageId);
    }, []);

    return {
        createPage,
        createPageFromTemplate,
        moveToTrash,
        restorePage,
        addToFavorites,
        duplicatePage,
    };
};
