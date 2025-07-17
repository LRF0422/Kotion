import { PaintRollerIcon } from "@kn/icon";
import { Toggle } from "@kn/ui";
import { Editor } from "@tiptap/core";
import { Mark } from "@tiptap/pm/model";
import React from "react";


export const FormatPainerStaticMenu: React.FC<{ editor: Editor }> = (props) => {
    const { editor } = props
    return <Toggle size="sm" pressed={false} onClick={() => {
        editor.commands.setPainter(editor?.state.selection.$head.marks() as Mark[]);
    }}>
        <PaintRollerIcon className="h-4 w-4" />
    </Toggle>
}