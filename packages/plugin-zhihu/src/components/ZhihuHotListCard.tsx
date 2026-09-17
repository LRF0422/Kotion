import React, { useCallback, useEffect, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@kn/editor";
import { Button, Card, cn } from "@kn/ui";
import { ExternalLink, Flame, RefreshCw, Trash2 } from "@kn/icon";
import { useTranslation } from "@kn/common";
import {
    loadZhihuConfig,
    toZhihuServiceOptions,
} from "../hooks/use-zhihu-config";
import { getZhihuHotList } from "../services/zhihu-service";
import { describeZhihuError } from "../services/zhihu-errors";
import { ZhihuLogo } from "./ZhihuLogo";

interface HotSnapshot {
    title: string;
    url: string;
    summary?: string;
}

const asItems = (value: unknown): HotSnapshot[] =>
    Array.isArray(value)
        ? value.filter(
              (entry): entry is HotSnapshot =>
                  !!entry &&
                  typeof entry === "object" &&
                  typeof (entry as HotSnapshot).title === "string",
          )
        : [];

/**
 * Editor card for the Zhihu hot list.
 *
 * The fetched list is snapshotted into node attrs so the card renders without
 * a network round-trip (and survives offline / read-only views). Refreshing
 * re-fetches and replaces the snapshot.
 */
export const ZhihuHotListCard: React.FC<NodeViewProps> = (props) => {
    const { t } = useTranslation();
    const editor = props.editor;
    const editable = Boolean(editor?.isEditable);
    const items = asItems(props.node.attrs.items);
    const rawLimit = Number(props.node.attrs.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 10;
    const lastSyncAt =
        typeof props.node.attrs.lastSyncAt === "string"
            ? props.node.attrs.lastSyncAt
            : "";

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const autoFetchedRef = useRef(false);

    const sync = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const config = await loadZhihuConfig();
            const result = await getZhihuHotList(
                toZhihuServiceOptions(config),
                limit,
            );
            props.updateAttributes({
                items: result.items.slice(0, limit).map((item) => ({
                    title: item.title,
                    url: item.url,
                    summary: item.summary ?? "",
                })),
                lastSyncAt: new Date().toISOString(),
            });
        } catch (err) {
            setError(describeZhihuError(err));
        } finally {
            setLoading(false);
        }
    }, [limit, props]);

    useEffect(() => {
        if (!editable || autoFetchedRef.current || items.length > 0) return;
        autoFetchedRef.current = true;
        void sync();
    }, [editable, items.length, sync]);

    const updatedLabel = lastSyncAt
        ? t("zhihu.hot.updatedAt", {
              time: new Date(lastSyncAt).toLocaleString(),
          })
        : "";

    return (
        <NodeViewWrapper className="my-4">
            <Card
                className={cn(
                    "group relative overflow-hidden",
                    props.selected && "ring-2 ring-ring",
                )}
            >
                <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
                    <Flame className="h-4 w-4 shrink-0 text-orange-500" />
                    <span className="text-sm font-medium">
                        {t("zhihu.hot.title")}
                    </span>
                    {updatedLabel && (
                        <span className="truncate text-xs text-muted-foreground">
                            {updatedLabel}
                        </span>
                    )}
                    <span className="flex-1" />
                    {editable && (
                        <div className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                title={t("zhihu.hot.refresh")}
                                onClick={() => void sync()}
                                disabled={loading}
                            >
                                <RefreshCw
                                    className={cn(
                                        "h-3.5 w-3.5",
                                        loading && "animate-spin",
                                    )}
                                />
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                title={t("zhihu.hot.remove")}
                                onClick={() => props.deleteNode()}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    )}
                </div>

                <div className="p-2">
                    {loading && items.length === 0 && (
                        <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            {t("zhihu.hot.loading")}
                        </div>
                    )}

                    {error && (
                        <div className="m-2 space-y-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                            <p className="break-all text-xs text-destructive">
                                {error}
                            </p>
                            {editable && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void sync()}
                                >
                                    {t("zhihu.hot.retry")}
                                </Button>
                            )}
                        </div>
                    )}

                    {!error && items.length === 0 && !loading && (
                        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                            {t("zhihu.hot.empty")}
                        </p>
                    )}

                    {items.length > 0 && (
                        <ol className="space-y-0.5">
                            {items.map((item, index) => (
                                <li
                                    key={item.url || index}
                                    className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                                >
                                    <span
                                        className={cn(
                                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold",
                                            index < 3
                                                ? "bg-orange-500/15 text-orange-600"
                                                : "bg-muted text-muted-foreground",
                                        )}
                                    >
                                        {index + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <a
                                            href={item.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-start gap-1 text-sm font-medium hover:underline"
                                        >
                                            <span className="line-clamp-2">
                                                {item.title || item.url}
                                            </span>
                                            <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                                        </a>
                                        {item.summary && (
                                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                                {item.summary}
                                            </p>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>

                <div className="flex items-center justify-between border-t px-3 py-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                        <ZhihuLogo size={12} />
                        {t("zhihu.hot.source")}
                    </span>
                    {loading && items.length > 0 && (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                    )}
                </div>
            </Card>
        </NodeViewWrapper>
    );
};

export default ZhihuHotListCard;
