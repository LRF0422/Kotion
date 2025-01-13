import React from "react";
import { ExtensionWrapper } from "../../editor";
import { PageContent } from "./page-content";
import { List } from "@repo/icon";


export const PageContentExtension: ExtensionWrapper = {
    name: 'pageContent',
    extendsion: PageContent,
    slashConfig: [
        {
            text: '页面大纲',
            slash: "/content",
            icon: <List className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertPageContent()
            }
        }
    ]
}