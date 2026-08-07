import { Link2 } from "@kn/icon";
import { ExtensionWrapper } from "@kn/common";
import { Link } from "./link";
import { LinkBubbleMenu, LinkStaticMenu } from "./menu";
import { showLinkEditor } from "./menu/edit";
import { createT } from "../../i18n";
import React from "react";

export * from "./link";
export * from "./menu";


const t = createT();

export const LinkExtension: ExtensionWrapper = {
    extendsion: Link,
    name: Link.name,
    bubbleMenu: LinkBubbleMenu,
    menuConfig: {
        group: 'inline',
        menu: LinkStaticMenu
    },
    flotMenuConfig: [LinkStaticMenu],
    slashConfig: [{
        icon: <Link2 className="h-4 w-4" />,
        text: t('slashCommands.link'),
        slash: '/link',
        action: (editor) => showLinkEditor(editor)
    }]
}
