import {
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
    toast,
} from "@kn/ui";
import { Editor } from "@kn/editor";
import { ChevronDown, Sparkles } from "@kn/icon";
import React, { useCallback } from "react";
import { useTranslation } from "@kn/common";
import {
    AI_TOOL_ACTIONS,
    AI_TONE_GROUP,
    AI_TRANSLATE_GROUP,
    AI_TOOLS_EVENT,
    type AiActionDef,
    type AiToolsRunDetail,
} from "../ai-actions";

/**
 * AI Tools bubble-menu dropdown.
 *
 * Pure UI: on selection it snapshots the current text range and dispatches an
 * `ai-tools-run` event. The streaming + preview + accept/discard flow lives in
 * the AiToolsPanel (a floatingUI), so this component never touches the network.
 */
export const AiStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language?.startsWith("zh") ? "zh" : "en";

    const runAction = useCallback(
        (action: AiActionDef) => {
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

            const detail: AiToolsRunDetail = { actionKey: action.key, from, to, text, rect };
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
                {/* Top-level actions */}
                {AI_TOOL_ACTIONS.map((item) => (
                    <DropdownMenuItem
                        key={item.key}
                        className="flex flex-row gap-2 items-center"
                        onSelect={() => runAction(item)}
                    >
                        <item.icon className="h-4 w-4" />
                        {item.label[lang]}
                    </DropdownMenuItem>
                ))}

                {/* Tone submenu */}
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex flex-row gap-2 items-center">
                        <AI_TONE_GROUP.icon className="h-4 w-4" />
                        {AI_TONE_GROUP.label[lang]}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-[180px]">
                        {AI_TONE_GROUP.items.map((item) => (
                            <DropdownMenuItem key={item.key} onSelect={() => runAction(item)}>
                                {item.label[lang]}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* Translate submenu */}
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="flex flex-row gap-2 items-center">
                        <AI_TRANSLATE_GROUP.icon className="h-4 w-4" />
                        {AI_TRANSLATE_GROUP.label[lang]}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-[180px]">
                        {AI_TRANSLATE_GROUP.items.map((item) => (
                            <DropdownMenuItem key={item.key} onSelect={() => runAction(item)}>
                                {item.label[lang]}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
