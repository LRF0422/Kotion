import { ExtensionWrapper } from "@kn/common";
import { Ai } from "./ai";
import { AiStaticMenu } from "./menu/AiStaticMenu";
import { Sparkles } from "@kn/icon";
import { AiImage } from "./ai-image";
import React from "react";
import TextLoadingDecorationExtension from "./text-loading";
import { LoadingMark } from "./marks/loading-mark";
import { ExpandableChatDemo } from "./menu/Chat";


export const AIExtension: ExtensionWrapper = {
    name: Ai.name,
    extendsion: [Ai, AiImage, TextLoadingDecorationExtension, LoadingMark],
    flotMenuConfig: [AiStaticMenu],
    menuConfig: {
        group: 'block',
        menu: ExpandableChatDemo
    },
    slashConfig: [
        {
            divider: true,
            title: 'Ai'
        },
        {
            icon: <Sparkles className="h-4 w-4" />,
            text: '内容生成',
            slash: '/ai',
            action: (editor) => {
                editor.commands.insertAIBlock()
            }
        },
        {
            icon: <Sparkles className="h-4 w-4" />,
            text: '文生成图',
            slash: '/aiImage',
            action: (editor) => {
                // editor.commands.insertAiImage()
            }
        }
    ]
}