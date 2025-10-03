import React, { useCallback } from "react";
import { Editor, findParentNode, getAttributes, posToDOMRect } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";

import {
  IconCopy,
  IconAddColumnBefore,
  IconAddColumnAfter,
  IconDeleteColumn,
  IconDelete,
  RiLayoutRightFill,
  RiLayoutLeftFill,
  IconThreeColumns,
  IconThreeColumnsMiddle,
  IconThreeColumnsLeft,
  IconThreeColumnsRight,
  Trash2,
  IconTwoColumns,
  IconTwoColumnsLeft,
  IconTwoColumnsRight
} from "@kn/icon";
import {
  BubbleMenu,
  BubbleMenuProps,
  Divider
} from "../../../components";
import { copyNode, deleteNode, isNodeActivePro } from "../../../utilities";

import { Columns } from "../columns";
import { Button, IconButton, Separator } from "@kn/ui";
import { toOtherColumns } from "../utilities";

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
        {/* <IconButton
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
        /> */}
        <Divider/>
        <IconButton icon={<IconThreeColumnsMiddle className="h-4 w-4" />} onClick={() => {
          toOtherColumns({
            state: editor.state,
            dispatch: editor.view.dispatch,
            type: "center",
            cols: 3
          })
        }} />

        <IconButton icon={<IconThreeColumns className="h-4 w-4" />} onClick={() => {
          toOtherColumns({
            state: editor.state,
            dispatch: editor.view.dispatch,
            type: "none",
            cols: 3
          })
        }} />

        <IconButton icon={<IconThreeColumnsLeft className="h-4 w-4" />} onClick={() => {
          toOtherColumns({
            state: editor.state,
            dispatch: editor.view.dispatch,
            type: "left",
            cols: 3
          })
        }} />
        <IconButton icon={<IconThreeColumnsRight className="h-4 w-4" />} onClick={() => {
          toOtherColumns({
            state: editor.state,
            dispatch: editor.view.dispatch,
            type: "right",
            cols: 3
          })
        }} />
        <Divider />
        <IconButton icon={<IconTwoColumns className="h-4 w-4" />} onClick={() => {
          toOtherColumns({
            state: editor.state,
            dispatch: editor.view.dispatch,
            type: "none",
            cols: 2
          })
        }} />

        <IconButton icon={<IconTwoColumnsLeft className="h-4 w-4" />} onClick={() => {
          toOtherColumns({
            state: editor.state,
            dispatch: editor.view.dispatch,
            type: "left",
            cols: 2
          })
        }} />
        <IconButton icon={<IconTwoColumnsRight className="h-4 w-4" />} onClick={() => {
          toOtherColumns({
            state: editor.state,
            dispatch: editor.view.dispatch,
            type: "right",
            cols: 2
          })
        }} />
        <Divider/>
        <IconButton icon={<Trash2 className="h-4 w-4" />} onClick={deleteMe} />
      </div>
    </BubbleMenu>
  );
};
