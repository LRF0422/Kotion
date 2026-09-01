import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Editor, Plugin, PluginKey, Decoration, DecorationSet } from "@kn/editor";
import { Sparkles, X, Loader2, Check, RotateCcw, Square, Copy, GitCompare, Send } from "@kn/icon";
import { Button, Streamdown, toast } from "@kn/ui";
import {
    streamKnowledgeChat,
    parseMarkdownToNodes,
    useTranslation,
    type AgentChatMessage,
} from "@kn/common";
import {
    AI_ACTION_MAP,
    CUSTOM_ACTION_KEY,
    CUSTOM_SYSTEM,
    AI_TOOLS_EVENT,
    type AiActionMode,
    type AiToolsRunDetail,
} from "../ai-actions";
import { ModelSelector } from "../components/ModelSelector";
import { useModelPreference } from "../model-preference";
import { diffChars } from "./diff";

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

const PANEL_WIDTH = 360;

/** Position the panel just below an anchor point, clamped to the viewport. */
function placeBelow(anchorTop: number, anchorLeft: number): { top: number; left: number } {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchorLeft;
    let top = anchorTop + 8;
    if (left + PANEL_WIDTH > vw - 16) left = vw - PANEL_WIDTH - 16;
    if (left < 16) left = 16;
    if (top + 240 > vh) top = Math.max(16, anchorTop - 248);
    return { top, left };
}

// ─── panel ────────────────────────────────────────────────────────────────

export const AiToolsPanel: React.FC<{ editor: Editor }> = ({ editor }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language?.startsWith("zh") ? "zh" : "en";
    const [selectedModel, setSelectedModel] = useModelPreference();

    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [isCustom, setIsCustom] = useState(false);
    const [applyMode, setApplyMode] = useState<AiActionMode>("replace");
    const [snapshot, setSnapshot] = useState<AiToolsRunDetail | null>(null);
    const [result, setResult] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showDiff, setShowDiff] = useState(false);
    const [input, setInput] = useState("");
    const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    const panelRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    // The running conversation (system + turns). Refine appends to it.
    const messagesRef = useRef<AgentChatMessage[]>([]);

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

    /** Stream a message list, accumulating deltas into `result`. */
    const runMessages = useCallback(async (messages: AgentChatMessage[]) => {
        messagesRef.current = messages;
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        setIsLoading(true);
        setError(null);
        setResult("");
        setShowDiff(false);

        let acc = "";
        try {
            const { textStream } = streamKnowledgeChat(messages, {
                model: selectedModel || undefined,
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
    }, [selectedModel, t]);

    const close = useCallback(() => {
        stop();
        setOpen(false);
        setSnapshot(null);
        setResult("");
        setError(null);
        setInput("");
        setShowDiff(false);
        messagesRef.current = [];
        setSelectionDeco(editor, null);
    }, [editor, stop]);

    // listen for the trigger event from AiStaticMenu
    useEffect(() => {
        const dom = editor.view.dom;
        const onRun = (e: Event) => {
            const detail = (e as CustomEvent<AiToolsRunDetail>).detail;
            const isCustomRun = detail.actionKey === CUSTOM_ACTION_KEY;
            const act = isCustomRun ? null : AI_ACTION_MAP[detail.actionKey];
            if (!isCustomRun && !act) return;

            setPosition(placeBelow(detail.rect.top, detail.rect.left));
            setSnapshot(detail);
            setOpen(true);
            setResult("");
            setError(null);
            setInput("");
            setShowDiff(false);
            messagesRef.current = [];
            setSelectionDeco(editor, { from: detail.from, to: detail.to });

            if (isCustomRun) {
                setIsCustom(true);
                setApplyMode("replace");
                setTitle(t("ai.custom", { defaultValue: "自定义指令" }));
                setIsLoading(false);
                setTimeout(() => inputRef.current?.focus(), 50);
            } else if (act) {
                setIsCustom(false);
                setApplyMode(act.mode);
                setTitle(act.label[lang]);
                runMessages([
                    { role: "system", content: act.system },
                    { role: "user", content: detail.text },
                ]);
            }
        };

        dom.addEventListener(AI_TOOLS_EVENT, onRun);
        return () => dom.removeEventListener(AI_TOOLS_EVENT, onRun);
    }, [editor, runMessages, t, lang]);

    // keep anchored to the selection while the editor scrolls / window resizes
    useEffect(() => {
        if (!open || !snapshot) return;
        const reposition = () => {
            try {
                const coords = editor.view.coordsAtPos(snapshot.to);
                setPosition(placeBelow(coords.bottom, coords.left));
            } catch {
                /* position no longer resolvable */
            }
        };
        const container = document.getElementById("editor-container");
        const onScroll = () => requestAnimationFrame(reposition);
        container?.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll, { passive: true });
        return () => {
            container?.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
        };
    }, [open, snapshot, editor]);

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

    const hasResult = !isLoading && !!result.trim() && !error;

    // input row: first custom instruction, or refine after a result
    const submitInput = useCallback(() => {
        const text = input.trim();
        if (!text || isLoading || !snapshot) return;
        setInput("");

        if (!result.trim()) {
            // first custom instruction
            runMessages([
                { role: "system", content: CUSTOM_SYSTEM },
                { role: "user", content: `指令：${text}\n\n选中文本：\n${snapshot.text}` },
            ]);
        } else {
            // refine on top of the previous answer
            runMessages([
                ...messagesRef.current,
                { role: "assistant", content: result },
                { role: "user", content: text },
            ]);
        }
    }, [input, isLoading, snapshot, result, runMessages]);

    const regenerate = useCallback(() => {
        if (messagesRef.current.length) runMessages(messagesRef.current);
    }, [runMessages]);

    const copy = useCallback(() => {
        if (!result.trim()) return;
        navigator.clipboard?.writeText(result).then(
            () => toast.success(t("ai.copied", { defaultValue: "已复制" })),
            () => toast.error(t("ai.copyFailed", { defaultValue: "复制失败" }))
        );
    }, [result, t]);

    const apply = useCallback((mode: AiActionMode) => {
        if (!snapshot || !result.trim()) return;

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

        if (mode === "append") {
            editor.chain().focus().insertContentAt(to, content, insertOpts).run();
        } else {
            editor.chain().focus().insertContentAt({ from, to }, content, insertOpts).run();
        }
        close();
    }, [snapshot, result, editor, close]);

    const onInputKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitInput();
            }
            e.stopPropagation();
        },
        [submitInput]
    );

    const diffSegments = useMemo(
        () => (showDiff && snapshot && result ? diffChars(snapshot.text, result) : null),
        [showDiff, snapshot, result]
    );

    if (!open) return null;

    // input row shows for: custom (before first result) or refining (after a result)
    const showInput = !isLoading && ((isCustom && !result.trim()) || hasResult);
    const inputPlaceholder = hasResult
        ? t("ai.refinePlaceholder", { defaultValue: "继续修改，如：再短一点…" })
        : t("ai.customPlaceholder", { defaultValue: "告诉 AI 如何处理选中内容…" });

    return createPortal(
        <div
            ref={panelRef}
            className="flex w-[360px] max-w-[calc(100vw-24px)] max-h-[70vh] flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150"
            style={{ position: "fixed", top: position.top, left: position.left, zIndex: 9999 }}
        >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                    <Sparkles className="h-4 w-4 shrink-0 text-purple-500" />
                    <span className="truncate text-sm font-medium">{title}</span>
                </div>
                <button
                    onClick={close}
                    className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    aria-label="Close"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* Body */}
            {(isLoading || result || error) && (
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
                    {error ? (
                        <div className="flex items-start gap-2 text-sm text-destructive">
                            <X className="mt-0.5 h-4 w-4 shrink-0" />
                            <span className="break-words">{error}</span>
                        </div>
                    ) : diffSegments ? (
                        <p className="whitespace-pre-wrap break-words text-sm leading-normal">
                            {diffSegments.map((seg, i) =>
                                seg.type === "equal" ? (
                                    <span key={i}>{seg.text}</span>
                                ) : seg.type === "insert" ? (
                                    <span key={i} className="rounded-sm bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                        {seg.text}
                                    </span>
                                ) : (
                                    <span key={i} className="rounded-sm bg-red-500/15 text-red-500 line-through">
                                        {seg.text}
                                    </span>
                                )
                            )}
                        </p>
                    ) : result ? (
                        <div className="text-sm leading-normal text-foreground/90">
                            <Streamdown isAnimating={isLoading}>{result}</Streamdown>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 py-1.5 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t("ai.generating", { defaultValue: "生成中…" })}
                        </div>
                    )}
                </div>
            )}

            {/* Instruction / refine input */}
            {showInput && (
                <div className="shrink-0 border-t px-3 py-2">
                    <div className="flex items-end gap-2">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={onInputKeyDown}
                            placeholder={inputPlaceholder}
                            rows={2}
                            className="flex-1 resize-none rounded-md border border-input bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        <Button
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            disabled={!input.trim()}
                            onClick={submitInput}
                            aria-label="Send"
                        >
                            <Send className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-muted/30 px-3 py-2">
                {/* left: model selector + icon-only utilities */}
                <div className="flex min-w-0 flex-wrap items-center gap-0.5">
                    <ModelSelector
                        model={selectedModel}
                        onModelChange={setSelectedModel}
                        disabled={isLoading}
                        density="compact"
                        contentClassName="z-[10000]"
                    />
                    {hasResult && (
                        <button
                            type="button"
                            title={t("ai.copy", { defaultValue: "复制" })}
                            aria-label={t("ai.copy", { defaultValue: "复制" })}
                            onClick={copy}
                            className="flex h-11 w-11 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-7 lg:w-7"
                        >
                            <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                    )}
                    {hasResult && applyMode === "replace" && (
                        <button
                            type="button"
                            title={t("ai.diff", { defaultValue: "对比改动" })}
                            aria-label={t("ai.diff", { defaultValue: "对比改动" })}
                            aria-pressed={showDiff}
                            onClick={() => setShowDiff((v) => !v)}
                            className={`flex h-11 w-11 items-center justify-center rounded-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-7 lg:w-7 ${showDiff ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
                        >
                            <GitCompare aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                    )}
                    {(hasResult || error) && messagesRef.current.length > 0 && (
                        <button
                            type="button"
                            title={t("ai.regenerate", { defaultValue: "重新生成" })}
                            aria-label={t("ai.regenerate", { defaultValue: "重新生成" })}
                            onClick={regenerate}
                            className="flex h-11 w-11 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-7 lg:w-7"
                        >
                            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>

                {/* right: discard / apply */}
                <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
                    {isLoading ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-11 gap-1.5 px-3 text-sm lg:h-7 lg:px-2.5 lg:text-xs"
                            onClick={stop}
                        >
                            <Square aria-hidden="true" className="h-3 w-3" />
                            {t("ai.stop", { defaultValue: "停止" })}
                        </Button>
                    ) : (
                        <>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-11 px-3 text-sm text-muted-foreground lg:h-7 lg:px-2.5 lg:text-xs"
                                onClick={close}
                            >
                                {t("ai.discard", { defaultValue: "丢弃" })}
                            </Button>
                            {hasResult && applyMode === "replace" && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-11 px-3 text-sm lg:h-7 lg:px-2.5 lg:text-xs"
                                    onClick={() => apply("append")}
                                >
                                    {t("ai.insertBelow", { defaultValue: "下方插入" })}
                                </Button>
                            )}
                            {hasResult && (
                                <Button
                                    type="button"
                                    size="sm"
                                    className="h-11 gap-1.5 px-3 text-sm lg:h-7 lg:px-2.5 lg:text-xs"
                                    onClick={() => apply(applyMode)}
                                >
                                    <Check aria-hidden="true" className="h-3 w-3" />
                                    {applyMode === "append"
                                        ? t("ai.insert", { defaultValue: "插入" })
                                        : t("ai.replace", { defaultValue: "替换" })}
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
