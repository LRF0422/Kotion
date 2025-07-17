import { Button, ColorInput, ColorPicker, Popover, PopoverContent, PopoverTrigger, Toggle, cn } from "@kn/ui";
import { Editor } from "@tiptap/core";
import React, { useCallback } from "react";


export const BackGroundColorStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {

    const setBackground = useCallback((value: any) => {
        editor.commands.setBackgroundColor(value)
    }, [])

    const color = editor.getAttributes('textStyle').backgroundColor || 'transparent';
    return <Popover>
        <PopoverTrigger>
            <Toggle size="sm" pressed={false} >
                <div className="h-4 w-4  rounded-sm" style={{
                    backgroundColor: color
                }}></div>
            </Toggle>
        </PopoverTrigger>
        <PopoverContent>
            <ColorInput
                className=""
                label={undefined}
                onChange={setBackground}
                defaultValue={color}
            />
        </PopoverContent>
    </Popover>


    // return <ColorPicker className="w-[120px] h-7" background={editor.getAttributes('textStyle').backgroundColor || "black"} setBackground={(value) => {
    //     setBackground(value)
    // }} />
}