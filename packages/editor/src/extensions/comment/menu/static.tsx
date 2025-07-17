import { useActive } from "@editor/hooks";
import { Toggle } from "@kn/ui";
import { Editor } from "@tiptap/core";
import React from "react";
import Comments from "../comment";
import { MessageCircleMore } from "@kn/icon";


export const CommentStaticMenu: React.FC<{ editor: Editor }> = (props) => {
    const { editor } = props

    const isCommentActive = useActive(editor, Comments.name);

    return <Toggle
        size="sm"
        pressed={isCommentActive}
        onClick={() => {
            editor.commands.addComments({ comment: '', parent_id: null })
        }}
    >
        <MessageCircleMore className="h-4 w-4" />
    </Toggle>
}