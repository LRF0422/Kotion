import { useCallback, useEffect, useState } from "react";
import { useSpacePageService } from "@kn/common";
import type { PageRecord } from "@kn/common";
import { pageCache } from "../utils/cache";

/** Fetch and cache canonical page details. */
export const usePageInfo = (pageId: string | null) => {
    const normalizedPageId = pageId ? String(pageId) : null;
    const [pageInfo, setPageInfo] = useState<PageRecord | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [version, setVersion] = useState(0);
    const service = useSpacePageService();

    useEffect(() => {
        if (!normalizedPageId) return;

        const invalidate = () => {
            pageCache.invalidate(normalizedPageId);
            setVersion((value) => value + 1);
        };
        const matches = (changedPageId: string) => String(changedPageId) === normalizedPageId;
        const unsubscribers = [
            service.changes.subscribe("page.updated", ({ payload }) => {
                if (matches(payload.page.id)) invalidate();
            }),
            service.changes.subscribe("page.deleted", ({ payload }) => {
                if (matches(payload.pageId)) invalidate();
            }),
            service.changes.subscribe("page.moved", ({ payload }) => {
                if (matches(payload.pageId)) invalidate();
            }),
            service.changes.subscribe("page.document.changed", ({ payload }) => {
                if (matches(payload.pageId)) invalidate();
            }),
        ];
        return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    }, [normalizedPageId, service]);

    useEffect(() => {
        if (!normalizedPageId) {
            setPageInfo(null);
            setError(null);
            setLoading(false);
            return;
        }

        const cached = pageCache.get(normalizedPageId);
        if (cached) {
            setPageInfo(cached);
            setError(null);
            setLoading(false);
            return;
        }

        let cancelled = false;
        const fetchPageInfo = async () => {
            setLoading(true);
            setError(null);

            try {
                const page = await service.pages.getPage(normalizedPageId);
                if (cancelled) return;
                setPageInfo(page);
                pageCache.set(normalizedPageId, page);
            } catch (err) {
                if (cancelled) return;
                setPageInfo(null);
                setError(err instanceof Error ? err.message : "Page has been deleted");
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void fetchPageInfo();
        return () => { cancelled = true; };
    }, [service, normalizedPageId, version]);

    const refetch = useCallback(() => {
        if (normalizedPageId) pageCache.invalidate(normalizedPageId);
        setVersion((value) => value + 1);
    }, [normalizedPageId]);

    return { pageInfo, loading, error, refetch };
};
