import React, { useCallback } from "react";
import { Editor, findParentNode, posToDOMRect } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";

import {
  IconCopy,
  IconAddColumnBefore,
  IconAddColumnAfter,
  IconDeleteColumn,
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
import { copyNode, deleteNodeInner, isNodeActivePro } from "../../../utilities";

import { Columns } from "../columns";
import { Button, IconButton, Separator } from "@kn/ui";
import { toOtherColumns } from "../utilities";
import { ColumnsAdvancedPopover } from "./AdvancedPopover";

export const ColumnsBubbleMenu: React.FC<{ editor: Editor }> = React.memo(({ editor }) => {
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
    deleteNodeInner(editor, Columns.name);
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

  // Memoize column layout handlers to prevent re-creation on each render
  const handleThreeColumnsMiddle = useCallback(() => {
    toOtherColumns({
      state: editor.state,
      dispatch: editor.view.dispatch,
      type: "center",
      cols: 3
    })
  }, [editor]);

  const handleThreeColumns = useCallback(() => {
    toOtherColumns({
      state: editor.state,
      dispatch: editor.view.dispatch,
      type: "none",
      cols: 3
    })
  }, [editor]);

  const handleThreeColumnsLeft = useCallback(() => {
    toOtherColumns({
      state: editor.state,
      dispatch: editor.view.dispatch,
      type: "left",
      cols: 3
    })
  }, [editor]);

  const handleThreeColumnsRight = useCallback(() => {
    toOtherColumns({
      state: editor.state,
      dispatch: editor.view.dispatch,
      type: "right",
      cols: 3
    })
  }, [editor]);

  const handleTwoColumns = useCallback(() => {
    toOtherColumns({
      state: editor.state,
      dispatch: editor.view.dispatch,
      type: "none",
      cols: 2
    })
  }, [editor]);

  const handleTwoColumnsLeft = useCallback(() => {
    toOtherColumns({
      state: editor.state,
      dispatch: editor.view.dispatch,
      type: "left",
      cols: 2
    })
  }, [editor]);

  const handleTwoColumnsRight = useCallback(() => {
    toOtherColumns({
      state: editor.state,
      dispatch: editor.view.dispatch,
      type: "right",
      cols: 2
    })
  }, [editor]);

  return (
    <BubbleMenu
      forNode
      editor={editor}
      shouldShow={shouldShow}
      getReferenceClientRect={getReferenceClientRect}
      options={{}}>
      <div className="flex flex-row items-center gap-1">
        <IconButton onClick={copyMe} icon={<IconCopy />} title="Copy" />
        <Divider />
        <IconButton onClick={addColBefore} icon={<IconAddColumnBefore />} title="Add column before" />
        <IconButton onClick={addColAfter} icon={<IconAddColumnAfter />} title="Add column after" />
        <IconButton onClick={deleteCol} icon={<IconDeleteColumn />} title="Delete column" />
        <Divider />
        <IconButton icon={<IconThreeColumnsMiddle className="h-4 w-4" />} onClick={handleThreeColumnsMiddle} title="3 columns: center wide" />
        <IconButton icon={<IconThreeColumns className="h-4 w-4" />} onClick={handleThreeColumns} title="3 columns: equal" />
        <IconButton icon={<IconThreeColumnsLeft className="h-4 w-4" />} onClick={handleThreeColumnsLeft} title="3 columns: left wide" />
        <IconButton icon={<IconThreeColumnsRight className="h-4 w-4" />} onClick={handleThreeColumnsRight} title="3 columns: right wide" />
        <Divider />
        <IconButton icon={<IconTwoColumns className="h-4 w-4" />} onClick={handleTwoColumns} title="2 columns: equal" />
        <IconButton icon={<IconTwoColumnsLeft className="h-4 w-4" />} onClick={handleTwoColumnsLeft} title="2 columns: left wide" />
        <IconButton icon={<IconTwoColumnsRight className="h-4 w-4" />} onClick={handleTwoColumnsRight} title="2 columns: right wide" />
        <Divider />
        <ColumnsAdvancedPopover editor={editor} />
        <IconButton icon={<Trash2 className="h-4 w-4" />} onClick={deleteMe} title="Delete columns block" />
      </div>
    </BubbleMenu>
  );
}, (prevProps, nextProps) => {
  // Prevent re-render if editor hasn't changed
  return prevProps.editor === nextProps.editor;
});
