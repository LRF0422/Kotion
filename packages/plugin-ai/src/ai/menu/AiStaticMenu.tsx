import { Button } from "@kn/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@kn/ui";
import { Editor } from "@kn/editor";
import { ChevronDown, Circle, Languages, MessageCircleMore, PencilLine, SmilePlus, Sparkles } from "@kn/icon";
import React, { useCallback } from "react";
import { aiText } from "../utils";
import { useTranslation } from "@kn/common";

// AI Tool Menu Item Configurations
const AI_TOOL_ITEMS = [
    { key: 'continue', icon: PencilLine, prompt: '请为给出的内容续写', label: { zh: '续写', en: 'Continue Writing' } },
    { key: 'simplify', icon: Circle, prompt: '将给出内容进行简化', label: { zh: '简化', en: 'Simplify' } },
    { key: 'emoji', icon: SmilePlus, prompt: '为给出的内容添加emoji表情', label: { zh: '插入表情', en: 'Add Emoji' } },
] as const;

const AI_TONE_ITEMS = [
    { key: 'friendly', prompt: '用和蔗的语气重写', label: { zh: '和蔗', en: 'Friendly' } },
    { key: 'formal', prompt: '用官方的语气重写', label: { zh: '官方', en: 'Formal' } },
    { key: 'casual', prompt: '用通俗的语言重写', label: { zh: '通俗', en: 'Casual' } },
    { key: 'written', prompt: '用书面语言重写', label: { zh: '书面', en: 'Written' } },
] as const;

const AI_TRANSLATION_ITEMS = [
    { key: 'zh-cn', prompt: '翻译成简体中文', label: { zh: '简体中文', en: 'Simplified Chinese' } },
    { key: 'zh-tw', prompt: '翻译成繁体中文', label: { zh: '繁体中文', en: 'Traditional Chinese' } },
    { key: 'en', prompt: '翻译成英文', label: { zh: '英文', en: 'English' } },
    { key: 'de', prompt: '翻译成德语', label: { zh: '德语', en: 'German' } },
    { key: 'ja', prompt: '翻译成日语', label: { zh: '日文', en: 'Japanese' } },
] as const;

/**
 * AI Static Menu Component
 * Provides quick access to common AI text transformation operations
 */



export const AiStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
    const { t, i18n } = useTranslation();
    const currentLang = i18n.language?.startsWith('zh') ? 'zh' : 'en';

    // Handle AI action with error handling
    const handleAiAction = useCallback(async (prompt: string) => {
        try {
            await aiText(editor, prompt);
        } catch (error) {
            // Error is already logged in aiText function
        }
    }, [editor]);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    size="sm"
                    variant="ghost"
                    className="flex flex-row gap-1 items-center text-purple-500 hover:text-purple-500"
                >
                    <Sparkles className="h-4 w-4" />
                    {t('ai.tools', { defaultValue: 'AI Tools' })}
                    <ChevronDown className="h-3 w-3" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[200px]" align="start">
                {/* Basic AI Tools */}
                {AI_TOOL_ITEMS.map((item) => (
                    <DropdownMenuItem
                        key={item.key}
                        className="flex flex-row gap-1 items-center"
                        onClick={() => handleAiAction(item.prompt)}
                    >
                        <item.icon className="h-4 w-4" /> {item.label[currentLang]}
                    </DropdownMenuItem>
                ))}

                {/* Tone Adjustment */}
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex flex-row gap-1 items-center">
                        <MessageCircleMore className="h-4 w-4" />
                        {t('ai.changeTone', { defaultValue: '改变语气' })}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-[200px]">
                        {AI_TONE_ITEMS.map((item) => (
                            <DropdownMenuItem
                                key={item.key}
                                onClick={() => handleAiAction(item.prompt)}
                            >
                                {item.label[currentLang]}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* Translation */}
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex flex-row gap-1 items-center">
                        <Languages className="h-4 w-4" />
                        {t('ai.translate', { defaultValue: '翻译' })}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-[200px]">
                        {AI_TRANSLATION_ITEMS.map((item) => (
                            <DropdownMenuItem
                                key={item.key}
                                onClick={() => handleAiAction(item.prompt)}
                            >
                                {item.label[currentLang]}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}