import { useCallback, useEffect, useState } from "react";
import { useToggle } from "@kn/common";
import type { PageInfo } from "../types";
import { useSpaceService } from "./useSpaceService";
import { pageCache } from "../utils/cache";

/**
 * Custom hook to fetch and manage page information with caching
 * 
 * Features:
 * - Automatic caching with LRU eviction
 * - Proper loading and error states
 * - Handles deleted pages gracefully
 * 
 * @param pageId - The ID of the page to fetch
 * @returns Object containing pageInfo, loading state, error state and a refetch
 *   function that bypasses the cache (used after in-place edits)
 * 
 * @example
 * ```tsx
 * const { pageInfo, loading, error, refetch } = usePageInfo(pageId);
 * ```
 */
export const usePageInfo = (pageId: string | null) => {
    const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
    const [loading, { toggle }] = useToggle(false);
    const [error, setError] = useState<string | null>(null);
    const [version, setVersion] = useState(0);
    const spaceService = useSpaceService();

    useEffect(() => {
        if (!spaceService || !pageId) return;

        // Check cache first
        const cached = pageCache.get(pageId);
        if (cached) {
            setPageInfo(cached);
            setError(null);
            return;
        }

        const fetchPageInfo = async () => {
            toggle();
            setError(null);

            try {
                const res = await spaceService.getPage(pageId);
                if (res) {
                    setPageInfo(res);
                    pageCache.set(pageId, res); // Cache the result
                } else {
                    setPageInfo(null);
                    setError("Page has been deleted");
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to fetch page info");
            } finally {
                toggle();
            }
        };

        fetchPageInfo();
    }, [spaceService, pageId, toggle, version]);

    // Drop the cached entry and refetch — call after the page was edited
    // elsewhere (e.g. the in-place edit popup) so previews show fresh content.
    const refetch = useCallback(() => {
        if (pageId) pageCache.invalidate(pageId);
        setVersion(v => v + 1);
    }, [pageId]);

    return { pageInfo, loading, error, refetch };
};
