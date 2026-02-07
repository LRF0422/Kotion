/**
 * useBidirectionalBlockInfo Hook
 * Fetches block info using useApi for bidirectional links.
 * 
 * @module @kn/plugin-block-reference/bidirectional-link/hooks
 */

import { useEffect, useState, useCallback } from "react";
import { useApi } from "@kn/core";
import { APIS } from "../api";

export interface BlockInfoData {
    id: string;
    pageId: number;
    spaceId: number;
    type: string;
    content: string;
}

/**
 * Custom hook to fetch block information for BlockLink
 * 
 * @param blockId - The ID of the block to fetch
 * @param shouldFetch - Whether to trigger fetch (defaults to true)
 * @returns Object containing blockInfo, loading state, error state, and refetch function
 */
export function useBidirectionalBlockInfo(blockId: string | null, shouldFetch: boolean = true) {
    const [blockInfo, setBlockInfo] = useState<BlockInfoData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchBlockInfo = useCallback(async () => {
        if (!blockId) return;

        setLoading(true);
        setError(null);

        try {
            const res = await useApi(APIS.GET_BLOCK_INFO, { id: blockId });
            if (res.data) {
                setBlockInfo(res.data);
            } else {
                setError("Block not found");
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch block info");
        } finally {
            setLoading(false);
        }
    }, [blockId]);

    useEffect(() => {
        if (shouldFetch && blockId) {
            fetchBlockInfo();
        }
    }, [shouldFetch, blockId, fetchBlockInfo]);

    return { blockInfo, loading, error, refetch: fetchBlockInfo };
}
