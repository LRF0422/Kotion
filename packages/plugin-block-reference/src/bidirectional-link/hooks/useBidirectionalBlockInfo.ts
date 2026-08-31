import { useCallback, useEffect, useRef, useState } from "react";
import { useSpacePageService } from "@kn/common";
import type { BlockSummary } from "@kn/common";

/** Fetch canonical block detail for a bidirectional block embed. */
export function useBidirectionalBlockInfo(blockId: string | null, shouldFetch: boolean = true) {
    const normalizedBlockId = blockId ? String(blockId) : null;
    const service = useSpacePageService();
    const [blockInfo, setBlockInfo] = useState<BlockSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [version, setVersion] = useState(0);
    const requestSeqRef = useRef(0);

    const fetchBlockInfo = useCallback(async () => {
        if (!normalizedBlockId) return;
        const requestId = ++requestSeqRef.current;
        setLoading(true);
        setError(null);

        try {
            const block = await service.relations.getBlock(normalizedBlockId);
            if (requestId !== requestSeqRef.current) return;
            setBlockInfo(block);
        } catch (err) {
            if (requestId !== requestSeqRef.current) return;
            setBlockInfo(null);
            setError(err instanceof Error ? err.message : "Failed to fetch block info");
        } finally {
            if (requestId === requestSeqRef.current) setLoading(false);
        }
    }, [normalizedBlockId, service]);

    useEffect(() => {
        if (shouldFetch && normalizedBlockId) void fetchBlockInfo();
        return () => { requestSeqRef.current += 1; };
    }, [shouldFetch, normalizedBlockId, fetchBlockInfo, version]);

    useEffect(() => {
        if (!normalizedBlockId) return;
        const matchesPage = (pageId: string) => !blockInfo?.pageId || String(pageId) === String(blockInfo.pageId);
        const unsubscribeDocument = service.changes.subscribe("page.document.changed", ({ payload }) => {
            if (matchesPage(payload.pageId)) setVersion((value) => value + 1);
        });
        const unsubscribeRelations = service.changes.subscribe("page.relations.changed", ({ payload }) => {
            if (matchesPage(payload.pageId)) setVersion((value) => value + 1);
        });
        return () => {
            unsubscribeDocument();
            unsubscribeRelations();
        };
    }, [blockInfo?.pageId, normalizedBlockId, service]);

    return { blockInfo, loading, error, refetch: fetchBlockInfo };
}
