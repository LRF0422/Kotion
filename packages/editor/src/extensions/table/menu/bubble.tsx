import React, { useCallback } from "react";
import { Editor, findParentNode, posToDOMRect } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";

import {
  BubbleMenu,
  BubbleMenuProps,
  Divider,
  Tooltip
} from "../../../components";
import { copyNode, deleteNode } from "../../../utilities";

import { Table } from "../table";
import { IconAddColumnAfter, IconAddColumnBefore, IconAddRowAfter, IconAddRowBefore, IconCopy, IconDeleteColumn, IconDeleteRow, IconDeleteTable, IconMergeCell, IconSplitCell, IconTableHeaderCell, IconTableHeaderColumn, IconTableHeaderRow } from "../../../icons";
import { Button } from "@kn/ui";

export const TableBubbleMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const shouldShow = useCallback<BubbleMenuProps["shouldShow"]>(() => {
    return editor.isActive(Table.name) && editor.isEditable;
  }, [editor]);

  const getReferenceClientRect = useCallback(() => {
    const { selection } = editor.state;
    const predicate = (node: PMNode) => node.type.name === Table.name;
    const parent = findParentNode(predicate)(selection);

    if (parent) {

      const dom = editor.view.nodeDOM(parent?.pos) as HTMLElement;
      // @ts-ignore
      return dom.firstElementChild.getBoundingClientRect();
    }

    return posToDOMRect(editor.view, selection.from, selection.to);
  }, [editor]);

  const copyMe = useCallback(() => {
    copyNode(editor, Table.name);
  }, [editor]);

  const deleteMe = useCallback(() => {
    deleteNode(editor, Table.name);
  }, [editor]);

  const addColumnBefore = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .addColumnBefore()
        .run(),
    [editor]
  );
  const addColumnAfter = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .addColumnAfter()
        .run(),
    [editor]
  );
  const deleteColumn = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .deleteColumn()
        .run(),
    [editor]
  );
  const addRowBefore = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .addRowBefore()
        .run(),
    [editor]
  );
  const addRowAfter = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .addRowAfter()
        .run(),
    [editor]
  );
  const deleteRow = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .deleteRow()
        .run(),
    [editor]
  );
  const toggleHeaderColumn = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .toggleHeaderColumn()
        .run(),
    [editor]
  );
  const toggleHeaderRow = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .toggleHeaderRow()
        .run(),
    [editor]
  );
  const toggleHeaderCell = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .toggleHeaderCell()
        .run(),
    [editor]
  );
  const mergeCells = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .mergeCells()
        .run(),
    [editor]
  );
  const splitCell = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .splitCell()
        .run(),
    [editor]
  );

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="table-bubble-menu"
      shouldShow={shouldShow}
      tippyOptions={{ getReferenceClientRect, offset: [0, -2] }}>
      <div className="flex flex-row gap-1 items-center">
        <Button variant="ghost" onClick={copyMe} size="icon" ><IconCopy /></Button>
        <Divider />
        <Button
          variant="ghost"
          onClick={addColumnBefore}
          size="icon"
        ><IconAddColumnBefore /></Button>
        <Button
          variant="ghost"
          onClick={addColumnAfter}
          size="icon"
        ><IconAddColumnAfter /></Button>
        <Button
          variant="ghost"
          onClick={deleteColumn}
          size="icon"
        ><IconDeleteColumn /></Button>
        <Divider />
        <Button
          variant="ghost"
          onClick={addRowBefore}
          size="icon"
        ><IconAddRowBefore /></Button>
        <Button
          variant="ghost"
          onClick={addRowAfter}
          size="icon"
        ><IconAddRowAfter /></Button>
        <Button variant="ghost" onClick={deleteRow} size="icon" ><IconDeleteRow /></Button>
        <Divider />
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleHeaderColumn}
        ><IconTableHeaderColumn /></Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={toggleHeaderRow}
        ><IconTableHeaderRow /></Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={toggleHeaderCell}
        ><IconTableHeaderCell /></Button>
        <Divider />
        <Button variant="ghost" size="icon" onClick={mergeCells} ><IconMergeCell /></Button>
        <Button variant="ghost" size="icon" onClick={splitCell} ><IconSplitCell /></Button>
        <Divider />
        <Button variant="ghost" size="icon" onClick={deleteMe} ><IconDeleteTable /></Button>
      </div>
    </BubbleMenu>
  );
};
