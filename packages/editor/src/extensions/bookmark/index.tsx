import { ExtensionWrapper } from "@kn/common";
import { Bookmark } from "./bookmark";
import { BookmarkStaticMenu } from "./menu/menu";

export const BookmarkExtension: ExtensionWrapper = {
    name: Bookmark.name,
    extendsion: Bookmark,
    menuConfig: {
        group: 'block',
        menu: BookmarkStaticMenu,
    },
};

export { Bookmark, BookmarkStaticMenu };
