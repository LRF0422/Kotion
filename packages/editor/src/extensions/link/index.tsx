import { Link2 } from "@repo/icon";
import { ExtensionWrapper } from "@repo/common";
import { Link } from "./link";
import { LinkBubbleMenu, LinkStaticMenu } from "./menu";
import { showLinkEditor } from "./menu/edit";
import React from "react";

export * from "./link";
export * from "./menu";


export const LinkExtension: ExtensionWrapper = {
    extendsion: Link,
    name: Link.name,
    bubbleMenu: LinkBubbleMenu,
    menuConfig: {
        group: 'inline',
        menu: LinkStaticMenu
    },
    slashConfig: [{
        icon: <Link2 className="h-4 w-4" />,
        text: '链接',
        slash: '/link',
        action: (editor) => showLinkEditor(editor)
    }]
}
