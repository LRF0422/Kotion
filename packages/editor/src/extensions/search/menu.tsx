import React, { useCallback, useEffect, useState } from "react";
import { Editor } from "@tiptap/core";
import { Search } from "@kn/icon";
import { Toggle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";

import { event as rawEvent } from "@kn/common";
import { ON_SEARCH_TOGGLE } from "./events";

const event = rawEvent as unknown as {
    on: (name: string, fn: (...args: any[]) => void) => unknown;
    off: (name: string, fn?: (...args: any[]) => void) => unknown;
};

export const SearchStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
    const [open, setOpen] = useState<boolean>(
        () => editor.storage.search?.panelOpen === true
    );

    useEffect(() => {
        const sync = () => setOpen(editor.storage.search?.panelOpen === true);
        event.on(ON_SEARCH_TOGGLE, sync);
        return () => {
            event.off(ON_SEARCH_TOGGLE, sync);
        };
    }, [editor]);

    const toggle = useCallback(() => {
        editor.chain().toggleSearchPanel().run();
    }, [editor]);

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Toggle size="sm" pressed={open} onClick={toggle} aria-label="Search & Replace">
                        <Search className="h-4 w-4" />
                    </Toggle>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                    Search &amp; Replace (Ctrl/Cmd+F)
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};
