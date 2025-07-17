import { ExtensionWrapper } from "@kn/common";
import { Ai } from "./ai";
import { AiStaticMenu } from "./menu/AiStaticMenu";
import { Sparkles } from "@kn/icon";
import { AiImage } from "./ai-image";
import React from "react";


export const AIExtension: ExtensionWrapper = {
    name: Ai.name,
    extendsion: [Ai, AiImage],
    flotMenuConfig: [AiStaticMenu],
    slashConfig: [
        {
            icon: <Sparkles className="h-4 w-4" />,
            text: '续写',
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