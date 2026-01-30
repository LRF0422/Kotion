import { findParentNode } from "@tiptap/core";
import { Node, ResolvedPos } from "@tiptap/pm/model";
import { Selection, Transaction } from "@tiptap/pm/state";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import { EditorView } from "@tiptap/pm/view";

/**
 * Type for cell information returned by utility functions
 */
export interface CellInfo {
  pos: number;
  start: number;
  node: Node | null | undefined;
}

/**
 * Type for rect coordinates
 */
export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Checks if a rectangular selection matches the specified rect
 */
export const isRectSelected = (rect: Rect) => (selection: CellSelection) => {
  const map = TableMap.get(selection.$anchorCell.node(-1));
  const start = selection.$anchorCell.start(-1);
  const cells = map.cellsInRect(rect);
  const selectedCells = map.cellsInRect(
    map.rectBetween(
      selection.$anchorCell.pos - start,
      selection.$headCell.pos - start
    )
  );

  for (let i = 0, count = cells.length; i < count; i++) {
    if (selectedCells.indexOf(cells[i]!) === -1) {
      return false;
    }
  }

  return true;
};

/**
 * Finds the table node containing the current selection
 */
export const findTable = (selection: Selection) =>
  findParentNode(
    node => node.type.spec.tableRole && node.type.spec.tableRole === "table"
    // @ts-ignore
  )(selection);

/**
 * Checks if the selection is a CellSelection
 */
export const isCellSelection = (selection: Selection): selection is CellSelection => {
  return selection instanceof CellSelection;
};

/**
 * Checks if a specific column is selected
 */
export const isColumnSelected = (columnIndex: number) => (selection: Selection): boolean => {
  if (isCellSelection(selection)) {
    const map = TableMap.get(selection.$anchorCell.node(-1));
    return isRectSelected({
      left: columnIndex,
      right: columnIndex + 1,
      top: 0,
      bottom: map.height
    })(selection);
  }

  return false;
};

/**
 * Checks if a specific row is selected
 */
export const isRowSelected = (rowIndex: number) => (selection: Selection): boolean => {
  if (isCellSelection(selection)) {
    const map = TableMap.get(selection.$anchorCell.node(-1));
    return isRectSelected({
      left: 0,
      right: map.width,
      top: rowIndex,
      bottom: rowIndex + 1
    })(selection);
  }

  return false;
};

/**
 * Checks if the entire table is selected
 */
export const isTableSelected = (selection: Selection): boolean => {
  if (isCellSelection(selection)) {
    const map = TableMap.get(selection.$anchorCell.node(-1));
    return isRectSelected({
      left: 0,
      right: map.width,
      top: 0,
      bottom: map.height
    })(selection);
  }

  return false;
};

/**
 * Gets all cells in the specified column(s)
 */
export const getCellsInColumn = (columnIndex: number | number[]) => (
  selection: Selection
): CellInfo[] | undefined => {
  const table = findTable(selection);
  if (!table) return undefined;

  const map = TableMap.get(table.node);
  const indexes = Array.isArray(columnIndex) ? columnIndex : [columnIndex];

  return indexes.reduce((acc, index) => {
    if (index >= 0 && index <= map.width - 1) {
      const cells = map.cellsInRect({
        left: index,
        right: index + 1,
        top: 0,
        bottom: map.height
      });
      return acc.concat(
        cells.map(nodePos => {
          const node = table.node.nodeAt(nodePos);
          const pos = nodePos + table.start;
          return { pos, start: pos + 1, node };
        })
      );
    }
    return acc;
  }, [] as CellInfo[]);
};

/**
 * Gets all cells in the specified row(s)
 */
export const getCellsInRow = (rowIndex: number | number[]) => (
  selection: Selection
): CellInfo[] | undefined => {
  const table = findTable(selection);
  if (!table) return undefined;

  const map = TableMap.get(table.node);
  const indexes = Array.isArray(rowIndex) ? rowIndex : [rowIndex];

  return indexes.reduce((acc, index) => {
    if (index >= 0 && index <= map.height - 1) {
      const cells = map.cellsInRect({
        left: 0,
        right: map.width,
        top: index,
        bottom: index + 1
      });
      return acc.concat(
        cells.map(nodePos => {
          const node = table.node.nodeAt(nodePos);
          const pos = nodePos + table.start;
          return { pos, start: pos + 1, node };
        })
      );
    }
    return acc;
  }, [] as CellInfo[]);
};

/**
 * Gets all cells in the table
 */
export const getCellsInTable = (selection: Selection): CellInfo[] | undefined => {
  const table = findTable(selection);
  if (!table) return undefined;

  const map = TableMap.get(table.node);
  const cells = map.cellsInRect({
    left: 0,
    right: map.width,
    top: 0,
    bottom: map.height
  });

  return cells.map(nodePos => {
    const node = table.node.nodeAt(nodePos);
    const pos = nodePos + table.start;
    return { pos, start: pos + 1, node };
  });
};

/**
 * Finds the closest parent node matching a predicate from a given position
 */
export const findParentNodeClosestToPos = (
  $pos: ResolvedPos,
  predicate: (node: Node) => boolean
) => {
  for (let i = $pos.depth; i > 0; i--) {
    const node = $pos.node(i);
    if (predicate(node)) {
      return {
        pos: i > 0 ? $pos.before(i) : 0,
        start: $pos.start(i),
        depth: i,
        node
      };
    }
  }
  return undefined;
};

/**
 * Finds the closest cell node from a given position
 */
export const findCellClosestToPos = ($pos: ResolvedPos) => {
  const predicate = (node: Node) =>
    node.type.spec.tableRole && /cell/i.test(node.type.spec.tableRole as string);
  return findParentNodeClosestToPos($pos, predicate);
};

/**
 * Creates a function to select either a row or column
 */
const select = (type: "row" | "column") => (index: number) => (
  tr: Transaction
): Transaction => {
  const table = findTable(tr.selection);
  const isRowSelection = type === "row";

  if (!table) return tr;

  const map = TableMap.get(table.node);

  // Check if the index is valid
  if (index < 0 || index >= (isRowSelection ? map.height : map.width)) {
    return tr;
  }

  const left = isRowSelection ? 0 : index;
  const top = isRowSelection ? index : 0;
  const right = isRowSelection ? map.width : index + 1;
  const bottom = isRowSelection ? index + 1 : map.height;

  const cellsInFirstRow = map.cellsInRect({
    left,
    top,
    right: isRowSelection ? right : left + 1,
    bottom: isRowSelection ? top + 1 : bottom
  });

  const cellsInLastRow =
    bottom - top === 1
      ? cellsInFirstRow
      : map.cellsInRect({
        left: isRowSelection ? left : right - 1,
        top: isRowSelection ? bottom - 1 : top,
        right,
        bottom
      });

  const head = table.start + cellsInFirstRow[0]!;
  const anchor = table.start + cellsInLastRow[cellsInLastRow.length - 1]!;
  const $head = tr.doc.resolve(head);
  const $anchor = tr.doc.resolve(anchor);

  // @ts-ignore
  return tr.setSelection(new CellSelection($anchor, $head));
};

/**
 * Selects a specific column in the table
 */
export const selectColumn = select("column");

/**
 * Selects a specific row in the table
 */
export const selectRow = select("row");

/**
 * Selects the entire table
 */
export const selectTable = (tr: Transaction): Transaction => {
  const table = findTable(tr.selection);

  if (!table) return tr;

  const { map } = TableMap.get(table.node);

  if (!map || !map.length) return tr;

  const head = table.start + map[0]!;
  const anchor = table.start + map[map.length - 1]!;
  const $head = tr.doc.resolve(head);
  const $anchor = tr.doc.resolve(anchor);

  // @ts-ignore
  return tr.setSelection(new CellSelection($anchor, $head));
};

// @ts-ignore
function dropPoint(doc, pos, slice) {
  const $pos = doc.resolve(pos);
  if (!slice.content.size) {
    return pos;
  }
  let content = slice.content;
  for (let i = 0; i < slice.openStart; i++) {
    content = content.firstChild.content;
  }
  for (
    let pass = 1;
    pass <= (slice.openStart == 0 && slice.size ? 2 : 1);
    pass++
  ) {
    for (let d = $pos.depth; d >= 0; d--) {
      const bias =
        d == $pos.depth
          ? 0
          : $pos.pos <= ($pos.start(d + 1) + $pos.end(d + 1)) / 2
            ? -1
            : 1;
      const insertPos = $pos.index(d) + (bias > 0 ? 1 : 0);
      const parent = $pos.node(d);
      let fits = false;
      if (pass == 1) {
        fits = parent.canReplace(insertPos, insertPos, content);
      } else {
        const wrapping = parent
          .contentMatchAt(insertPos)
          .findWrapping(content.firstChild.type);
        fits =
          wrapping && parent.canReplaceWith(insertPos, insertPos, wrapping[0]);
      }
      if (fits) {
        return bias == 0
          ? $pos.pos
          : bias < 0
            ? $pos.before(d + 1)
            : $pos.after(d + 1);
      }
    }
  }
  return null;
}

/**
 * Removes a table and moves it to a new position during drag operations
 */
export const removePossibleTable = (
  view: EditorView,
  event: DragEvent
): Transaction | null => {
  const { state } = view;
  const $pos = state.selection.$anchor;

  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    if (node.type.spec["tableRole"] == "table") {
      const eventPos = view.posAtCoords({
        left: event.clientX,
        top: event.clientY
      });

      if (!eventPos) return null;

      const slice = view.dragging?.slice;
      if (!slice) return null;

      const $mouse = view.state.doc.resolve(eventPos.pos);
      const insertPos = dropPoint(view.state.doc, $mouse.pos, slice);

      if (!insertPos) return null;

      let tr = state.tr;
      tr = tr.delete($pos.before(d), $pos.after(d));

      const pos = tr.mapping.map(insertPos);
      tr = tr.replaceRange(pos, pos, slice).scrollIntoView();

      return tr;
    }
  }

  return null;
};

/**
 * Checks if a node is a table-related node
 */
export default function isTableNode(node: Node): boolean {
  const name = node instanceof Node ? node.type.name : null;
  return (
    name === "table" ||
    name === "tableRow" ||
    name === "tableHeader" ||
    name === "tableCell"
  );
}
