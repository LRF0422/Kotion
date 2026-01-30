import { Button } from "@kn/ui";
import { Label } from "@kn/ui";
import { Textarea } from "@kn/ui";
import { cn } from "@kn/ui";
import { NodeViewProps } from "@kn/editor";
import { NodeViewWrapper } from "@kn/editor";
import { useToggle } from "ahooks";
import { ImageIcon, Loader2, Sparkles, Trash2 } from "@kn/icon";
import React, { useCallback, useMemo } from "react";
import { aiImageWriter } from "./utils";
import { toast } from "@kn/ui";
import { useTranslation } from "@kn/common";
import { logger } from "@kn/common";

/**
 * AI Image Generation Node View Component
 * Allows users to generate images using AI based on text prompts
 */


export const AiImageView: React.FC<NodeViewProps> = (props) => {
    const [loading, { toggle }] = useToggle(false);
    const { t } = useTranslation();

    // Check if prompt is valid
    const isPromptValid = useMemo(() => {
        return props.node.attrs.prompt && props.node.attrs.prompt.trim().length > 0;
    }, [props.node.attrs.prompt]);

    // Handle prompt change
    const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        props.updateAttributes({
            ...props.node.attrs,
            prompt: e.target.value
        });
    }, [props]);

    // Handle image generation
    const handleGenerate = useCallback(async () => {
        if (!isPromptValid) {
            logger.warn('Cannot generate image: prompt is empty');
            return;
        }

        toggle();

        try {
            const result = await aiImageWriter(props.node.attrs.prompt);

            if (result.error) {
                const errorMsg = result.error.message || t('ai.imageGenerationFailed', { defaultValue: '图片生成失败' });
                toast.warning(errorMsg, {
                    position: 'top-center'
                });
                logger.error('AI image generation failed:', result.error);
            } else if (result.data && result.data.length > 0) {
                const url = result.data[0].url;
                props.updateAttributes({
                    ...props.node.attrs,
                    url: url
                });
            } else {
                throw new Error('No image data returned');
            }
        } catch (error) {
            logger.error('Failed to generate AI image:', error);
            toast.error(t('ai.imageGenerationError', { defaultValue: '图片生成错误' }), {
                position: 'top-center'
            });
        } finally {
            toggle();
        }
    }, [isPromptValid, props, toggle, t]);

    return <NodeViewWrapper className="border p-4 rounded-sm flex flex-col gap-2 text-popover-foreground">
        <div>
            {props.editor.isEditable && (
                <Label className="mb-2 font-bold flex gap-1 items-center">
                    <ImageIcon className="h-4 w-4 mr-1" />
                    {t('ai.imagePreview', { defaultValue: '预览' })}
                </Label>
            )}
            {props.node.attrs.url && (
                <img
                    src={props.node.attrs.url}
                    width="100%"
                    className="rounded-sm"
                    alt={t('ai.generatedImage', { defaultValue: 'AI生成的图片' })}
                />
            )}
        </div>
        {props.editor.isEditable && (
            <div className="flex flex-col gap-2">
                <div>
                    <Label htmlFor="prompt" className="mb-2 font-bold flex gap-1 items-center">
                        <Sparkles className="h-4 w-4" />
                        {t('ai.promptLabel', { defaultValue: '提示语' })}
                    </Label>
                    <Textarea
                        id="prompt"
                        defaultValue={props.node.attrs.prompt}
                        onChange={handlePromptChange}
                        placeholder={t('ai.imagePromptPlaceholder', { defaultValue: '请输入图片生成的描述...' })}
                    />
                </div>
                <div className="flex flex-row gap-2 items-center">
                    <Button
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