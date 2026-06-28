import { Toggle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";


import { Editor } from "@tiptap/core";
import React from "react";
import { PageContent } from "../page-content";
import { List } from "@kn/icon";

export const PageContentStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
    return (
        <TooltipProvider delayDuration={400}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Toggle size="sm" pressed={editor.isActive(PageContent.name)} aria-label="Page content">
                        <List className="h-4 w-4" />
                    </Toggle>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                    Page content
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}