import { ExtensionWrapper } from "@kn/common";
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import "./index.css"
import { AArrowDownIcon } from "@kn/icon";
import React from "react";
import { DetailsBubbleMenu } from "./menu/bubble";



export const DetailsExtension: ExtensionWrapper = {
    name: 'details',
    extendsion: [Details.configure({
        persist: true,
        HTMLAttributes: {
            class: 'details'
        }
    }), DetailsContent, DetailsSummary],
    bubbleMenu: DetailsBubbleMenu,
    slashConfig: [
        {
            text: "details",
            slash: "/details",
            icon: <AArrowDownIcon className="w-4 h-4" />,
            action: (editor) => {
                editor.chain().focus().setDetails().run()
            },
        }
    ]

}