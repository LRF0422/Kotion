import { Toggle } from "@repo/ui";
import { Editor } from "@tiptap/core";
import React from "react";
import { NoteMark } from "../note";
import { Notebook } from "@repo/icon";


export const NoteMarkStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {

    return <Toggle pressed={editor.isActive(NoteMark.name)} size="sm" onClick={() => editor.commands.toggleNote()}>
        <Notebook className="h-4 w-4" />
    </Toggle>
}