import { ColorPicker } from "@repo/ui";
import { Editor } from "@tiptap/core";
import React, { useCallback } from "react";


export const BackGroundColorStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {

    const setBackground = useCallback((value: any) => {
        editor.commands.setBackgroundColor(value)
    }, [])

    return <ColorPicker className="w-[120px] h-7" background={editor.getAttributes('textStyle').backgroundColor || "black"} setBackground={(value) => {
        setBackground(value)
    }} />
}