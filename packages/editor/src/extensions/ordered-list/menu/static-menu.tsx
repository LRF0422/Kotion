import { Editor } from "@tiptap/core";
import React, { useCallback } from "react";
import { useActive } from "../../../hooks";
import {OrderedList} from "@tiptap/extension-list";
import { ListOrdered } from "@kn/icon";
import { Toggle } from "@kn/ui";

export const OrderListStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const isActive = useActive(editor, OrderedList.name);

  const toggleList = useCallback(() => {
    editor.chain().toggleOrderedList().run()
  }, [editor])

  return <Toggle size="sm" pressed={isActive} onClick={toggleList}>
    <ListOrdered className="h-4 w-4" />
  </Toggle>
}