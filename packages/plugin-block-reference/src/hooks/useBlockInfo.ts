import { useEffect, useState } from "react";
import { useToggle } from "@kn/core";
import type { BlockInfo } from "../types";
import { useSpaceService } from "./useSpaceService";
import { blockCache } from "../utils/cache";

/**
 * Custom hook to fetch and manage block information with caching
 * 
 * Features:
 * - Automatic caching with LRU eviction
 * - Cache bypass on refresh
 * - Proper loading and error states
 * 
 * @param blockId - The ID of the block to fetch
 * @param refreshFlag - Optional flag to trigger refresh and bypass cache
 * @returns Object containing blockInfo, loading state, and error state
 * 
 * @example
 * ```tsx
 * const { blockInfo, loading, error } = useBlockInfo(blockId);
 * const { blockInfo, loading } = useBlockInfo(blockId, refreshFlag); // With refresh
 * ```
 */
export const useBlockInfo = (blockId: string | null, refreshFlag?: boolean) => {
    const [blockInfo, setBlockInfo] = useState<BlockInfo | null>(null);
    const [loading, { toggle }] = useToggle(false);
    const [error, setError] = useState<string | null>(null);
    const spaceService = useSpaceService();

    useEffect(() => {
        if (!spaceService || !blockId) return;

        // Check cache first (unless refresh is requested)itt
        if (!refreshFlag) {
            const cached = blockCache.get(blockId);
            if (cached) {
                setBlockInfo(cached);
                setError(null);
                return;
            }
        }

        const fetchBlockInfo = async () => {
            toggle();
            setError(null);

            try {
                const res = await spaceService.getBlockInfo(blockId);
                if (res) {
                    setBlockInfo(res);
                    blockCache.set(blockId, res); // Cache the result
                } else {
                    setError("Block not found");
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to fetch block info");
            } finally {
                toggle();
            }
        };

        fetchBlockInfo();
    }, [spaceService, blockId, refreshFlag, toggle]);

    return { blockInfo, loading, error };
};
