import { Editor } from "@tiptap/react";
import React, { useCallback } from "react";
import { TwitterPicker } from "react-color"
import { IconFontColor } from "../../../icons";
import { useActive } from "../../../hooks";
import { Popover, PopoverContent, PopoverTrigger } from "@kn/ui";
import { Toggle } from "@kn/ui";


export const ColorStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {

  const isColorActive = useActive(editor, "textStyle") && editor.isEditable;

  const handleColorChange = useCallback((color: any) => {
    editor.chain().focus().setColor(color.hex).run()
  }, [editor])

  return <Popover>
    <PopoverContent asChild>
      <div style={{ backgroundColor: '#fff' }}>
        <TwitterPicker onChange={handleColorChange} />
      </div>
    </PopoverContent>
    <PopoverTrigger>
      <Toggle
        pressed={isColorActive}
        size="sm">
        <IconFontColor style={{ color: editor.getAttributes('textStyle').color }} />
      </Toggle>
    </PopoverTrigger>
  </Popover>
}