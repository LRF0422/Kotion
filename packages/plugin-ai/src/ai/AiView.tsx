import { NodeViewProps, NodeViewContent, NodeViewWrapper } from "@kn/editor";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Streamdown, Textarea, toast } from "@kn/ui";
import { Check, Copy, Loader2, RotateCcw, Send, Sparkles, Square, X } from "@kn/icon";
import {
    streamKnowledgeChat,
    parseMarkdownToNodes,
    useTranslation,
    type AgentChatMessage,
} from "@kn/common";
import { ModelSelector } from "./components/ModelSelector";
import { useModelPreference } from "./model-preference";

const AI_BLOCK_SYSTEM =
    "你是写作助手。请根据用户的要求生成内容，使用 Markdown 格式，直接输出正文，不要解释或寒暄。";

const QUICK_PROMPTS: Array<{ zh: string; en: string; seed: string }> = [
    { zh: "写大纲", en: "Outline", seed: "帮我写一份关于以下主题的大纲：" },
    { zh: "头脑风暴", en: "Brainstorm", seed: "围绕以下主题头脑风暴一些想法：" },
    { zh: "写一段", en: "Draft", seed: "帮我写一段关于以下内容的文字：" },
];

const INSERT_OPTS = {
    applyInputRules: false,
    applyPasteRules: false,
    parseOptions: { preserveWhitespace: false },
} as const;

/**
 * Notion-style AI block.
 *
 * Flow: write a prompt → stream a preview → accept (replace the block with the
 * generated content), discard, regenerate, or refine with a follow-up. Nothing
 * is committed to the document until the user accepts.
 */
export const AiView: React.FC<NodeViewProps> = (props) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language?.startsWith("zh") ? "zh" : "en";
    const editable = props.editor.isEditable;
    const [selectedModel, setSelectedModel] = useModelPreference();

    const [prompt, setPrompt] = useState<string>(props.node.attrs.prompt || "");
    const [refineText, setRefineText] = useState("");
    const [result, setResult] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const abortRef = useRef<AbortController | null>(null);
    const messagesRef = useRef<AgentChatMessage[]>([]);
    const promptRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => () => abortRef.current?.abort(), []);

    const stop = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        setIsLoading(false);
    }, []);

    const runMessages = useCallback(async (messages: AgentChatMessage[]) => {
        messagesRef.current = messages;
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        setIsLoading(true);
        setError(null);
        setResult("");

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

    const generate = useCallback((p: string) => {
        const text = p.trim();
        if (!text || isLoading) return;
        props.updateAttributes({ ...props.node.attrs, prompt: text });
        runMessages([
            { role: "system", content: AI_BLOCK_SYSTEM },
            { role: "user", content: text },
        ]);
    }, [isLoading, props, runMessages]);

    const refine = useCallback(() => {
        const text = refineText.trim();
        if (!text || isLoading || !result.trim()) return;
        setRefineText("");
        runMessages([
            ...messagesRef.current,
            { role: "assistant", content: result },
            { role: "user", content: text },
        ]);
    }, [refineText, isLoading, result, runMessages]);

    const accept = useCallback(() => {
        if (!result.trim()) return;
        const pos = props.getPos();
        if (typeof pos !== "number") return;

        let content: any = result.trim();
        try {
            const nodes = parseMarkdownToNodes(result.trim());
            if (Array.isArray(nodes) && nodes.length > 0) content = nodes;
        } catch {
            /* fall back to plain text */
        }

        // Replace the whole AI block with the generated content.
        props.editor
            .chain()
            .focus()
            .insertContentAt({ from: pos, to: pos + props.node.nodeSize }, content, INSERT_OPTS)
            .run();
    }, [result, props]);

    const copy = useCallback(() => {
        if (!result.trim()) return;
        navigator.clipboard?.writeText(result).then(
            () => toast.success(t("ai.copied", { defaultValue: "已复制" })),
            () => toast.error(t("ai.copyFailed", { defaultValue: "复制失败" }))
        );
    }, [result, t]);

    const hasOutput = !!result.trim();
    const hasResult = !isLoading && hasOutput && !error;
    const isIdle = !isLoading && !hasOutput && !error;
    const showPreview = isLoading || hasOutput || !!error;
    const canRegenerate = (hasResult || !!error) && messagesRef.current.length > 0;
    const activeValue = hasResult ? refineText : prompt;

    useEffect(() => {
        const el = promptRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }, [activeValue, hasResult, isLoading]);

    const submitCurrentInput = useCallback(() => {
        if (hasResult) {
            refine();
        } else {
            generate(prompt);
        }
    }, [generate, hasResult, prompt, refine]);

    const onComposerKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submitCurrentInput();
        } else if (e.key === "Escape" && !hasOutput && !isLoading) {
            e.preventDefault();
            props.deleteNode();
        }
        e.stopPropagation();
    }, [hasOutput, isLoading, props, submitCurrentInput]);

    const selectQuickPrompt = useCallback((seed: string) => {
        setPrompt(seed);
        requestAnimationFrame(() => {
            const el = promptRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(seed.length, seed.length);
        });
    }, []);

    // Read-only / non-editable: don't show the authoring UI.
    if (!editable) {
        return (
            <NodeViewWrapper as="div">
                <div className="hidden" aria-hidden="true">
                    <NodeViewContent />
                </div>
            </NodeViewWrapper>
        );
    }

    const title = t("ai.title", { defaultValue: "由 AI 生成" });
    const generatingLabel = t("ai.generating", { defaultValue: "生成中…" });
    const composerPlaceholder = hasResult
        ? t("ai.refinePlaceholder", { defaultValue: "继续修改，如：再正式一点…" })
        : t("ai.blockPlaceholder", { defaultValue: "让 AI 帮你写点什么…" });
    const composerDisabled = hasResult ? !refineText.trim() : !prompt.trim();

    return (
        <NodeViewWrapper as="div" className="my-2">
            <div
                role="region"
                contentEditable={false}
                aria-label={title}
                aria-busy={isLoading}
                className="not-prose overflow-hidden rounded-xl border border-border/40 bg-popover text-popover-foreground shadow-sm transition-shadow focus-within:border-ring/40 focus-within:ring-1 focus-within:ring-ring/10"
            >
                <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                    {isLoading ? generatingLabel : hasResult ? title : ""}
                </span>

                {showPreview && (
                    <div className="max-h-[45vh] min-h-0 overflow-y-auto overflow-x-hidden border-b border-border/30 px-3 py-3 lg:max-h-[360px] lg:px-4">
                        {!error && (isLoading || hasOutput) && (
                            <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                                {isLoading ? (
                                    <Loader2
                                        aria-hidden="true"
                                        className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none"
                                    />
                                ) : (
                                    <Sparkles aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary" />
                                )}
                                <span>{isLoading ? generatingLabel : title}</span>
                            </div>
                        )}

                        {error ? (
                            <div role="alert" className="flex items-start gap-2 text-sm text-destructive">
                                <X aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                                <span className="min-w-0 break-words">{error}</span>
                            </div>
                        ) : hasOutput ? (
                            <div className="min-w-0 break-words text-sm leading-relaxed text-foreground/90">
                                <Streamdown isAnimating={isLoading}>{result}</Streamdown>
                            </div>
                        ) : null}
                    </div>
                )}

                {!isLoading && (
                    <div>
                        <div className="flex items-end gap-2 px-2 py-2 lg:px-3">
                            <Sparkles
                                aria-hidden="true"
                                className="mb-3 ml-1 h-4 w-4 shrink-0 text-primary lg:mb-2"
                            />
                            <Textarea
                                ref={promptRef}
                                value={activeValue}
                                onChange={(e) =>
                                    hasResult ? setRefineText(e.target.value) : setPrompt(e.target.value)
                                }
                                onKeyDown={onComposerKeyDown}
                                rows={1}
                                autoFocus
                                placeholder={composerPlaceholder}
                                aria-label={composerPlaceholder}
                                className="min-h-11 max-h-[120px] flex-1 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-1 py-2.5 text-sm leading-relaxed shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0 lg:min-h-8 lg:py-1.5"
                            />
                            <Button
                                type="button"
                                size="icon"
                                disabled={composerDisabled}
                                onClick={submitCurrentInput}
                                aria-label={t("ai.chat.send", { defaultValue: "发送" })}
                                title={t("ai.chat.send", { defaultValue: "发送" })}
                                className="h-11 w-11 shrink-0 rounded-lg disabled:cursor-not-allowed lg:h-8 lg:w-8"
                            >
                                <Send aria-hidden="true" className="h-4 w-4" />
                            </Button>
                        </div>

                        {isIdle && (
                            <div className="border-t border-border/30 p-1.5">
                                {QUICK_PROMPTS.map((q) => (
                                    <button
                                        key={q.zh}
                                        type="button"
                                        onClick={() => selectQuickPrompt(q.seed)}
                                        className="flex h-11 w-full items-center rounded-lg px-3 text-left text-sm font-normal text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-8 lg:text-[13px]"
                                    >
                                        {q[lang]}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-2 border-t border-border/30 bg-muted/20 px-2 py-1.5 lg:px-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                        <ModelSelector
                            model={selectedModel}
                            onModelChange={setSelectedModel}
                            disabled={isLoading}
                            density="comfortable"
                        />
                        {hasResult && (
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                title={t("ai.copy", { defaultValue: "复制" })}
                                aria-label={t("ai.copy", { defaultValue: "复制" })}
                                onClick={copy}
                                className="h-11 w-11 text-muted-foreground lg:h-8 lg:w-8"
                            >
                                <Copy aria-hidden="true" className="h-4 w-4" />
                            </Button>
                        )}
                        {hasResult && canRegenerate && (
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                title={t("ai.regenerate", { defaultValue: "重新生成" })}
                                aria-label={t("ai.regenerate", { defaultValue: "重新生成" })}
                                onClick={() => runMessages(messagesRef.current)}
                                className="h-11 w-11 text-muted-foreground lg:h-8 lg:w-8"
                            >
                                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                            </Button>
                        )}
                    </div>

                    <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
                        {isLoading ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-11 gap-2 px-3 text-sm font-normal lg:h-8 lg:px-2.5 lg:text-xs"
                                onClick={stop}
                                aria-label={t("ai.stop", { defaultValue: "停止" })}
                            >
                                <Square aria-hidden="true" className="h-3.5 w-3.5" />
                                {t("ai.stop", { defaultValue: "停止" })}
                            </Button>
                        ) : (
                            <>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-11 px-3 text-sm font-normal text-muted-foreground lg:h-8 lg:px-2.5 lg:text-xs"
                                    onClick={props.deleteNode}
                                    aria-label={t("ai.discard", { defaultValue: "丢弃" })}
                                >
                                    {t("ai.discard", { defaultValue: "丢弃" })}
                                </Button>
                                {error && canRegenerate && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-11 gap-2 px-3 text-sm font-normal lg:h-8 lg:px-2.5 lg:text-xs"
                                        onClick={() => runMessages(messagesRef.current)}
                                    >
                                        <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                                        {t("ai.regenerate", { defaultValue: "重新生成" })}
                                    </Button>
                                )}
                                {hasResult && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="h-11 gap-2 px-3 text-sm font-normal lg:h-8 lg:px-2.5 lg:text-xs"
                                        onClick={accept}
                                        aria-label={t("ai.accept", { defaultValue: "保留" })}
                                    >
                                        <Check aria-hidden="true" className="h-3.5 w-3.5" />
                                        {t("ai.accept", { defaultValue: "保留" })}
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Hidden content slot to satisfy the node's `block+` schema. */}
            <div className="hidden" aria-hidden="true">
                <NodeViewContent />
            </div>
        </NodeViewWrapper>
    );
};
