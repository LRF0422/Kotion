import { useEffect, useState } from "react";
import { useToggle } from "@kn/core";
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
 * @returns Object containing pageInfo, loading state, and error state
 * 
 * @example
 * ```tsx
 * const { pageInfo, loading, error } = usePageInfo(pageId);
 * ```
 */
export const usePageInfo = (pageId: string | null) => {
    const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
    const [loading, { toggle }] = useToggle(false);
    const [error, setError] = useState<string | null>(null);
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
    }, [spaceService, pageId, toggle]);

    return { pageInfo, loading, error };
};
