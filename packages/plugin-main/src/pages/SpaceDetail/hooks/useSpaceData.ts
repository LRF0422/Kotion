import { useState, useEffect, useCallback } from 'react';
import { type PageSummary, type PageTreeNode, type Space, type SpacePageTemplate, useSpacePageService } from "@kn/common";

interface UseSpaceDataProps {
    spaceId: string | undefined;
    searchValue?: string;
}

interface UseSpaceDataReturn {
    space: Space | undefined;
    pageTree: PageTreeNode[];
    favorites: PageSummary[];
    trash: PageSummary[];
    yourTemplates: SpacePageTemplate[];
    loading: boolean;
    error: string | null;
    refreshPageTree: () => void;
    refreshFavorites: () => void;
    refreshTrash: () => void;
}

/**
 * Custom hook for managing space data
 * Consolidates all data fetching logic for SpaceDetail component
 */
export const useSpaceData = ({ spaceId, searchValue }: UseSpaceDataProps): UseSpaceDataReturn => {
    const [space, setSpace] = useState<Space>();
    const [pageTree, setPageTree] = useState<PageTreeNode[]>([]);
    const [favorites, setFavorites] = useState<PageSummary[]>([]);
    const [trash, setTrash] = useState<PageSummary[]>([]);
    const [yourTemplates] = useState<SpacePageTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pageTreeFlag, setPageTreeFlag] = useState(0);
    const [favoritesFlag, setFavoritesFlag] = useState(0);
    const [trashFlag, setTrashFlag] = useState(0);
    const service = useSpacePageService();

    useEffect(() => {
        if (!spaceId) return;

        service.spaces.getSpace(spaceId)
            .then(result => {
                setSpace(result);
                setError(null);
            })
            .catch(err => {
                setError('Failed to load space information');
                console.error('Error loading space:', err);
            });

        return () => setSpace(undefined);
    }, [service, spaceId]);

    useEffect(() => {
        if (!spaceId) return;

        const timeoutId = setTimeout(() => {
            setLoading(true);
            service.pages.getPageTree({ spaceId, searchValue })
                .then(result => {
                    setPageTree(result);
                    setError(null);
                })
                .catch(err => {
                    setError('Failed to load page tree');
                    console.error('Error loading page tree:', err);
                })
                .finally(() => setLoading(false));
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [pageTreeFlag, searchValue, service, spaceId]);

    useEffect(() => {
        if (!spaceId) return;

        service.pages.queryFavoritePages({ spaceId, pageSize: 5 })
            .then(result => {
                setFavorites(result.records);
                setError(null);
            })
            .catch(err => {
                console.error('Error loading favorites:', err);
            });
    }, [favoritesFlag, service, spaceId]);

    useEffect(() => {
        if (!spaceId) return;

        service.pages.queryPages({ spaceId, status: 'TRASH', pageSize: 20 })
            .then(result => {
                setTrash(result.records);
                setError(null);
            })
            .catch(err => {
                console.error('Error loading trash:', err);
            });
    }, [trashFlag, service, spaceId]);

    useEffect(() => {
        if (!spaceId) return;
        const matchesSpace = (changedSpaceId?: string) => !changedSpaceId || changedSpaceId === spaceId;
        const unsubscribers = [
            service.changes.subscribe('space.updated', ({ payload }) => {
                if (payload.space?.id === spaceId) setSpace(payload.space);
            }),
            service.changes.subscribe('page.created', ({ payload }) => {
                if (matchesSpace(payload.spaceId ?? payload.page.spaceId)) setPageTreeFlag(value => value + 1);
            }),
            service.changes.subscribe('page.updated', ({ payload }) => {
                if (matchesSpace(payload.spaceId ?? payload.page.spaceId)) setPageTreeFlag(value => value + 1);
            }),
            service.changes.subscribe('page.moved', ({ payload }) => {
                if (matchesSpace(payload.spaceId)) setPageTreeFlag(value => value + 1);
            }),
            service.changes.subscribe('page.trashed', () => {
                setPageTreeFlag(value => value + 1);
                setTrashFlag(value => value + 1);
            }),
            service.changes.subscribe('page.restoredFromTrash', () => {
                setPageTreeFlag(value => value + 1);
                setTrashFlag(value => value + 1);
            }),
            service.changes.subscribe('page.favorite.changed', ({ payload }) => {
                if (matchesSpace(payload.spaceId)) setFavoritesFlag(value => value + 1);
            }),
        ];
        return () => unsubscribers.forEach(unsubscribe => unsubscribe());
    }, [service, spaceId]);

    const refreshPageTree = useCallback(() => {
        setPageTreeFlag(flag => flag + 1);
    }, []);

    const refreshFavorites = useCallback(() => {
        setFavoritesFlag(flag => flag + 1);
    }, []);

    const refreshTrash = useCallback(() => {
        setTrashFlag(flag => flag + 1);
    }, []);

    return {
        space,
        pageTree,
        favorites,
        trash,
        yourTemplates,
        loading,
        error,
        refreshPageTree,
        refreshFavorites,
        refreshTrash,
    };
};
