import { useActive } from "@editor/hooks";
import { Toggle } from "@repo/ui";
import { Editor } from "@tiptap/core";
import React from "react";
import Comments from "../comment";
import { MessageCircleMore } from "@repo/icon";


export const CommentStaticMenu: React.FC<{ editor: Editor }> = (props) => {
    const { editor } = props

    const isCommentActive = useActive(editor, Comments.name);

    return <Toggle
        size="sm"
        pressed={isCommentActive}
        onClick={() => {
            editor.commands.addComments({ comment: '123123123213', parent_id: null })
        }}
    >
        <MessageCircleMore className="h-4 w-4" />
    </Toggle>
}