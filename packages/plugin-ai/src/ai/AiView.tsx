import { NodeViewProps, NodeViewContent, NodeViewWrapper } from "@kn/editor";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Streamdown, toast } from "@kn/ui";
import { Check, Copy, Loader2, RotateCcw, Send, Sparkles, Square, X } from "@kn/icon";
import {
    streamKnowledgeChat,
    parseMarkdownToNodes,
    useTranslation,
    type AgentChatMessage,
} from "@kn/common";

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
            const { textStream } = streamKnowledgeChat(messages, { signal: ac.signal });
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

    const onPromptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            generate(prompt);
        } else if (e.key === "Escape" && !result && !isLoading) {
            // Notion-style: Esc on an empty draft discards the block.
            e.preventDefault();
            props.deleteNode();
        }
        e.stopPropagation();
    };

    const onRefineKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            refine();
        }
        e.stopPropagation();
    };

    const hasResult = !isLoading && !!result.trim() && !error;

    // Read-only / non-editable: don't show the authoring UI.
    if (!editable) {
        return (
            <NodeViewWrapper as="div">
                <div className="hidden">
                    <NodeViewContent />
                </div>
            </NodeViewWrapper>
        );
    }

    return (
        <NodeViewWrapper as="div" className="my-2">
            <div className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
                {/* Header */}
                <div className="flex items-center justify-between border-b px-4 py-2.5">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
                        ) : (
                            <Sparkles className="h-4 w-4 text-purple-500" />
                        )}
                        {t("ai.title", { defaultValue: "由 AI 生成" })}
                    </div>
                    <button
                        onClick={props.deleteNode}
                        disabled={isLoading}
                        title={t("ai.delete", { defaultValue: "删除" })}
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Preview (streaming / result / error) */}
                {(isLoading || result || error) && (
                    <div className="max-h-[360px] overflow-y-auto border-b px-4 py-3">
                        {error ? (
                            <div className="flex items-start gap-2 text-sm text-destructive">
                                <X className="mt-0.5 h-4 w-4 shrink-0" />
                                <span className="break-words">{error}</span>
                            </div>
                        ) : result ? (
                            <div className="text-sm leading-normal text-foreground/90">
                                <Streamdown isAnimating={isLoading}>{result}</Streamdown>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {t("ai.generating", { defaultValue: "生成中…" })}
                            </div>
                        )}
                    </div>
                )}

                {/* Input row: initial prompt, or follow-up refine after a result */}
                {!isLoading && (
                    <div className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                            <textarea
                                ref={promptRef}
                                value={hasResult ? refineText : prompt}
                                onChange={(e) =>
                                    hasResult ? setRefineText(e.target.value) : setPrompt(e.target.value)
                                }
                                onKeyDown={hasResult ? onRefineKeyDown : onPromptKeyDown}
                                rows={2}
                                autoFocus
                                placeholder={
                                    hasResult
                                        ? t("ai.refinePlaceholder", { defaultValue: "继续修改，如：再正式一点…" })
                                        : t("ai.blockPlaceholder", { defaultValue: "让 AI 帮你写点什么…" })
                                }
                                className="flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-ring"
                            />
                            <button
                                disabled={hasResult ? !refineText.trim() : !prompt.trim()}
                                onClick={() => (hasResult ? refine() : generate(prompt))}
                                aria-label="Send"
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
                            >
                                <Send className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Quick prompts (idle only) */}
                        {!hasResult && !result && (
                            <div className="mt-2.5 flex flex-wrap gap-2">
                                {QUICK_PROMPTS.map((q) => (
                                    <button
                                        key={q.zh}
                                        onClick={() => {
                                            setPrompt(q.seed);
                                            setTimeout(() => promptRef.current?.focus(), 0);
                                        }}
                                        className="rounded-full border px-3 py-1 text-[13px] text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
                                    >
                                        {q[lang]}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Footer actions */}
                <div className="flex items-center justify-between gap-2 border-t px-4 py-2">
                    <div className="flex items-center gap-0.5">
                        {hasResult && (
                            <button
                                title={t("ai.copy", { defaultValue: "复制" })}
                                onClick={copy}
                                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                            >
                                <Copy className="h-3.5 w-3.5" />
                            </button>
                        )}
                        {(hasResult || error) && messagesRef.current.length > 0 && (
                            <button
                                title={t("ai.regenerate", { defaultValue: "重新生成" })}
                                onClick={() => runMessages(messagesRef.current)}
                                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5">
                        {isLoading ? (
                            <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2.5 text-xs" onClick={stop}>
                                <Square className="h-3 w-3" />
                                {t("ai.stop", { defaultValue: "停止" })}
                            </Button>
                        ) : (
                            <>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2.5 text-sm font-normal text-muted-foreground"
                                    onClick={props.deleteNode}
                                >
                                    {t("ai.discard", { defaultValue: "丢弃" })}
                                </Button>
                                {hasResult && (
                                    <Button size="sm" className="h-7 gap-1.5 px-2.5 text-xs" onClick={accept}>
                                        <Check className="h-3 w-3" />
                                        {t("ai.accept", { defaultValue: "保留" })}
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Hidden content slot to satisfy the node's `block+` schema. */}
            <div className="hidden">
                <NodeViewContent />
            </div>
        </NodeViewWrapper>
    );
};
