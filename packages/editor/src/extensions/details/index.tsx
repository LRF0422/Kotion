import { ExtensionWrapper } from "@kn/common";
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import { ChevronRight } from "@kn/icon";
import { DetailsBubbleMenu } from "./menu/bubble";
import "./index.css";
import React from "react";

export const DetailsExtension: ExtensionWrapper = {
    name: 'details',
    extendsion: [
        Details.configure({
            persist: true,
            HTMLAttributes: {
                class: 'details'
            }
        }),
        DetailsContent,
        DetailsSummary
    ],
    bubbleMenu: DetailsBubbleMenu,
    slashConfig: [
        {
            text: "details",
            slash: "/details",
            icon: <ChevronRight className="w-4 h-4" />,
            action: (editor) => {
                editor.chain().focus().setDetails().run();
            },
        }
    ]
};