import { useEffect, useState } from "react";
import { useSpacePageService } from "@kn/common";
import type { BlockSummary } from "@kn/common";
import { blockCache } from "../utils/cache";

/** Fetch and cache canonical block details. */
export const useBlockInfo = (blockId: string | null, refreshFlag?: boolean) => {
    const normalizedBlockId = blockId ? String(blockId) : null;
    const [blockInfo, setBlockInfo] = useState<BlockSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [version, setVersion] = useState(0);
    const service = useSpacePageService();

    useEffect(() => {
        if (!normalizedBlockId) return;
        const invalidate = () => {
            blockCache.invalidate(normalizedBlockId);
            setVersion((value) => value + 1);
        };
        const unsubscribeDocument = service.changes.subscribe("page.document.changed", ({ payload }) => {
            if (!blockInfo?.pageId || String(payload.pageId) === String(blockInfo.pageId)) invalidate();
        });
        const unsubscribeRelations = service.changes.subscribe("page.relations.changed", ({ payload }) => {
            if (!blockInfo?.pageId || String(payload.pageId) === String(blockInfo.pageId)) invalidate();
        });
        return () => {
            unsubscribeDocument();
            unsubscribeRelations();
        };
    }, [blockInfo?.pageId, normalizedBlockId, service]);

    useEffect(() => {
        if (!normalizedBlockId) {
            setBlockInfo(null);
            setError(null);
            setLoading(false);
            return;
        }

        if (!refreshFlag) {
            const cached = blockCache.get(normalizedBlockId);
            if (cached) {
                setBlockInfo(cached);
                setError(null);
                setLoading(false);
                return;
            }
        }

        let cancelled = false;
        const fetchBlockInfo = async () => {
            setLoading(true);
            setError(null);

            try {
                const block = await service.relations.getBlock(normalizedBlockId);
                if (cancelled) return;
                setBlockInfo(block);
                blockCache.set(normalizedBlockId, block);
            } catch (err) {
                if (cancelled) return;
                setBlockInfo(null);
                setError(err instanceof Error ? err.message : "Failed to fetch block info");
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void fetchBlockInfo();
        return () => { cancelled = true; };
    }, [service, normalizedBlockId, refreshFlag, version]);

    return { blockInfo, loading, error };
};
