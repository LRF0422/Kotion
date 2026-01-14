import React, { useCallback, useMemo } from "react";
import { Editor, findParentNode, posToDOMRect } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";

import {
  BubbleMenu,
  BubbleMenuProps,
  Divider
} from "../../../components";
import { copyNode, deleteNodeInner } from "../../../utilities";
import { triggerExcelImport } from "../utilities/excel-import";

import { Table } from "../table";
import { IconAddColumnAfter, IconAddColumnBefore, IconAddRowAfter, IconAddRowBefore, IconCopy, IconDeleteColumn, IconDeleteRow, IconDeleteTable, IconMergeCell, IconSplitCell, IconTableHeaderCell, IconTableHeaderColumn, IconTableHeaderRow, IconImport } from "../../../icons";
import { Toggle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";

export const TableBubbleMenu: React.FC<{ editor: Editor }> = React.memo(({ editor }) => {
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

  // General actions
  const copyMe = useCallback(() => {
    copyNode(editor, Table.name);
  }, [editor]);

  const deleteMe = useCallback(() => {
    deleteNodeInner(editor, Table.name);
  }, [editor]);

  const importExcel = useCallback(() => {
    triggerExcelImport(editor);
  }, [editor]);

  // Column actions
  const columnActions = useMemo(() => ({
    addBefore: () => editor.chain().focus().addColumnBefore().run(),
    addAfter: () => editor.chain().focus().addColumnAfter().run(),
    delete: () => editor.chain().focus().deleteColumn().run(),
  }), [editor]);

  // Row actions
  const rowActions = useMemo(() => ({
    addBefore: () => editor.chain().focus().addRowBefore().run(),
    addAfter: () => editor.chain().focus().addRowAfter().run(),
    delete: () => editor.chain().focus().deleteRow().run(),
  }), [editor]);

  // Header actions
  const headerActions = useMemo(() => ({
    toggleColumn: () => editor.chain().focus().toggleHeaderColumn().run(),
    toggleRow: () => editor.chain().focus().toggleHeaderRow().run(),
    toggleCell: () => editor.chain().focus().toggleHeaderCell().run(),
  }), [editor]);

  // Cell actions
  const cellActions = useMemo(() => ({
    merge: () => editor.chain().focus().mergeCells().run(),
    split: () => editor.chain().focus().splitCell().run(),
  }), [editor]);

  // Check if cells can be merged or split
  const canMergeCells = useMemo(() => {
    return editor.can().mergeCells();
  }, [editor]);

  const canSplitCell = useMemo(() => {
    return editor.can().splitCell();
  }, [editor]);

  return (
    <BubbleMenu
      forNode
      editor={editor}
      pluginKey="table-bubble-menu"
      shouldShow={shouldShow}
      getReferenceClientRect={getReferenceClientRect}
      options={{ shift: true, inline: true }}>
      <TooltipProvider>
        <div className="flex flex-row gap-1 items-center p-1 ">
          {/* Import & Copy */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                onClick={importExcel}
                aria-label="Import from Excel"
              >
                <IconImport />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Import from Excel</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                onClick={copyMe}
                aria-label="Copy table"
              >
                <IconCopy />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Copy Table</TooltipContent>
          </Tooltip>

          <Divider />

          {/* Column Actions */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                onClick={columnActions.addBefore}
                aria-label="Add column before"
              >
                <IconAddColumnBefore />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Add Column Before</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                onClick={columnActions.addAfter}
                aria-label="Add column after"
              >
                <IconAddColumnAfter />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Add Column After</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                onClick={columnActions.delete}
                aria-label="Delete column"
              >
                <IconDeleteColumn />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Delete Column</TooltipContent>
          </Tooltip>

          <Divider />

          {/* Row Actions */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                onClick={rowActions.addBefore}
                aria-label="Add row before"
              >
                <IconAddRowBefore />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Add Row Before</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                onClick={rowActions.addAfter}
                aria-label="Add row after"
              >
                <IconAddRowAfter />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Add Row After</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                onClick={rowActions.delete}
                aria-label="Delete row"
              >
                <IconDeleteRow />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Delete Row</TooltipContent>
          </Tooltip>

          <Divider />

          {/* Header Actions */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                onClick={headerActions.toggleColumn}
                aria-label="Toggle header column"
              >
                <IconTableHeaderColumn />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Toggle Header Column</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                onClick={headerActions.toggleRow}
                aria-label="Toggle header row"
              >
                <IconTableHeaderRow />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Toggle Header Row</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                onClick={headerActions.toggleCell}
                aria-label="Toggle header cell"
              >
                <IconTableHeaderCell />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Toggle Header Cell</TooltipContent>
          </Tooltip>

          {/* Cell Actions - Only show if applicable */}
          {(canMergeCells || canSplitCell) && (
            <>
              <Divider />
              {canMergeCells && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Toggle
                      size="sm"
                      onClick={cellActions.merge}
                      aria-label="Merge cells"
                    >
                      <IconMergeCell />
                    </Toggle>
                  </TooltipTrigger>
                  <TooltipContent>Merge Cells</TooltipContent>
                </Tooltip>
              )}
              {canSplitCell && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Toggle
                      size="sm"
                      onClick={cellActions.split}
                      aria-label="Split cell"
                    >
                      <IconSplitCell />
                    </Toggle>
                  </TooltipTrigger>
                  <TooltipContent>Split Cell</TooltipContent>
                </Tooltip>
              )}
            </>
          )}

          <Divider />

          {/* Delete Table */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                onClick={deleteMe}
                aria-label="Delete table"
              >
                <IconDeleteTable />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Delete Table</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </BubbleMenu>
  );
});
