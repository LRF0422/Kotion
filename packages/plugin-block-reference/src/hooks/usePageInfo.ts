import { useEffect, useState } from "react";
import { useToggle } from "@kn/core";
import type { PageInfo } from "../types";
import { useSpaceService } from "./useSpaceService";

/**
 * Custom hook to fetch and manage page information
 * @param pageId - The ID of the page to fetch
 * @returns Page info, loading state, and error state
 */
export const usePageInfo = (pageId: string | null) => {
    const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
    const [loading, { toggle }] = useToggle(false);
    const [error, setError] = useState<string | null>(null);
    const spaceService = useSpaceService();

    useEffect(() => {
        if (!spaceService || !pageId) return;

        const fetchPageInfo = async () => {
            toggle();
            setError(null);

            try {
                const res = await spaceService.getPage(pageId);
                if (res) {
                    setPageInfo(res);
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
    }, [spaceService, pageId]);

    return { pageInfo, loading, error };
};
