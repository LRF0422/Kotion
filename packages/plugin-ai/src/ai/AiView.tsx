import { Button } from "@kn/ui";
import { NodeViewProps } from "@kn/editor";
import { NodeViewContent, NodeViewWrapper } from "@kn/editor";
import React, { useCallback, useMemo } from "react";
import { aiGeneration } from "./utils";
import { Textarea } from "@kn/ui";
import { useToggle } from "ahooks";
import { Label } from "@kn/ui";
import { Loader2, Sparkles, Trash2 } from "@kn/icon";
import { cn } from "@kn/ui";
import { useTranslation } from "@kn/common";
import { logger } from "@kn/common";

// Constants
const MIN_PROMPT_LENGTH = 1;

/**
 * AI text generation node view component
 * Allows users to generate text content using AI based on custom prompts
 */


export const AiView: React.FC<NodeViewProps> = (props) => {
    const [loading, { toggle }] = useToggle(false);
    const { t } = useTranslation();

    // Check if prompt is valid for generation
    const isPromptValid = useMemo(() => {
        return props.node.attrs.prompt && props.node.attrs.prompt.trim().length >= MIN_PROMPT_LENGTH;
    }, [props.node.attrs.prompt]);

    // Handle AI text generation
    const handleGenerate = useCallback(async () => {
        if (!isPromptValid) {
            logger.warn('Cannot generate AI text: prompt is empty');
            return;
        }

        toggle();
        let buff = "";

        try {
            // Clear existing content
            props.editor.commands.deleteRange({
                from: props.getPos()! + 1,
                to: props.getPos()! + props.node.nodeSize - 1
            });

            // Generate AI text with streaming
            const result = await aiGeneration(props.node.attrs.prompt, (res) => {
                buff += res;
                props.editor.chain().focus().toggleLoadingDecoration(props.getPos()! + 1, buff).run();
            });

            // Insert generated content
            props.editor.chain().focus()
                .insertContentAt(props.getPos()! + 1, result, {
                    applyInputRules: false,
                    applyPasteRules: false,
                    parseOptions: {
                        preserveWhitespace: false
                    }
                }).run();

            // Update generation date
            props.updateAttributes({
                ...props.node.attrs,
                generateDate: new Date().toLocaleString()
            });
        } catch (error) {
            logger.error('Failed to generate AI text:', error);
        } finally {
            props.editor.chain().removeLoadingDecoration().run();
            toggle();
        }
    }, [isPromptValid, props, toggle]);

    // Handle prompt change
    const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        props.updateAttributes({
            ...props.node.attrs,
            prompt: e.target.value
        });
    }, [props]);

    return <NodeViewWrapper as="div" className="relative flex flex-col w-full border border-dashed p-2 pt-9 rounded-sm text-popover-foreground">
        <div className="absolute right-0 top-0 border border-t-0 border-l border-r-0 border-b rounded-sm text-sm text-gray-500 p-1">
            {t('ai.title')}
            {props.node.attrs.generateDate && (
                <span>
                    ，{t('ai.generateDate', { defaultValue: '生成日期' })}：
                    {props.node.attrs.generateDate}
                </span>
            )}
        </div>
        <NodeViewContent className="w-full prose-p:mt-0 leading-1 min-h-[40px]" />
        {props.editor.isEditable && (
            <div className="flex flex-col gap-2 items-start">
                <Label htmlFor="prompt" className="mb-2 font-bold flex gap-1 items-center">
                    <Sparkles className="h-4 w-4" /> {t('ai.promptLabel', { defaultValue: '提示语' })}
                </Label>
                <Textarea
                    id="prompt"
                    className="h-[100px]"
                    defaultValue={props.node.attrs.prompt}
                    onChange={handlePromptChange}
                    placeholder={t('ai.promptPlaceholder', { defaultValue: '请输入AI生成的提示语...' })}
                />
                <div className="flex flex-row gap-1 items-center">
                    <Button
                        size="sm"
                        onClick={handleGenerate}
                        disabled={loading || !isPromptValid}
                    >
                        {loading ? (
                            <Loader2 className={cn("h-4 w-4 mr-1 animate-spin")} />
                        ) : (
                            <Sparkles className={cn("h-4 w-4 mr-1")} />
                        )}
                        {loading ? t('ai.generating', { defaultValue: '生成中...' }) : t('ai.generate', { defaultValue: '生成' })}
                    </Button>
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={props.deleteNode}
                        disabled={loading}
                    >
                        <Trash2 className="h-4 w-4 mr-1" />
                        {t('ai.delete', { defaultValue: '删除' })}
                    </Button>
                </div>
            </div>
        )}
    </NodeViewWrapper>
}