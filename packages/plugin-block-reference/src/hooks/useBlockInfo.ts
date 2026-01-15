import { useEffect, useState } from "react";
import { useToggle } from "@kn/core";
import type { BlockInfo } from "../types";
import { useSpaceService } from "./useSpaceService";

/**
 * Custom hook to fetch and manage block information
 * @param blockId - The ID of the block to fetch
 * @param refreshFlag - Optional flag to trigger refresh
 * @returns Block info, loading state, and error state
 */
export const useBlockInfo = (blockId: string | null, refreshFlag?: boolean) => {
    const [blockInfo, setBlockInfo] = useState<BlockInfo | null>(null);
    const [loading, { toggle }] = useToggle(false);
    const [error, setError] = useState<string | null>(null);
    const spaceService = useSpaceService();

    useEffect(() => {
        if (!spaceService || !blockId) return;

        const fetchBlockInfo = async () => {
            toggle();
            setError(null);

            try {
                const res = await spaceService.getBlockInfo(blockId);
                if (res) {
                    setBlockInfo(res);
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
    }, [spaceService, blockId, refreshFlag]);

    return { blockInfo, loading, error };
};
