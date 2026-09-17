import React, { useCallback, useEffect, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@kn/editor";
import { Badge, Button, Card, cn } from "@kn/ui";
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
    thumbnailUrl?: string;
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

/** Medal styling for the top three ranks, muted chips for the rest. */
const rankClass = (index: number): string => {
    if (index === 0)
        return "bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow-sm shadow-amber-500/30";
    if (index === 1)
        return "bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-sm";
    if (index === 2)
        return "bg-gradient-to-br from-amber-600 to-orange-700 text-white shadow-sm";
    return "bg-muted text-muted-foreground";
};

const SkeletonRow: React.FC = () => (
    <div className="flex items-center gap-3 px-4 py-3">
        <div className="h-6 w-6 shrink-0 animate-pulse rounded-md bg-muted" />
        <div className="flex-1 space-y-2">
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
    </div>
);

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
                    thumbnailUrl: item.thumbnailUrl ?? "",
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
              time: new Date(lastSyncAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
              }),
          })
        : "";

    return (
        <NodeViewWrapper className="my-4">
            <Card
                className={cn(
                    "group/card relative overflow-hidden border-border/60 shadow-sm transition-shadow hover:shadow-md",
                    props.selected && "ring-2 ring-orange-500/40",
                )}
            >
                <div className="flex items-center gap-3 border-b border-border/60 bg-gradient-to-r from-orange-500/10 via-orange-500/5 to-transparent px-4 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-sm shadow-orange-500/30">
                        <Flame className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <h3 className="truncate text-sm font-semibold">
                                {t("zhihu.hot.title")}
                            </h3>
                            {items.length > 0 && (
                                <Badge
                                    variant="secondary"
                                    className="h-5 shrink-0 rounded-full px-2 text-[10px] font-normal text-muted-foreground"
                                >
                                    {t("zhihu.hot.count", { count: items.length })}
                                </Badge>
                            )}
                        </div>
                        {updatedLabel && (
                            <p className="truncate text-[11px] text-muted-foreground">
                                {updatedLabel}
                            </p>
                        )}
                    </div>
                    {editable && (
                        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/card:opacity-100">
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 rounded-full"
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
                                className="h-7 w-7 rounded-full hover:text-destructive"
                                title={t("zhihu.hot.remove")}
                                onClick={() => props.deleteNode()}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    )}
                </div>

                {loading && items.length === 0 && (
                    <div className="divide-y divide-border/50">
                        {Array.from({ length: Math.min(limit, 5) }).map(
                            (_, index) => (
                                <SkeletonRow key={index} />
                            ),
                        )}
                    </div>
                )}

                {error && (
                    <div className="m-3 flex flex-col items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-5 text-center">
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
                    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                        <Flame className="h-6 w-6 text-muted-foreground/40" />
                        <p className="text-xs text-muted-foreground">
                            {t("zhihu.hot.empty")}
                        </p>
                    </div>
                )}

                {items.length > 0 && (
                    <ol className="divide-y divide-border/50">
                        {items.map((item, index) => (
                            <li key={item.url || index}>
                                <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="group/row flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                                >
                                    <span
                                        className={cn(
                                            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums",
                                            rankClass(index),
                                        )}
                                    >
                                        {index + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start gap-1.5">
                                            <span className="line-clamp-2 text-sm font-medium leading-snug transition-colors group-hover/row:text-orange-600 dark:group-hover/row:text-orange-400">
                                                {item.title || item.url}
                                            </span>
                                            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100" />
                                        </div>
                                        {item.summary && (
                                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                                {item.summary}
                                            </p>
                                        )}
                                    </div>
                                    {item.thumbnailUrl && (
                                        <img
                                            src={item.thumbnailUrl}
                                            alt=""
                                            loading="lazy"
                                            className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-border/60"
                                            onError={(event) => {
                                                event.currentTarget.style.display =
                                                    "none";
                                            }}
                                        />
                                    )}
                                </a>
                            </li>
                        ))}
                    </ol>
                )}

                <div className="flex items-center justify-between border-t border-border/60 bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                        <ZhihuLogo size={12} />
                        {t("zhihu.hot.source")}
                    </span>
                    {loading && items.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            {t("zhihu.hot.refreshing")}
                        </span>
                    )}
                </div>
            </Card>
        </NodeViewWrapper>
    );
};

export default ZhihuHotListCard;
