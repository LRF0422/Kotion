import { ExtensionWrapper } from "@kn/common"
import { SlideNode } from "./slide-node"
import { Presentation } from "@kn/icon"
import React from "react"
import { slideTools } from "./tools"
import { slideExpertSkill } from "./skills"

export const SlideExtension: ExtensionWrapper = {
    name: SlideNode.name,
    extendsion: [SlideNode],
    slashConfig: [
        {
            text: 'presentation',
            slash: '/presentation',
            icon: <Presentation className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertSlide()
            },
        },
        {
            text: 'ppt',
            slash: '/ppt',
            icon: <Presentation className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertSlide()
            },
        },
        {
            text: '幻灯片',
            slash: '/幻灯片',
            icon: <Presentation className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertSlide()
            },
        },
    ],
    tools: slideTools,
    skills: [slideExpertSkill],
}