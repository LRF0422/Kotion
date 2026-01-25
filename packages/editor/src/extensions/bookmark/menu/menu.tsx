import React, { useCallback, memo } from "react";
import { Editor } from "@tiptap/core";
import { Tooltip } from "../../../components/tooltip";
import { Bookmark as BookmarkIcon } from "@kn/icon";
import { Button } from "@kn/ui";

const BookmarkStaticMenuComponent: React.FC<{ editor: Editor }> = ({
    editor
}) => {
    const insertBookmark = useCallback(() => {
        editor
            .chain()
            .focus()
            .insertBookmark()
            .run();
    }, [editor]);

    return (
        <Tooltip title="Bookmark (⌘⇧K)" editor={editor}>
            <Button
                size="sm"
                variant="ghost"
                onClick={insertBookmark}
            >
                <BookmarkIcon className="h-4 w-4" />
            </Button>
        </Tooltip>
    );
};

export const BookmarkStaticMenu = memo(BookmarkStaticMenuComponent);
