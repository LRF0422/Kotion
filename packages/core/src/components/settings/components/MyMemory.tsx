import { AgentClient, useTranslation } from "@kn/common";
import type { MemoryItem } from "@kn/common";
import { Badge, Button, Input, toast } from "@kn/ui";
import { RefreshCw, Search, Trash2 } from "@kn/icon";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    MEMORY_KINDS,
    groupMemoriesByScope,
    memoryKind,
    mergeMemoryPages,
    sortMemories,
    type MemoryKind,
    type MemoryScopeKind,
    type MemorySortKey,
} from "../memory-utils";
import { SettingsPanel, SettingsRow, SettingsSection } from "./primitives";

const client = new AgentClient();

/** One backend page; "加载更多" appends the next one. */
const PAGE_SIZE = 20;

const TYPE_LABEL_KEY: Record<MemoryKind, string> = {
    fact: "settings.memory.typeFact",
    preference: "settings.memory.typePreference",
    note: "settings.memory.typeNote",
    episode: "settings.memory.typeEpisode",
};

const SCOPE_LABEL_KEY: Record<MemoryScopeKind, string> = {
    user: "settings.memory.scopeUser",
    space: "settings.memory.scopeSpace",
    page: "settings.memory.scopePage",
    unknown: "settings.memory.scopeUnknown",
};

/** Local time for humans; a zero/missing stamp renders as a dash. */
const formatTime = (value: number): string => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

/**
 * 「记忆管理」— the long-term memories the agent keeps about the user.
 *
 * Long-term memory is the agent's own free-text recollection (fact /
 * preference / note / episode), scoped page → space → user. Unlike 「我的画像」
 * (structured, derived traits for recommendations), deleting a memory here
 * simply removes it: the agent stops recalling it from the next turn on.
 *
 * The browser always queries `scope: '*'`: page-scoped memories embed page ids
 * the client cannot enumerate, so "everything this user owns" is the only
 * honest listing — and only the server can count it.
 */
export const MyMemory: React.FC = () => {
    const { t } = useTranslation();
    const [items, setItems] = useState<MemoryItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [busy, setBusy] = useState(false);
    const [query, setQuery] = useState("");
    const [activeQuery, setActiveQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState<"all" | MemoryKind>("all");
    const [sortKey, setSortKey] = useState<MemorySortKey>("recent");
    const [newContent, setNewContent] = useState("");
    const [newType, setNewType] = useState<MemoryKind>("note");

    // The loaded rows double as the paging cursor: `load` must stay identity
    // stable while rows arrive, otherwise the fetch effect would loop.
    const itemsRef = useRef<MemoryItem[]>([]);
    const requestRef = useRef(0);

    const applyItems = useCallback((next: MemoryItem[]) => {
        itemsRef.current = next;
        setItems(next);
    }, []);

    // Debounce the box: one request per pause, not one per keystroke.
    useEffect(() => {
        const timer = window.setTimeout(() => setActiveQuery(query.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [query]);

    const load = useCallback(
        async (append = false) => {
            const requestId = ++requestRef.current;
            if (append) {
                setLoadingMore(true);
            } else {
                setLoading(true);
            }
            try {
                const page = await client.listMemoryPage({
                    scope: "*",
                    query: activeQuery || undefined,
                    type: typeFilter === "all" ? undefined : typeFilter,
                    offset: append ? itemsRef.current.length : 0,
                    limit: PAGE_SIZE,
                });
                // A slower earlier request must never overwrite a newer one.
                if (requestId !== requestRef.current) return;
                applyItems(append ? mergeMemoryPages(itemsRef.current, page.items) : page.items);
                setTotal(page.total);
            } catch {
                if (requestId === requestRef.current) {
                    toast.error(t("settings.memory.loadFailed"));
                }
            } finally {
                if (requestId === requestRef.current) {
                    setLoading(false);
                    setLoadingMore(false);
                }
            }
        },
        [activeQuery, typeFilter, applyItems, t],
    );

    useEffect(() => {
        void load(false);
    }, [load]);

    const addMemory = async () => {
        const content = newContent.trim();
        if (!content) return;
        setBusy(true);
        try {
            await client.createMemory({ content, type: newType, scope: "user" });
            setNewContent("");
            toast.success(t("settings.memory.added"));
            // Reload instead of unshifting locally: the server owns the order and
            // the total, and an active filter may legitimately hide the new row.
            await load(false);
        } catch {
            toast.error(t("settings.memory.saveFailed"));
        } finally {
            setBusy(false);
        }
    };

    const removeMemory = async (item: MemoryItem) => {
        if (!window.confirm(t("settings.memory.deleteConfirm"))) return;
        setBusy(true);
        try {
            await client.deleteMemory(item.memoryId);
            applyItems(itemsRef.current.filter((row) => row.memoryId !== item.memoryId));
            setTotal((prev) => Math.max(0, prev - 1));
            toast.success(t("settings.memory.deleted"));
        } catch {
            toast.error(t("settings.memory.deleteFailed"));
        } finally {
            setBusy(false);
        }
    };

    const purgeAll = async () => {
        if (!window.confirm(t("settings.memory.purgeConfirm"))) return;
        setBusy(true);
        try {
            const removed = await client.purgeMemory();
            applyItems([]);
            setTotal(0);
            toast.success(t("settings.memory.purgeDone", { n: removed }));
        } catch {
            toast.error(t("settings.memory.deleteFailed"));
        } finally {
            setBusy(false);
        }
    };

    const sorted = useMemo(() => sortMemories(items, sortKey), [items, sortKey]);
    const groups = useMemo(() => groupMemoriesByScope(sorted), [sorted]);
    const filtered = activeQuery !== "" || typeFilter !== "all";
    // A ranked search ignores the offset server-side, so paging only makes sense
    // while browsing. `total` is the owner's browse total for the type filter.
    const canLoadMore = !activeQuery && items.length < total;
    // While searching, `total` still counts the browse set — report what the
    // search actually returned instead of a number the user cannot see.
    const shownTotal = activeQuery ? items.length : total;

    return (
        <SettingsPanel>
            <SettingsSection
                title={t("settings.memory.addTitle")}
                description={t("settings.memory.addDesc")}
            >
                <div className="space-y-2 px-4 py-3">
                    <Input
                        value={newContent}
                        disabled={busy}
                        placeholder={t("settings.memory.contentPlaceholder")}
                        onChange={(event) => setNewContent(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") void addMemory();
                        }}
                    />
                    <div className="flex items-center gap-2">
                        <select
                            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                            value={newType}
                            disabled={busy}
                            onChange={(event) => setNewType(event.target.value as MemoryKind)}
                        >
                            {MEMORY_KINDS.map((kind) => (
                                <option key={kind} value={kind}>
                                    {t(TYPE_LABEL_KEY[kind])}
                                </option>
                            ))}
                        </select>
                        <Button
                            size="sm"
                            disabled={busy || !newContent.trim()}
                            onClick={() => void addMemory()}
                        >
                            {t("settings.memory.add")}
                        </Button>
                    </div>
                </div>
            </SettingsSection>

            <SettingsSection
                title={t("settings.memory.title")}
                description={t("settings.memory.privacyNotice")}
                action={
                    <Button
                        size="sm"
                        variant="ghost"
                        disabled={loading}
                        className="h-8 gap-1 px-2 text-xs"
                        onClick={() => void load(false)}
                    >
                        <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                        {t("settings.memory.refresh")}
                    </Button>
                }
            >
                <div className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
                    <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            className="h-9 pl-8"
                            value={query}
                            placeholder={t("settings.memory.searchPlaceholder")}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            className="h-9 flex-1 rounded-md border border-input bg-transparent px-2 text-sm md:flex-none"
                            value={typeFilter}
                            onChange={(event) =>
                                setTypeFilter(event.target.value as "all" | MemoryKind)
                            }
                        >
                            <option value="all">{t("settings.memory.typeAll")}</option>
                            {MEMORY_KINDS.map((kind) => (
                                <option key={kind} value={kind}>
                                    {t(TYPE_LABEL_KEY[kind])}
                                </option>
                            ))}
                        </select>
                        <select
                            className="h-9 flex-1 rounded-md border border-input bg-transparent px-2 text-sm md:flex-none"
                            value={sortKey}
                            onChange={(event) => setSortKey(event.target.value as MemorySortKey)}
                        >
                            <option value="recent">{t("settings.memory.sortRecent")}</option>
                            <option value="importance">{t("settings.memory.sortImportance")}</option>
                        </select>
                    </div>
                </div>

                {loading && items.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-muted-foreground">…</div>
                ) : sorted.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-muted-foreground">
                        {filtered ? t("settings.memory.emptySearch") : t("settings.memory.empty")}
                    </div>
                ) : (
                    <>
                        {groups.map((group) => (
                            <div key={group.kind}>
                                <div className="flex items-center justify-between bg-muted/30 px-4 py-1.5">
                                    <span className="text-xs font-medium text-muted-foreground">
                                        {t(SCOPE_LABEL_KEY[group.kind])}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {group.items.length}
                                    </span>
                                </div>
                                <div className="divide-y divide-border/60">
                                    {group.items.map((item) => (
                                        <div
                                            key={item.memoryId}
                                            className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-start md:justify-between md:gap-4"
                                        >
                                            <div className="min-w-0 space-y-1">
                                                <div className="break-words text-sm text-foreground">
                                                    {item.content}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                    <Badge
                                                        variant="secondary"
                                                        className="text-[10px] font-normal"
                                                    >
                                                        {t(TYPE_LABEL_KEY[memoryKind(item.type)])}
                                                    </Badge>
                                                    <span className="text-xs text-muted-foreground">
                                                        {t("settings.memory.importance")} {item.importance}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {formatTime(item.createTime)}
                                                    </span>
                                                </div>
                                                {item.tags && item.tags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1">
                                                        {item.tags.map((tag) => (
                                                            <span
                                                                key={tag}
                                                                className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                                            >
                                                                #{tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex shrink-0 items-center">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={busy}
                                                    className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                                                    onClick={() => void removeMemory(item)}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                    {t("settings.memory.delete")}
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        <div className="px-4 py-3 text-center">
                            {canLoadMore ? (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={loadingMore}
                                    onClick={() => void load(true)}
                                >
                                    {loadingMore ? "…" : t("settings.memory.loadMore")}
                                </Button>
                            ) : (
                                <span className="text-xs text-muted-foreground">
                                    {t("settings.memory.total", { n: shownTotal })}
                                </span>
                            )}
                        </div>
                    </>
                )}
            </SettingsSection>

            <SettingsSection tone="destructive">
                <SettingsRow
                    label={t("settings.memory.purge")}
                    description={t("settings.memory.purgeDesc")}
                    control={
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void purgeAll()}
                        >
                            {t("settings.memory.purge")}
                        </Button>
                    }
                />
            </SettingsSection>
        </SettingsPanel>
    );
};
