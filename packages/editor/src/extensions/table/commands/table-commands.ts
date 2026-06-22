import { Fragment, Node as PMNode } from "@tiptap/pm/model";
import { EditorState, Transaction } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";
import { CommandProps, RawCommands } from "@tiptap/core";

import { findTable } from "../utilities";

/**
 * Commands that operate on whole rows / columns of an inline table:
 * moving, duplicating and sorting. They are registered on the `Table`
 * node via `addCommands` and are also reused by the drag-reorder plugin.
 *
 * All of these rebuild table structure, which is only safe when the table
 * has no merged cells. Each command therefore bails out (returns false)
 * when it detects a `rowspan`/`colspan` greater than 1, leaving the table
 * untouched rather than corrupting it.
 */

type TableInfo = {
  node: PMNode;
  /** Absolute position just before the table node. */
  pos: number;
  /** Absolute position of the table's content start. */
  start: number;
  map: TableMap;
};

/** Resolve the table around the current selection plus its TableMap. */
function getTable(state: EditorState): TableInfo | null {
  const table = findTable(state.selection);
  if (!table) return null;
  return {
    node: table.node,
    pos: table.pos,
    start: table.start,
    map: TableMap.get(table.node)
  };
}

/** Find the {row, col} of the cell containing the current selection. */
function getActiveCellRect(
  state: EditorState,
  info: TableInfo
): { row: number; col: number } | null {
  const $from = state.selection.$from;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    const role = node.type.spec.tableRole;
    if (role === "cell" || role === "header_cell") {
      const cellOffset = $from.before(d) - info.start;
      const rect = info.map.findCell(cellOffset);
      return { row: rect.top, col: rect.left };
    }
  }
  return null;
}

/** True when any cell in the table spans more than one row or column. */
function hasMergedCells(table: PMNode): boolean {
  let merged = false;
  table.descendants(node => {
    const role = node.type.spec.tableRole;
    if (role === "cell" || role === "header_cell") {
      if ((node.attrs.colspan ?? 1) > 1 || (node.attrs.rowspan ?? 1) > 1) {
        merged = true;
      }
    }
    return !merged;
  });
  return merged;
}

/** Collect the immediate children of a node into an array. */
function children(node: PMNode): PMNode[] {
  const out: PMNode[] = [];
  node.forEach(child => out.push(child));
  return out;
}

/** Replace the whole table node with a freshly built one. */
function replaceTable(
  tr: Transaction,
  info: TableInfo,
  rows: PMNode[]
): Transaction {
  const newTable = info.node.type.create(
    info.node.attrs,
    Fragment.fromArray(rows)
  );
  return tr.replaceWith(info.pos, info.pos + info.node.nodeSize, newTable);
}

/* ------------------------------------------------------------------ */
/* Row / column move                                                   */
/* ------------------------------------------------------------------ */

function moveRowTo(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  from: number,
  to: number
): boolean {
  const info = getTable(state);
  if (!info) return false;
  if (to < 0 || to >= info.map.height || from === to) return false;
  if (hasMergedCells(info.node)) return false;

  if (dispatch) {
    const rows = children(info.node);
    const [moved] = rows.splice(from, 1);
    rows.splice(to, 0, moved);
    dispatch(replaceTable(state.tr, info, rows));
  }
  return true;
}

function moveColumnTo(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  from: number,
  to: number
): boolean {
  const info = getTable(state);
  if (!info) return false;
  if (to < 0 || to >= info.map.width || from === to) return false;
  if (hasMergedCells(info.node)) return false;

  if (dispatch) {
    const rows = children(info.node).map(rowNode => {
      const cells = children(rowNode);
      const [moved] = cells.splice(from, 1);
      cells.splice(to, 0, moved);
      return rowNode.type.create(rowNode.attrs, Fragment.fromArray(cells));
    });
    dispatch(replaceTable(state.tr, info, rows));
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Row / column duplicate                                              */
/* ------------------------------------------------------------------ */

function duplicateRow(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined
): boolean {
  const info = getTable(state);
  if (!info) return false;
  if (hasMergedCells(info.node)) return false;
  const active = getActiveCellRect(state, info);
  if (!active) return false;

  if (dispatch) {
    const rows = children(info.node);
    const copy = rows[active.row].copy(rows[active.row].content);
    rows.splice(active.row + 1, 0, copy);
    dispatch(replaceTable(state.tr, info, rows));
  }
  return true;
}

function duplicateColumn(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined
): boolean {
  const info = getTable(state);
  if (!info) return false;
  if (hasMergedCells(info.node)) return false;
  const active = getActiveCellRect(state, info);
  if (!active) return false;

  if (dispatch) {
    const rows = children(info.node).map(rowNode => {
      const cells = children(rowNode);
      const cell = cells[active.col];
      cells.splice(active.col + 1, 0, cell.copy(cell.content));
      return rowNode.type.create(rowNode.attrs, Fragment.fromArray(cells));
    });
    dispatch(replaceTable(state.tr, info, rows));
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Sort by column                                                      */
/* ------------------------------------------------------------------ */

function isHeaderRow(rowNode: PMNode): boolean {
  return rowNode.childCount > 0 && rowNode.child(0).type.name === "tableHeader";
}

/** Compare two cell strings numerically when possible, else by locale. */
function compareValues(a: string, b: string): number {
  const na = parseFloat(a);
  const nb = parseFloat(b);
  const aNum = a.trim() !== "" && !Number.isNaN(na);
  const bNum = b.trim() !== "" && !Number.isNaN(nb);
  if (aNum && bNum) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true });
}

function sortByColumn(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  direction: "asc" | "desc"
): boolean {
  const info = getTable(state);
  if (!info) return false;
  if (hasMergedCells(info.node)) return false;
  const active = getActiveCellRect(state, info);
  if (!active) return false;

  const allRows = children(info.node);
  let headerCount = 0;
  while (headerCount < allRows.length && isHeaderRow(allRows[headerCount])) {
    headerCount++;
  }

  const headerRows = allRows.slice(0, headerCount);
  const dataRows = allRows.slice(headerCount);
  if (dataRows.length < 2) return false;

  const cellText = (rowNode: PMNode): string => {
    const cell = rowNode.maybeChild(active.col);
    return cell ? cell.textContent : "";
  };

  const sorted = [...dataRows].sort((ra, rb) => {
    const cmp = compareValues(cellText(ra), cellText(rb));
    return direction === "asc" ? cmp : -cmp;
  });

  if (dispatch) {
    dispatch(replaceTable(state.tr, info, [...headerRows, ...sorted]));
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Command registration                                                */
/* ------------------------------------------------------------------ */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableReorder: {
      /** Move the row containing the selection up or down by one. */
      moveTableRow: (direction: "up" | "down") => ReturnType;
      /** Move the column containing the selection left or right by one. */
      moveTableColumn: (direction: "left" | "right") => ReturnType;
      /** Move a row from one index to another (used by drag-reorder). */
      moveTableRowToIndex: (from: number, to: number) => ReturnType;
      /** Move a column from one index to another (used by drag-reorder). */
      moveTableColumnToIndex: (from: number, to: number) => ReturnType;
      /** Duplicate the row containing the selection. */
      duplicateTableRow: () => ReturnType;
      /** Duplicate the column containing the selection. */
      duplicateTableColumn: () => ReturnType;
      /** Sort data rows by the selected column, keeping header rows fixed. */
      sortTableByColumn: (direction: "asc" | "desc") => ReturnType;
    };
  }
}

export const tableReorderCommands: Partial<RawCommands> = {
  moveTableRow:
    (direction: "up" | "down") =>
    ({ state, dispatch }: CommandProps) => {
      const info = getTable(state);
      if (!info) return false;
      const active = getActiveCellRect(state, info);
      if (!active) return false;
      const to = direction === "up" ? active.row - 1 : active.row + 1;
      return moveRowTo(state, dispatch, active.row, to);
    },

  moveTableColumn:
    (direction: "left" | "right") =>
    ({ state, dispatch }: CommandProps) => {
      const info = getTable(state);
      if (!info) return false;
      const active = getActiveCellRect(state, info);
      if (!active) return false;
      const to = direction === "left" ? active.col - 1 : active.col + 1;
      return moveColumnTo(state, dispatch, active.col, to);
    },

  moveTableRowToIndex:
    (from: number, to: number) =>
    ({ state, dispatch }: CommandProps) =>
      moveRowTo(state, dispatch, from, to),

  moveTableColumnToIndex:
    (from: number, to: number) =>
    ({ state, dispatch }: CommandProps) =>
      moveColumnTo(state, dispatch, from, to),

  duplicateTableRow:
    () =>
    ({ state, dispatch }: CommandProps) =>
      duplicateRow(state, dispatch),

  duplicateTableColumn:
    () =>
    ({ state, dispatch }: CommandProps) =>
      duplicateColumn(state, dispatch),

  sortTableByColumn:
    (direction: "asc" | "desc") =>
    ({ state, dispatch }: CommandProps) =>
      sortByColumn(state, dispatch, direction)
};
