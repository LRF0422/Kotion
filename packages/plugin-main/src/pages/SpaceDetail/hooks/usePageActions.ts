import { useCallback } from 'react';
import { useNavigator, useSpacePageService } from "@kn/common";

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
    const service = useSpacePageService();

    const createPage = useCallback(async (parentId: string = '0') => {
        if (!spaceId) return;

        try {
            const page = await service.pages.createPage({
                spaceId,
                parentId,
                title: 'Untitled',
            });
            navigator.go({
                to: `/space-detail/${spaceId}/page/edit/${page.id}`,
            });
            onPageChange?.();
        } catch (err) {
            console.error('Error creating page:', err);
            throw err;
        }
    }, [spaceId, navigator, onPageChange, service]);

    const createPageFromTemplate = useCallback(async (templateId: string, parentId?: string) => {
        if (!spaceId) return;

        try {
            await service.pages.createPage({
                templateId,
                spaceId,
                parentId,
                title: 'Untitled',
            });
            onPageChange?.();
        } catch (err) {
            console.error('Error creating page from template:', err);
            throw err;
        }
    }, [spaceId, onPageChange, service]);

    const moveToTrash = useCallback(async (pageId: string) => {
        try {
            await service.pages.movePageToTrash(pageId);
            onPageChange?.();
            onTrashChange?.();
        } catch (err) {
            console.error('Error moving page to trash:', err);
            throw err;
        }
    }, [onPageChange, onTrashChange, service]);

    const restorePage = useCallback(async (pageId: string) => {
        try {
            await service.pages.restorePageFromTrash(pageId);
            onPageChange?.();
            onTrashChange?.();
        } catch (err) {
            console.error('Error restoring page:', err);
            throw err;
        }
    }, [onPageChange, onTrashChange, service]);

    const addToFavorites = useCallback(async (pageId: string) => {
        try {
            await service.pages.favoritePage(pageId);
            onFavoriteChange?.();
        } catch (err) {
            console.error('Error adding to favorites:', err);
            throw err;
        }
    }, [onFavoriteChange, service]);

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
