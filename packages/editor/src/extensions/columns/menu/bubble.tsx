import React, { useCallback } from "react";
import { Editor, findParentNode, posToDOMRect } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";

import {
  IconCopy,
  IconAddColumnBefore,
  IconAddColumnAfter,
  IconDeleteColumn,
  IconDelete
} from "../../../icons";
import {
  BubbleMenu,
  BubbleMenuProps
} from "../../../components";
import { copyNode, deleteNode, isNodeActivePro } from "../../../utilities";

import { Columns } from "../columns";
import { Button, IconButton } from "@kn/ui";

export const ColumnsBubbleMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const shouldShow = useCallback<BubbleMenuProps["shouldShow"]>(() => {
    return isNodeActivePro(editor.state, "column") && editor.isEditable
  }, [editor]);

  const getReferenceClientRect = useCallback(() => {
    const { selection } = editor.state;
    const predicate = (node: PMNode) => node.type.name === Columns.name;
    const parent = findParentNode(predicate)(selection);

    if (parent) {
      const dom = editor.view.nodeDOM(parent?.pos) as HTMLElement;
      return dom.getBoundingClientRect();
    }

    return posToDOMRect(editor.view, selection.from, selection.to);
  }, [editor]);

  const copyMe = useCallback(() => {
    copyNode(editor, Columns.name);
  }, [editor]);

  const deleteMe = useCallback(() => {
    deleteNode(editor, Columns.name);
  }, [editor]);

  const addColBefore = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .addColBefore()
        .run(),
    [editor]
  );

  const addColAfter = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .addColAfter()
        .run(),
    [editor]
  );

  const deleteCol = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .deleteCol()
        .run(),
    [editor]
  );

  return (
    <BubbleMenu
      forNode
      editor={editor}
      shouldShow={shouldShow}
      getReferenceClientRect={getReferenceClientRect}
      options={{  }}>
      <div className="flex flex-row items-center gap-1">
        <IconButton onClick={copyMe} icon={<IconCopy />} />
        <IconButton
          onClick={addColBefore}
          icon={<IconAddColumnBefore />}
        />
        <IconButton
          onClick={addColAfter}
          icon={<IconAddColumnAfter />}
        />
        <IconButton
          onClick={deleteCol}
          icon={<IconDeleteColumn />}
        />
        <IconButton icon={<IconDelete />} onClick={deleteMe} />
      </div>
    </BubbleMenu>
  );
};
