import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Editor, Plugin, PluginKey, Decoration, DecorationSet } from "@kn/editor";
import { Sparkles, X, Loader2, Check, RotateCcw, Square } from "@kn/icon";
import { Button, Streamdown, toast } from "@kn/ui";
import { streamKnowledgeText, parseMarkdownToNodes, useTranslation } from "@kn/common";
import { AI_TOOLS_EVENT, AI_ACTION_MAP, type AiActionDef, type AiToolsRunDetail } from "../ai-actions";

// ─── virtual selection decoration (keeps the target highlighted while the
//     editor selection is lost to the panel) ──────────────────────────────

const selectionKey = new PluginKey("ai-tools-virtual-selection");

function createSelectionPlugin() {
    return new Plugin({
        key: selectionKey,
        state: {
            init: () => DecorationSet.empty,
            apply(tr, set) {
                const meta = tr.getMeta(selectionKey);
                if (meta === null) return DecorationSet.empty;
                if (meta) {
                    return DecorationSet.create(tr.doc, [
                        Decoration.inline(meta.from, meta.to, {
                            style: "background-color:rgba(99,102,241,0.18);border-radius:2px;",
                        }),
                    ]);
                }
                return set.map(tr.mapping, tr.doc);
            },
        },
        props: {
            decorations(state) {
                return selectionKey.getState(state);
            },
        },
    });
}

function setSelectionDeco(editor: Editor, range: { from: number; to: number } | null) {
    try {
        editor.view.dispatch(editor.state.tr.setMeta(selectionKey, range));
    } catch {
        /* ignore invalid positions */
    }
}

// ─── panel ────────────────────────────────────────────────────────────────

export const AiToolsPanel: React.FC<{ editor: Editor }> = ({ editor }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language?.startsWith("zh") ? "zh" : "en";

    const [open, setOpen] = useState(false);
    const [action, setAction] = useState<AiActionDef | null>(null);
    const [snapshot, setSnapshot] = useState<AiToolsRunDetail | null>(null);
    const [result, setResult] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    const panelRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    // register / unregister the highlight plugin
    useEffect(() => {
        const plugin = createSelectionPlugin();
        editor.registerPlugin(plugin);
        return () => {
            setSelectionDeco(editor, null);
            editor.unregisterPlugin(selectionKey);
        };
    }, [editor]);

    const stop = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        setIsLoading(false);
    }, []);

    const runStream = useCallback(async (act: AiActionDef, snap: AiToolsRunDetail) => {
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        setIsLoading(true);
        setError(null);
        setResult("");

        let acc = "";
        try {
            const { textStream } = streamKnowledgeText(snap.text, {
                system: act.system,
                signal: ac.signal,
            });
            for await (const part of textStream) {
                if (ac.signal.aborted) break;
                acc += part;
                setResult(acc);
            }
        } catch (err: any) {
            if (!ac.signal.aborted) {
                setError(err?.message || t("ai.generateFailed", { defaultValue: "生成失败，请重试" }));
            }
        } finally {
            if (abortRef.current === ac) abortRef.current = null;
            setIsLoading(false);
        }
    }, [t]);

    const close = useCallback(() => {
        stop();
        setOpen(false);
        setAction(null);
        setSnapshot(null);
        setResult("");
        setError(null);
        setSelectionDeco(editor, null);
    }, [editor, stop]);

    // listen for the trigger event from AiStaticMenu
    useEffect(() => {
        const dom = editor.view.dom;
        const onRun = (e: Event) => {
            const detail = (e as CustomEvent<AiToolsRunDetail>).detail;
            const act = AI_ACTION_MAP[detail.actionKey];
            if (!act) return;

            // position the panel below the selection, clamped to the viewport
            const panelWidth = 360;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            let left = detail.rect.left;
            let top = detail.rect.top + 8;
            if (left + panelWidth > vw - 16) left = vw - panelWidth - 16;
            if (left < 16) left = 16;
            if (top + 240 > vh) top = Math.max(16, detail.rect.top - 248);
            setPosition({ top, left });

            setAction(act);
            setSnapshot(detail);
            setOpen(true);
            setSelectionDeco(editor, { from: detail.from, to: detail.to });
            runStream(act, detail);
        };

        dom.addEventListener(AI_TOOLS_EVENT, onRun);
        return () => dom.removeEventListener(AI_TOOLS_EVENT, onRun);
    }, [editor, runStream]);

    // escape + click-outside
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
        };
        const onClick = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) close();
        };
        document.addEventListener("keydown", onKey);
        const timer = setTimeout(() => document.addEventListener("mousedown", onClick), 0);
        return () => {
            document.removeEventListener("keydown", onKey);
            clearTimeout(timer);
            document.removeEventListener("mousedown", onClick);
        };
    }, [open, close]);

    const accept = useCallback(() => {
        if (!action || !snapshot || !result.trim()) return;

        const text = result.trim();
        let content: any = text;
        try {
            const nodes = parseMarkdownToNodes(text);
            if (Array.isArray(nodes) && nodes.length > 0) content = nodes;
        } catch {
            /* fall back to plain text */
        }

        const insertOpts = {
            applyInputRules: false,
            applyPasteRules: false,
            parseOptions: { preserveWhitespace: false },
        } as const;

        const docSize = editor.state.doc.content.size;
        const from = Math.min(snapshot.from, docSize);
        const to = Math.min(snapshot.to, docSize);

        if (action.mode === "append") {
            editor.chain().focus().insertContentAt(to, content, insertOpts).run();
        } else {
            editor.chain().focus().insertContentAt({ from, to }, content, insertOpts).run();
        }

        close();
    }, [action, snapshot, result, editor, close]);

    const regenerate = useCallback(() => {
        if (action && snapshot) runStream(action, snapshot);
    }, [action, snapshot, runStream]);

    if (!open || !action) return null;

    const showActions = !isLoading && !!result.trim();

    return createPortal(
        <div
            ref={panelRef}
            className="flex flex-col w-[360px] max-h-[60vh] rounded-lg border border-indigo-200/60 dark:border-indigo-800/60 bg-background shadow-xl animate-in fade-in-0 slide-in-from-top-1 duration-150"
            style={{ position: "fixed", top: position.top, left: position.left, zIndex: 9999 }}
        >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-border/50 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 rounded-t-lg">
                <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                    <span className="text-xs font-medium truncate">{action.label[lang]}</span>
                </div>
                <button
                    onClick={close}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Close"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
                {error ? (
                    <div className="flex items-start gap-2 text-xs text-red-500">
                        <X className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span className="break-words">{error}</span>
                    </div>
                ) : result ? (
                    <div className="text-xs text-foreground/90">
                        <Streamdown isAnimating={isLoading}>{result}</Streamdown>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t("ai.generating", { defaultValue: "生成中…" })}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="shrink-0 flex items-center justify-end gap-1.5 px-3 py-2 border-t border-border/40">
                {isLoading ? (
                    <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2.5 text-xs" onClick={stop}>
                        <Square className="h-3 w-3" />
                        {t("ai.stop", { defaultValue: "停止" })}
                    </Button>
                ) : (
                    <>
                        <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2.5 text-xs" onClick={close}>
                            {t("ai.discard", { defaultValue: "丢弃" })}
                        </Button>
                        {(showActions || error) && (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 gap-1.5 px-2.5 text-xs"
                                onClick={regenerate}
                            >
                                <RotateCcw className="h-3 w-3" />
                                {t("ai.regenerate", { defaultValue: "重新生成" })}
                            </Button>
                        )}
                        {showActions && (
                            <Button
                                size="sm"
                                className="h-7 gap-1.5 px-2.5 text-xs bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600"
                                onClick={accept}
                            >
                                <Check className="h-3 w-3" />
                                {action.mode === "append"
                                    ? t("ai.insert", { defaultValue: "插入" })
                                    : t("ai.replace", { defaultValue: "替换" })}
                            </Button>
                        )}
                    </>
                )}
            </div>
        </div>,
        document.body
    );
};
