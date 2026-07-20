import { Paintbrush } from "@kn/icon";
import { ColorPicker } from "@kn/ui";
import { Editor } from "@tiptap/core";
import React, { useCallback } from "react";


export const BackGroundColorStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {

    const handleChange = useCallback((value: string) => {
        editor.commands.setBackgroundColor(value)
    }, [editor])

    const handleUnset = useCallback(() => {
        editor.commands.unsetBackgroundColor()
    }, [editor])

    const color = editor.getAttributes('textStyle').backgroundColor || '';

    return <ColorPicker
        value={color || '#ffffff'}
        onChange={handleChange}
        onUnset={handleUnset}
        trigger="toggle"
        triggerIcon={<Paintbrush className="h-4 w-4" />}
        align="start"
    />
}
