import { ExtensionWrapper } from "@kn/common";
import { Figma } from "./figma";
import { FigmaIcon } from "@kn/icon";
import { FigmaBubbleMenu } from "./menu/bubble";
import React from "react";

export const FigmaExtension: ExtensionWrapper = {
    name: 'figma',
    extendsion: Figma,
    // bubbleMenu: FigmaBubbleMenu,
    slashConfig: [
        {
            icon: <FigmaIcon />,
            text: 'Figma',
            slash: '/figma',
            action: (editor) => {
                editor.commands.insertFigma()
            }
        }
    ]
}