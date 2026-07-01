import {
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuPortal,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
    toast,
} from "@kn/ui";
import { Editor } from "@kn/editor";
import { ChevronDown, Sparkles, Wand2 } from "@kn/icon";
import React, { useCallback } from "react";
import { useTranslation } from "@kn/common";
import {
    AI_PRIMARY_ACTIONS,
    AI_MORE_GROUP,
    AI_MORE_ICONS,
    AI_TONE_GROUP,
    AI_TRANSLATE_GROUP,
    AI_TOOLS_EVENT,
    CUSTOM_ACTION_KEY,
    type AiToolsRunDetail,
} from "../ai-actions";

/**
 * AI Tools bubble-menu dropdown.
 *
 * Pure UI: on selection it snapshots the current text range and dispatches an
 * `ai-tools-run` event (with a preset action key, or the custom sentinel). The
 * streaming + preview + accept/discard flow lives in the AiToolsPanel.
 */
export const AiStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language?.startsWith("zh") ? "zh" : "en";

    const dispatchRun = useCallback(
        (actionKey: string) => {
            const { from, to } = editor.state.selection;
            const text = editor.state.doc.textBetween(from, to, " ");

            if (!text.trim()) {
                toast.error(t("ai.selectTextFirst", { defaultValue: "请先选择文本" }));
                return;
            }

            let rect = { top: 0, left: 0 };
            try {
                const coords = editor.view.coordsAtPos(to);
                rect = { top: coords.bottom, left: coords.left };
            } catch {
                /* keep default */
            }

            const detail: AiToolsRunDetail = { actionKey, from, to, text, rect };
            editor.view.dom.dispatchEvent(new CustomEvent(AI_TOOLS_EVENT, { detail }));
        },
        [editor, t]
    );

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    size="sm"
                    variant="ghost"
                    className="flex flex-row gap-1 items-center text-purple-500 hover:text-purple-500"
                >
                    <Sparkles className="h-4 w-4" />
                    {t("ai.tools", { defaultValue: "AI Tools" })}
                    <ChevronDown className="h-3 w-3" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[200px]" align="start">
                {/* Free-form instruction */}
                <DropdownMenuItem
                    className="flex flex-row gap-2 items-center text-purple-500 focus:text-purple-500"
                    onSelect={() => dispatchRun(CUSTOM_ACTION_KEY)}
                >
                    <Wand2 className="h-4 w-4" />
                    {t("ai.custom", { defaultValue: "自定义指令…" })}
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* Primary actions */}
                {AI_PRIMARY_ACTIONS.map((item) => (
                    <DropdownMenuItem
                        key={item.key}
                        className="flex flex-row gap-2 items-center"
                        onSelect={() => dispatchRun(item.key)}
                    >
                        <item.icon className="h-4 w-4" />
                        {item.label[lang]}
                    </DropdownMenuItem>
                ))}

                {/* More actions submenu */}
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex flex-row gap-2 items-center">
                        <AI_MORE_GROUP.icon className="h-4 w-4" />
                        {AI_MORE_GROUP.label[lang]}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-[180px]">
                        {AI_MORE_GROUP.items.map((item) => {
                            const Icon = AI_MORE_ICONS[item.key];
                            return (
                                <DropdownMenuItem
                                    key={item.key}
                                    className="flex flex-row gap-2 items-center"
                                    onSelect={() => dispatchRun(item.key)}
                                >
                                    {Icon ? <Icon className="h-4 w-4" /> : null}
                                    {item.label[lang]}
                                </DropdownMenuItem>
                            );
                        })}
                    </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                </DropdownMenuSub>

                {/* Tone submenu */}
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex flex-row gap-2 items-center">
                        <AI_TONE_GROUP.icon className="h-4 w-4" />
                        {AI_TONE_GROUP.label[lang]}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-[180px]">
                        {AI_TONE_GROUP.items.map((item) => (
                            <DropdownMenuItem key={item.key} onSelect={() => dispatchRun(item.key)}>
                                {item.label[lang]}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                </DropdownMenuSub>

                {/* Translate submenu */}
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex flex-row gap-2 items-center">
                        <AI_TRANSLATE_GROUP.icon className="h-4 w-4" />
                        {AI_TRANSLATE_GROUP.label[lang]}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-[180px]">
                        {AI_TRANSLATE_GROUP.items.map((item) => (
                            <DropdownMenuItem key={item.key} onSelect={() => dispatchRun(item.key)}>
                                {item.label[lang]}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                </DropdownMenuSub>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
