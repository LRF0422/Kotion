import React, { useCallback, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Editor } from "@tiptap/core";
import { useTranslation } from "@kn/common";
import {
    Check,
    ChevronDown,
    ChevronUp,
    FileDiff,
    Pencil,
    Plus,
    Trash2,
    Undo2,
    X,
} from "@kn/icon";
import { cn } from "@kn/ui";
import {
    indexTopBlocks,
    type ChangeTrackerStorage,
    type EditorOpBlockChange,
} from "../extensions/change-tracker";

const getTracker = (editor: Editor | null | undefined): ChangeTrackerStorage | undefined =>
    (editor?.storage as any)?.changeTracker as ChangeTrackerStorage | undefined;

/** Action chip colors follow the decoration stripe colors on the canvas. */
const ACTION_META: Record<EditorOpBlockChange["action"], {
    icon: React.ReactNode
    labelKey: string
    labelDefault: string
    className: string
}> = {
    insert: {
        icon: <Plus className="h-3 w-3" />,
        labelKey: "editor.tracker.actionInsert",
        labelDefault: "新增",
        className: "text-green-600 dark:text-green-400",
    },
    update: {
        icon: <Pencil className="h-3 w-3" />,
        labelKey: "editor.tracker.actionUpdate",
        labelDefault: "修改",
        className: "text-amber-600 dark:text-amber-400",
    },
    delete: {
        icon: <Trash2 className="h-3 w-3" />,
        labelKey: "editor.tracker.actionDelete",
        labelDefault: "删除",
        className: "text-red-600 dark:text-red-400",
    },
};

/**
 * Floating merge bar for the ChangeTracker extension: lists the pending
 * block changes of the active tracking session and merges them manually —
 * per block (keep / restore) or all at once. Changed blocks are highlighted
 * on the canvas by the extension's decorations; deleted blocks (no live
 * node) surface only here.
 *
 * Mounted by both editor surfaces (render / collaboration) above the status
 * bar; renders nothing unless tracking is enabled (the toggle lives in the
 * AI chat composer).
 */
export const ChangeTrackerBar: React.FC<{ editor: Editor }> = ({ editor }) => {
    const { t } = useTranslation();
    const storage = getTracker(editor);

    const subscribe = useCallback(
        (cb: () => void) => storage?.subscribe(cb) ?? (() => {}),
        [storage],
    );
    useSyncExternalStore(subscribe, () => storage?.version ?? 0);

    const [expanded, setExpanded] = useState(false);

    if (!storage || !storage.enabled) return null;
    const changes = storage.changes;
    const selected = storage.selected;
    // Popup anchor: viewport coords of the clicked change (fixed positioning),
    // placed just below the changed text so it never covers the span itself.
    let popupCoords: { left: number; top: number } | null = null;
    if (selected) {
        try {
            const pos = Math.min(selected.from, editor.state.doc.content.size);
            const coords = editor.view.coordsAtPos(pos);
            popupCoords = { left: coords.left, top: coords.bottom + 6 };
        } catch {
            popupCoords = null;
        }
    }

    /** Scroll a pending block into view (inserts/updates only). */
    const reveal = (blockId: string) => {
        const entry = indexTopBlocks(editor.state.doc).get(blockId);
        if (!entry) return;
        const dom = editor.view.nodeDOM(entry.pos) as HTMLElement | null;
        dom?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    return (
        <>
        {/* Accept/reject popup anchored at the clicked canvas change.
            Portaled to body: kept-alive editor tab layers use transform-gpu,
            which creates a containing block that would trap position:fixed and
            offset the viewport coords returned by coordsAtPos. */}
        {selected && popupCoords && createPortal(
            <div
                className="fixed z-50 flex items-center gap-0.5 rounded-lg border border-border/60 bg-background p-0.5 shadow-lg"
                style={{ left: popupCoords.left, top: popupCoords.top }}
                onMouseDown={(e) => e.preventDefault()}
            >
                <button
                    type="button"
                    className="flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium text-green-600 hover:bg-green-500/10 dark:text-green-400"
                    onClick={() => storage.acceptSelection()}
                >
                    <Check className="h-3 w-3" />
                    {t("editor.tracker.acceptOne", { defaultValue: "保留此变动" })}
                </button>
                <button
                    type="button"
                    className="flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => storage.rejectSelection()}
                >
                    <Undo2 className="h-3 w-3" />
                    {t("editor.tracker.restoreOne", { defaultValue: "恢复此块" })}
                </button>
            </div>,
            document.body,
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-10 z-30 flex justify-center px-4">
            <div className="pointer-events-auto w-full max-w-[520px] overflow-hidden rounded-xl border border-border/60 bg-background/95 shadow-lg backdrop-blur">
                {/* Header — always visible; toggles the change list. */}
                <div
                    className="flex h-9 cursor-pointer items-center gap-2 px-3 select-none"
                    onClick={() => setExpanded(v => !v)}
                >
                    <FileDiff className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="text-xs font-medium">
                        {t("editor.tracker.title", { defaultValue: "跟踪中" })}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                        {t("editor.tracker.count", {
                            defaultValue: "{{count}} 项变动",
                            count: changes.length,
                        })}
                    </span>
                    <span className="ml-auto flex items-center gap-1">
                        <button
                            type="button"
                            title={t("editor.tracker.acceptAll", { defaultValue: "全部保留" })}
                            className="flex h-6 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:opacity-90"
                            onClick={(e) => {
                                e.stopPropagation();
                                storage.acceptAll();
                            }}
                        >
                            <Check className="h-3 w-3" />
                            {t("editor.tracker.acceptAll", { defaultValue: "全部保留" })}
                        </button>
                        <button
                            type="button"
                            title={t("editor.tracker.restoreAll", { defaultValue: "全部恢复" })}
                            className="flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={(e) => {
                                e.stopPropagation();
                                storage.restoreAll();
                            }}
                        >
                            <Undo2 className="h-3 w-3" />
                            {t("editor.tracker.restoreAll", { defaultValue: "全部恢复" })}
                        </button>
                        <button
                            type="button"
                            title={t("editor.tracker.stop", { defaultValue: "停止跟踪（保留现有内容）" })}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={(e) => {
                                e.stopPropagation();
                                storage.stop();
                            }}
                        >
                            <X className="h-3 w-3" />
                        </button>
                        {expanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
                    </span>
                </div>

                {/* Pending change list */}
                {expanded && (
                    <div className="max-h-[240px] overflow-y-auto border-t border-border/50">
                        {changes.length === 0 && (
                            <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">
                                {t("editor.tracker.empty", { defaultValue: "暂无变动，文档与基线一致" })}
                            </div>
                        )}
                        {changes.map((change) => {
                            const meta = ACTION_META[change.action];
                            const revealable = change.action !== "delete";
                            return (
                                <div
                                    key={change.blockId}
                                    className={cn(
                                        "group flex items-center gap-2 px-3 py-1.5 text-xs",
                                        revealable && "cursor-pointer hover:bg-muted/50",
                                    )}
                                    onClick={() => revealable && reveal(change.blockId)}
                                >
                                    <span className={cn("flex shrink-0 items-center gap-1", meta.className)}>
                                        {meta.icon}
                                        <span className="text-[11px]">
                                            {t(meta.labelKey, { defaultValue: meta.labelDefault })}
                                        </span>
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                                        {change.textPreview || change.blockType || change.blockId}
                                    </span>
                                    <span className="flex shrink-0 items-center gap-0.5 opacity-60 group-hover:opacity-100">
                                        <button
                                            type="button"
                                            title={t("editor.tracker.acceptOne", { defaultValue: "保留此变动" })}
                                            className="flex h-5 w-5 items-center justify-center rounded text-green-600 hover:bg-green-500/10 dark:text-green-400"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                storage.accept(change.blockId);
                                            }}
                                        >
                                            <Check className="h-3 w-3" />
                                        </button>
                                        <button
                                            type="button"
                                            title={t("editor.tracker.restoreOne", { defaultValue: "恢复此块" })}
                                            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                storage.restore(change.blockId);
                                            }}
                                        >
                                            <Undo2 className="h-3 w-3" />
                                        </button>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
        </>
    );
};

export default ChangeTrackerBar;
