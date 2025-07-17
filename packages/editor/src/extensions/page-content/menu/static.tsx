import { Toggle } from "@kn/ui";
import { Editor } from "@tiptap/core";
import React from "react";
import { PageContent } from "../page-content";
import { List } from "@kn/icon";


export const PageContentStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
    return <Toggle size="sm" pressed={editor.isActive(PageContent.name)}>
        <List className="h-4 w-4" />
    </Toggle>
}