import React, { useCallback, useMemo } from "react";
import { Editor, findParentNode, posToDOMRect } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";

import {
  BubbleMenu,
  BubbleMenuProps,
} from "../../../components";
import { copyNode, deleteNodeInner } from "../../../utilities";
import { triggerExcelImport } from "../utilities/excel-import";

import { Table } from "../table";
import { IconAddColumnAfter, IconAddColumnBefore, IconAddRowAfter, IconAddRowBefore, IconCopy, IconDeleteColumn, IconDeleteRow, IconDeleteTable, IconMergeCell, IconSplitCell, IconTableHeaderCell, IconTableHeaderColumn, IconTableHeaderRow, IconImport, IconAlignLeft, IconAlignCenter, IconAlignRight, IconFontColor, IconMore } from "../../../icons";
import { Toggle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, ColorPicker, useTheme, createThemeAwareColor, getColorForTheme, Separator, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "@kn/ui";
import { exportTableToCSV, exportTableToExcel, copyTableAsMarkdown } from "../utilities/export";

export const TableBubbleMenu: React.FC<{ editor: Editor }> = React.memo(({ editor }) => {
  const { theme } = useTheme();

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

  // Current cell node (table cell or header) at the selection
  const currentCellNode = useMemo(() => {
    const { selection } = editor.state;
    const cellNode = editor.state.doc.nodeAt(selection.from - 1);
    if (cellNode && (cellNode.type.name === 'tableCell' || cellNode.type.name === 'tableHeader')) {
      return cellNode;
    }
    return null;
  }, [editor.state]);

  // Resolve a stored color attribute (theme-aware object or legacy string) to a display string
  const resolveColor = useCallback((value: any): string => {
    if (!value) return '';
    if (typeof value === 'object' && value.base) {
      return getColorForTheme(value, theme);
    }
    return value;
  }, [theme]);

  // Get current cell background color
  const currentCellBackgroundColor = useMemo(
    () => resolveColor(currentCellNode?.attrs.backgroundColor),
    [currentCellNode, resolveColor]
  );

  // Get current cell text color
  const currentCellColor = useMemo(
    () => resolveColor(currentCellNode?.attrs.color),
    [currentCellNode, resolveColor]
  );

  // Get current cell text alignment
  const currentTextAlign = useMemo(
    () => (currentCellNode?.attrs.textAlign as string) || 'left',
    [currentCellNode]
  );

  // Cell background color handlers
  const handleCellBackgroundColor = useCallback((color: string) => {
    // Create theme-aware color variants
    const themeAwareColor = createThemeAwareColor(color);
    editor.chain().focus().setCellAttribute('backgroundColor', themeAwareColor).run();
  }, [editor]);

  const handleUnsetCellBackgroundColor = useCallback(() => {
    editor.chain().focus().setCellAttribute('backgroundColor', null).run();
  }, [editor]);

  // Cell text color handlers
  const handleCellColor = useCallback((color: string) => {
    const themeAwareColor = createThemeAwareColor(color);
    editor.chain().focus().setCellAttribute('color', themeAwareColor).run();
  }, [editor]);

  const handleUnsetCellColor = useCallback(() => {
    editor.chain().focus().setCellAttribute('color', null).run();
  }, [editor]);

  // Text alignment handler - toggles back to default when re-selecting the active alignment
  const setTextAlign = useCallback((align: 'left' | 'center' | 'right') => {
    const next = currentTextAlign === align ? null : align;
    editor.chain().focus().setCellAttribute('textAlign', next).run();
  }, [editor, currentTextAlign]);

  // "More" dropdown actions
  const moreActions = useMemo(() => ({
    moveRowUp: () => editor.chain().focus().moveTableRow('up').run(),
    moveRowDown: () => editor.chain().focus().moveTableRow('down').run(),
    moveColLeft: () => editor.chain().focus().moveTableColumn('left').run(),
    moveColRight: () => editor.chain().focus().moveTableColumn('right').run(),
    duplicateRow: () => editor.chain().focus().duplicateTableRow().run(),
    duplicateColumn: () => editor.chain().focus().duplicateTableColumn().run(),
    sortAsc: () => editor.chain().focus().sortTableByColumn('asc').run(),
    sortDesc: () => editor.chain().focus().sortTableByColumn('desc').run(),
    exportCsv: () => exportTableToCSV(editor),
    exportExcel: () => exportTableToExcel(editor),
    copyMarkdown: () => { void copyTableAsMarkdown(editor); },
  }), [editor]);

  return (
    <BubbleMenu
      forNode
      editor={editor}
      pluginKey="table-bubble-menu"
      shouldShow={shouldShow}
      getReferenceClientRect={getReferenceClientRect}
      options={{ shift: true, inline: true }}>
      <TooltipProvider>
        <div className="flex flex-col gap-0.5 p-1.5 bg-popover">
          {/* Row 1: Structure operations */}
          <div className="flex flex-row gap-0.5 items-center">
            {/* Import & Copy */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle size="sm" onClick={importExcel} aria-label="Import from Excel">
                  <IconImport />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>Import from Excel</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle size="sm" onClick={copyMe} aria-label="Copy table">
                  <IconCopy />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>Copy Table</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-5 mx-0.5" />

            {/* Row Actions */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle size="sm" onClick={rowActions.addBefore} aria-label="Add row before">
                  <IconAddRowBefore />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>Add Row Before</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle size="sm" onClick={rowActions.addAfter} aria-label="Add row after">
                  <IconAddRowAfter />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>Add Row After</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle size="sm" onClick={rowActions.delete} aria-label="Delete row">
                  <IconDeleteRow />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>Delete Row</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-5 mx-0.5" />

            {/* Column Actions */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle size="sm" onClick={columnActions.addBefore} aria-label="Add column before">
                  <IconAddColumnBefore />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>Add Column Before</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle size="sm" onClick={columnActions.addAfter} aria-label="Add column after">
                  <IconAddColumnAfter />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>Add Column After</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle size="sm" onClick={columnActions.delete} aria-label="Delete column">
                  <IconDeleteColumn />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>Delete Column</TooltipContent>
            </Tooltip>
          </div>

          {/* Row 2: Format, Cell & Danger */}
          <div className="flex flex-row gap-0.5 items-center">
            {/* Header Toggles */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle size="sm" onClick={headerActions.toggleRow} aria-label="Toggle header row">
                  <IconTableHeaderRow />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>Toggle Header Row</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle size="sm" onClick={headerActions.toggleColumn} aria-label="Toggle header column">
                  <IconTableHeaderColumn />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>Toggle Header Column</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle size="sm" onClick={headerActions.toggleCell} aria-label="Toggle header cell">
                  <IconTableHeaderCell />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>Toggle Header Cell</TooltipContent>
            </Tooltip>

            {/* Cell Actions - Only show if applicable */}
            {(canMergeCells || canSplitCell) && (
              <>
                <Separator orientation="vertical" className="h-5 mx-0.5" />
                {canMergeCells && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Toggle size="sm" onClick={cellActions.merge} aria-label="Merge cells">
                        <IconMergeCell />
                      </Toggle>
                    </TooltipTrigger>
                    <TooltipContent>Merge Cells</TooltipContent>
                  </Tooltip>
                )}
                {canSplitCell && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Toggle size="sm" onClick={cellActions.split} aria-label="Split cell">
                        <IconSplitCell />
                      </Toggle>
                    </TooltipTrigger>
                    <TooltipContent>Split Cell</TooltipContent>
                  </Tooltip>
                )}
              </>
            )}

            <Separator orientation="vertical" className="h-5 mx-0.5" />

            {/* Text Alignment */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle size="sm" pressed={currentTextAlign === 'left'} onClick={() => setTextAlign('left')} aria-label="Align left">
                  <IconAlignLeft />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>Align Left</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle size="sm" pressed={currentTextAlign === 'center'} onClick={() => setTextAlign('center')} aria-label="Align center">
                  <IconAlignCenter />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>Align Center</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle size="sm" pressed={currentTextAlign === 'right'} onClick={() => setTextAlign('right')} aria-label="Align right">
                  <IconAlignRight />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>Align Right</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-5 mx-0.5" />

            {/* Cell Text Color */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <ColorPicker
                    simple
                    icon={<IconFontColor />}
                    background={currentCellColor}
                    setBackground={handleCellColor}
                    handleUnSet={handleUnsetCellColor}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>Text Color</TooltipContent>
            </Tooltip>

            {/* Cell Background Color */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <ColorPicker
                    simple
                    background={currentCellBackgroundColor}
                    setBackground={handleCellBackgroundColor}
                    handleUnSet={handleUnsetCellBackgroundColor}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>Cell Background Color</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-5 mx-0.5" />

            {/* More: move / duplicate / sort / export */}
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Toggle size="sm" aria-label="More table actions">
                      <IconMore />
                    </Toggle>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>More</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Move</DropdownMenuLabel>
                <DropdownMenuItem onClick={moreActions.moveRowUp}>Move Row Up</DropdownMenuItem>
                <DropdownMenuItem onClick={moreActions.moveRowDown}>Move Row Down</DropdownMenuItem>
                <DropdownMenuItem onClick={moreActions.moveColLeft}>Move Column Left</DropdownMenuItem>
                <DropdownMenuItem onClick={moreActions.moveColRight}>Move Column Right</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Duplicate</DropdownMenuLabel>
                <DropdownMenuItem onClick={moreActions.duplicateRow}>Duplicate Row</DropdownMenuItem>
                <DropdownMenuItem onClick={moreActions.duplicateColumn}>Duplicate Column</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Sort by Column</DropdownMenuLabel>
                <DropdownMenuItem onClick={moreActions.sortAsc}>Sort Ascending</DropdownMenuItem>
                <DropdownMenuItem onClick={moreActions.sortDesc}>Sort Descending</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Export</DropdownMenuLabel>
                <DropdownMenuItem onClick={moreActions.exportCsv}>Export as CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={moreActions.exportExcel}>Export as Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={moreActions.copyMarkdown}>Copy as Markdown</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Separator orientation="vertical" className="h-5 mx-0.5" />

            {/* Delete Table */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle
                  size="sm"
                  onClick={deleteMe}
                  aria-label="Delete table"
                  className=" hover:text-destructive"
                >
                  <IconDeleteTable />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>Delete Table</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>
    </BubbleMenu>
  );
});
