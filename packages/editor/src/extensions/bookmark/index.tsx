import { ExtensionWrapper } from "@kn/common";
import { Bookmark as BookmarkIcon } from "@kn/icon";
import React from "react";
import { createT } from "../../i18n";
import { Bookmark } from "./bookmark";
import { BookmarkStaticMenu } from "./menu/menu";

const t = createT();

export const BookmarkExtension: ExtensionWrapper = {
    name: Bookmark.name,
    extendsion: Bookmark,
    menuConfig: {
        group: 'block',
        menu: BookmarkStaticMenu,
        tooltip: 'editor.tooltip.bookmark',
    },
    slashConfig: [
        {
            icon: <BookmarkIcon className="h-4 w-4" />,
            text: t('slashCommands.bookmark'),
            slash: '/bookmark',
            action: (editor) => {
                editor.chain().focus().insertBookmark().run();
            },
        },
    ],
};

export { Bookmark, BookmarkStaticMenu };
