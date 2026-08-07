import { ExtensionWrapper } from "@kn/common"
import { SlideNode } from "./slide-node"
import { Presentation } from "@kn/icon"
import React from "react"
import { slideTools } from "./tools"
import { slideExpertSkill } from "./skills"
import { createT } from "../i18n"

const t = createT();

export const SlideExtension: ExtensionWrapper = {
    name: SlideNode.name,
    extendsion: [SlideNode],
    slashConfig: [
        {
            text: t('slashCommands.slide'),
            slash: '/presentation',
            icon: <Presentation className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertSlide()
            },
        },
    ],
    tools: slideTools,
    skills: [slideExpertSkill],
}