import React, { useCallback, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { Editor } from "@tiptap/core"
import { useTranslation } from "@kn/common"
import { Check, ChevronDown, ChevronUp, FileDiff, Plus, Trash2, X } from "@kn/icon"
import { cn } from "@kn/ui"
import type { ChangeTrackerStorage, SuggestionType } from "../extensions/change-tracker"

const getTracker = (editor: Editor | null | undefined): ChangeTrackerStorage | undefined =>
    (editor?.storage as any)?.changeTracker as ChangeTrackerStorage | undefined

const ACTION_META: Record<SuggestionType, {
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
    delete: {
        icon: <Trash2 className="h-3 w-3" />,
        labelKey: "editor.tracker.actionDelete",
        labelDefault: "删除",
        className: "text-red-600 dark:text-red-400",
    },
}

/**
 * Floating review bar for the ChangeTracker extension. Lists the tracked
 * suggestions (insertions / deletions) and merges them manually — per
 * suggestion or all at once. Suggestions are suggestion marks living in the
 * document, so the list is derived from the live doc on every update.
 */
export const ChangeTrackerBar: React.FC<{ editor: Editor }> = ({ editor }) => {
    const { t } = useTranslation()
    const storage = getTracker(editor)

    const subscribe = useCallback(
        (cb: () => void) => storage?.subscribe(cb) ?? (() => {}),
        [storage],
    )
    useSyncExternalStore(subscribe, () => storage?.version ?? 0)

    const [expanded, setExpanded] = useState(false)

    if (!storage || (!storage.enabled && storage.suggestions.length === 0)) return null

    const suggestions = storage.suggestions
    const selected = storage.selected

    let popupCoords: { left: number; top: number } | null = null
    if (selected) {
        try {
            const pos = Math.min(selected.from, editor.state.doc.content.size)
            const coords = editor.view.coordsAtPos(pos)
            popupCoords = { left: coords.left, top: coords.bottom + 6 }
        } catch {
            popupCoords = null
        }
    }

    const reveal = (from: number) => {
        const pos = Math.min(from, editor.state.doc.content.size)
        const dom = editor.view.nodeDOM(pos) as HTMLElement | null
        dom?.scrollIntoView?.({ behavior: "smooth", block: "center" })
    }

    return (
        <>
        {/* Accept/reject popup anchored at the clicked suggestion. */}
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
                    {t("editor.tracker.acceptOne", { defaultValue: "接受" })}
                </button>
                <button
                    type="button"
                    className="flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"
                    onClick={() => storage.rejectSelection()}
                >
                    <X className="h-3 w-3" />
                    {t("editor.tracker.rejectOne", { defaultValue: "拒绝" })}
                </button>
            </div>,
            document.body,
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-10 z-30 flex justify-center px-4">
            <div className="pointer-events-auto w-full max-w-[520px] overflow-hidden rounded-xl border border-border/60 bg-background/95 shadow-lg backdrop-blur">
                {/* Header */}
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
                            count: suggestions.length,
                        })}
                    </span>
                    <span className="ml-auto flex items-center gap-1">
                        <button
                            type="button"
                            title={t("editor.tracker.acceptAll", { defaultValue: "全部接受" })}
                            className="flex h-6 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:opacity-90"
                            onClick={(e) => {
                                e.stopPropagation()
                                storage.acceptAll()
                            }}
                        >
                            <Check className="h-3 w-3" />
                            {t("editor.tracker.acceptAll", { defaultValue: "全部接受" })}
                        </button>
                        <button
                            type="button"
                            title={t("editor.tracker.rejectAll", { defaultValue: "全部拒绝" })}
                            className="flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"
                            onClick={(e) => {
                                e.stopPropagation()
                                storage.rejectAll()
                            }}
                        >
                            <X className="h-3 w-3" />
                            {t("editor.tracker.rejectAll", { defaultValue: "全部拒绝" })}
                        </button>
                        <button
                            type="button"
                            title={t("editor.tracker.stop", { defaultValue: "停止跟踪" })}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={(e) => {
                                e.stopPropagation()
                                storage.stop()
                            }}
                        >
                            <X className="h-3 w-3" />
                        </button>
                        {expanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
                    </span>
                </div>

                {/* Suggestion list */}
                {expanded && (
                    <div className="max-h-[240px] overflow-y-auto border-t border-border/50">
                        {suggestions.length === 0 && (
                            <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">
                                {t("editor.tracker.empty", { defaultValue: "暂无变动" })}
                            </div>
                        )}
                        {suggestions.map((s) => {
                            const meta = ACTION_META[s.type]
                            return (
                                <div
                                    key={s.type + "-" + s.from + "-" + s.to}
                                    className="group flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50"
                                    onClick={() => reveal(s.from)}
                                >
                                    <span className={cn("flex shrink-0 items-center gap-1", meta.className)}>
                                        {meta.icon}
                                        <span className="text-[11px]">
                                            {t(meta.labelKey, { defaultValue: meta.labelDefault })}
                                        </span>
                                    </span>
                                    <span className={cn(
                                        "min-w-0 flex-1 truncate text-muted-foreground",
                                        s.type === "delete" && "line-through opacity-70",
                                    )}>
                                        {s.text || "…"}
                                    </span>
                                    <span className="flex shrink-0 items-center gap-0.5 opacity-60 group-hover:opacity-100">
                                        <button
                                            type="button"
                                            title={t("editor.tracker.acceptOne", { defaultValue: "接受" })}
                                            className="flex h-5 w-5 items-center justify-center rounded text-green-600 hover:bg-green-500/10 dark:text-green-400"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                storage.accept(s.from, s.to, s.type)
                                            }}
                                        >
                                            <Check className="h-3 w-3" />
                                        </button>
                                        <button
                                            type="button"
                                            title={t("editor.tracker.rejectOne", { defaultValue: "拒绝" })}
                                            className="flex h-5 w-5 items-center justify-center rounded text-red-600 hover:bg-red-500/10 dark:text-red-400"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                storage.reject(s.from, s.to, s.type)
                                            }}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
        </>
    )
}

export default ChangeTrackerBar
