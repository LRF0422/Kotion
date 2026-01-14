import { useState, useEffect, useCallback } from 'react';
import { useApi, useService } from '@kn/core';
import { APIS } from '../../../api';
import { Space } from '../../../model/Space';

interface UseSpaceDataProps {
    spaceId: string | undefined;
    searchValue?: string;
}

interface UseSpaceDataReturn {
    space: Space | undefined;
    pageTree: any[];
    favorites: any[];
    trash: any[];
    yourTemplates: any[];
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
    const [pageTree, setPageTree] = useState<any[]>([]);
    const [favorites, setFavorites] = useState<any[]>([]);
    const [trash, setTrash] = useState<any[]>([]);
    const [yourTemplates, setYourTemplates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pageTreeFlag, setPageTreeFlag] = useState(0);
    const [favoritesFlag, setFavoritesFlag] = useState(0);
    const [trashFlag, setTrashFlag] = useState(0);

    const spaceService = useService('spaceService');

    // Fetch space info
    useEffect(() => {
        if (!spaceId) return;

        spaceService.getSpaceInfo(spaceId)
            .then(res => {
                setSpace(res);
                setError(null);
            })
            .catch(err => {
                setError('Failed to load space information');
                console.error('Error loading space:', err);
            });

        return () => {
            setSpace(undefined);
        };
    }, [spaceId]);

    // Fetch page tree with debounce
    useEffect(() => {
        if (!spaceId) return;

        const timeoutId = setTimeout(() => {
            setLoading(true);
            spaceService.getPageTree(spaceId, searchValue)
                .then(res => {
                    setPageTree(res);
                    setError(null);
                })
                .catch(err => {
                    setError('Failed to load page tree');
                    console.error('Error loading page tree:', err);
                })
                .finally(() => {
                    setLoading(false);
                });
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [pageTreeFlag, searchValue, spaceId]);

    // Fetch favorites
    useEffect(() => {
        if (!spaceId) return;

        useApi(APIS.QUERY_FAVORITE, { scope: spaceId, pageSize: 5 })
            .then(res => {
                setFavorites(res.data);
                setError(null);
            })
            .catch(err => {
                console.error('Error loading favorites:', err);
            });
    }, [favoritesFlag, spaceId]);

    // Fetch trash
    useEffect(() => {
        if (!spaceId) return;

        useApi(APIS.QUERY_PAGE, { spaceId, status: 'TRASH', pageSize: 20 })
            .then(res => {
                setTrash(res.data.records);
                setError(null);
            })
            .catch(err => {
                console.error('Error loading trash:', err);
            });
    }, [trashFlag, spaceId]);

    const refreshPageTree = useCallback(() => {
        setPageTreeFlag(f => f + 1);
    }, []);

    const refreshFavorites = useCallback(() => {
        setFavoritesFlag(f => f + 1);
    }, []);

    const refreshTrash = useCallback(() => {
        setTrashFlag(f => f + 1);
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
