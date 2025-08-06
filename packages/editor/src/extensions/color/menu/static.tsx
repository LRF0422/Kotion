import { Editor } from "@tiptap/react";
import React, { useCallback } from "react";
import { useActive } from "../../../hooks";
import { ColorPicker } from "@kn/ui";
import { BaselineIcon } from "@kn/icon";

export const ColorStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {

  const isColorActive = useActive(editor, "textStyle") && editor.isEditable;

  const handleColorChange = useCallback((color: any) => {
    editor.chain().focus().setColor(color).run()
  }, [editor])

  const handleUnset = useCallback(() => {
    editor.chain().focus().unsetColor().run()
  }, [editor])

  return <ColorPicker
    icon={<BaselineIcon className="h-4 w-4" />}
    simple
    handleUnSet={handleUnset}
    background={editor.getAttributes('textStyle').color || ""}
    setBackground={handleColorChange}
  />
}