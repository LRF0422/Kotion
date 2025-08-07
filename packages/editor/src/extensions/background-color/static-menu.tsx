import { PaintBucket, Paintbrush } from "@kn/icon";
import { Button, ColorInput, ColorPicker, Popover, PopoverContent, PopoverTrigger, Toggle, cn } from "@kn/ui";
import { Editor } from "@tiptap/core";
import React, { useCallback } from "react";


export const BackGroundColorStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {

    const setBackground = useCallback((value: any) => {
        editor.commands.setBackgroundColor(value)
    }, [])

    const handleUnset = useCallback(() => {
        editor.commands.unsetBackgroundColor()
    }, [])
    const color = editor.getAttributes('textStyle').backgroundColor || '';

    return <ColorPicker
        handleUnSet={handleUnset}
        simple
        icon={<Paintbrush className="h-4 w-4" />}
        background={color}
        setBackground={setBackground}
    />
}