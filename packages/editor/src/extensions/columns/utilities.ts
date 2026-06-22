import { Node, NodeType, Schema } from "@tiptap/pm/model";
import { addAnalytics } from "../perf";

import { Column } from "./column";
import { Columns } from "./columns";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { findParentNode } from "prosemirror-utils";

export function createColumn(colType: NodeType, index: number, colContent = null, type: string, cols: number): Node | null {
  if (colContent) {
    return colType.createChecked({ index }, colContent);
  }

  return colType.createAndFill({ index, type, cols });
}

// Cache for columns node types to improve performance
let cachedColumnsNodeTypes: { columns: NodeType; column: NodeType } | null = null;

export function getColumnsNodeTypes(schema: Schema): { columns: NodeType; column: NodeType } {
  // Use in-memory cache for better performance
  if (cachedColumnsNodeTypes && schema.cached.columnsNodeTypes === cachedColumnsNodeTypes) {
    return cachedColumnsNodeTypes;
  }

  if (schema.cached.columnsNodeTypes) {
    cachedColumnsNodeTypes = schema.cached.columnsNodeTypes;
    return cachedColumnsNodeTypes!;
  }

  const roles = {
    columns: schema.nodes["columns"],
    column: schema.nodes["column"]
  };

  schema.cached.columnsNodeTypes = roles;
  cachedColumnsNodeTypes = roles;

  return roles;
}

export function createColumns(schema: Schema, colsCount: number, colContent = null, type: string): Node {
  const types = getColumnsNodeTypes(schema);
  const cols: Node[] = [];

  for (let index = 0; index < colsCount; index += 1) {
    const col = createColumn(types.column, index, colContent, type, colsCount);

    if (col) {
      cols.push(col);
    }
  }

  return types.columns.createChecked({ cols: colsCount }, cols);
}

export function addOrDeleteCol({
  state,
  dispatch,
  type
}: {
  state: EditorState;
  dispatch: any;
  type: "addBefore" | "addAfter" | "delete";
}): boolean {
  const maybeColumns = findParentNode(
    (node: Node) => node.type.name === Columns.name
  )(state.selection);
  const maybeColumn = findParentNode(
    (node: Node) => node.type.name === Column.name
  )(state.selection);

  if (!maybeColumns || !maybeColumn) {
    return false;
  }

  if (dispatch) {
    const cols = maybeColumns.node;
    const colIndex = maybeColumn.node.attrs.index;
    const colsJSON = cols.toJSON();

    let nextIndex = colIndex;

    if (type === "delete") {
      // Prevent deleting if only 2 columns remain
      if (colsJSON.content.length <= 2) {
        return false;
      }
      nextIndex = colIndex - 1;
      colsJSON.content.splice(colIndex, 1);
    } else {
      nextIndex = type === "addBefore" ? colIndex : colIndex + 1;
      colsJSON.content.splice(nextIndex, 0, {
        type: "column",
        attrs: {
          index: colIndex
        },
        content: [
          {
            type: "paragraph"
          }
        ]
      });
    }

    colsJSON.attrs.cols = colsJSON.content.length;

    // Update indices in a single pass
    colsJSON.content.forEach((colJSON: any, index: number) => {
      colJSON.attrs.index = index;
    });

    const nextCols = Node.fromJSON(state.schema, colsJSON);

    let nextSelectPos = maybeColumns.pos;
    nextCols.content.forEach((col, pos, index) => {
      if (index < nextIndex) {
        nextSelectPos += col.nodeSize;
      }
    });

    const tr = state.tr.setTime(Date.now());

    tr.replaceWith(
      maybeColumns.pos,
      maybeColumns.pos + maybeColumns.node.nodeSize,
      nextCols
    ).setSelection(TextSelection.near(tr.doc.resolve(nextSelectPos)));

    dispatch(
      addAnalytics(tr, {
        subject: "columns",
        action: ` ${type} column`
      })
    );
  }

  return true;
}

export function toOtherColumns({
  state,
  dispatch,
  type,
  cols,
}: {
  state: EditorState;
  dispatch: any;
  type: "left" | "none" | "right" | "center";
  cols: number;
}) {
  const maybeColumns = findParentNode(
    (node: Node) => node.type.name === Columns.name
  )(state.selection);

  if (dispatch && maybeColumns) {
    const newNode = createColumns(state.schema, cols, null, type)
    dispatch(
      state.tr.replaceRangeWith(maybeColumns.pos, maybeColumns.pos + maybeColumns.node.nodeSize, newNode)
    )
  }

  return true;
}

export function gotoCol({
  state,
  dispatch,
  type
}: {
  state: EditorState;
  dispatch: any;
  type: "before" | "after";
}) {
  const maybeColumns = findParentNode(
    (node: Node) => node.type.name === Columns.name
  )(state.selection);
  const maybeColumn = findParentNode(
    (node: Node) => node.type.name === Column.name
  )(state.selection);

  if (dispatch && maybeColumns && maybeColumn) {
    const cols = maybeColumns.node;
    const colIndex = maybeColumn.node.attrs.index;

    let nextIndex = 0;

    if (type === "before") {
      nextIndex = (colIndex - 1 + cols.attrs.cols) % cols.attrs.cols;
    } else {
      nextIndex = (colIndex + 1) % cols.attrs.cols;
    }

    let nextSelectPos = maybeColumns.pos;
    cols.content.forEach((col, pos, index) => {
      if (index < nextIndex) {
        nextSelectPos += col.nodeSize;
      }
    });

    const tr = state.tr.setTime(Date.now());

    tr.setSelection(TextSelection.near(tr.doc.resolve(nextSelectPos)));
    dispatch(tr);
  }

  return true;
}

/**
 * Build the (schema-valid) block nodes that should live inside a single column
 * from arbitrary dragged/target content JSON.
 *
 * A `column` only accepts `block+`. Some nodes the drag handle can grab are NOT
 * in the `block` group (e.g. a bare `listItem` / `taskItem`), so dropping them
 * straight into a column throws a schema error. We resolve each node and keep
 * only valid block-group nodes; if any node can't be a column child we bail
 * (return null) so the caller falls back to a normal drag-drop instead of
 * silently throwing.
 */
function toColumnBlocks(schema: Schema, content: any): Node[] | null {
  const json = Array.isArray(content) ? content : [content];

  try {
    const nodes = json.map(c => Node.fromJSON(schema, c));

    // Every node must be a block-group node to be valid `block+` column content.
    if (nodes.some(n => !n.type.isBlock || n.type.spec.group?.includes('block') === false)) {
      return null;
    }

    return nodes;
  } catch {
    return null;
  }
}

/**
 * Create a columns layout from two nodes (for drag-to-columns feature).
 * Returns null when the content can't form a valid 2-column layout, so the
 * caller can gracefully fall back to a normal drag-drop.
 * @param schema - Editor schema
 * @param leftContent - Content for the left column (JSON)
 * @param rightContent - Content for the right column (JSON)
 */
export function createColumnsFromNodes(
  schema: Schema,
  leftContent: any,
  rightContent: any
): Node | null {
  const types = getColumnsNodeTypes(schema);

  if (!types.column || !types.columns) return null;

  const leftBlocks = toColumnBlocks(schema, leftContent);
  const rightBlocks = toColumnBlocks(schema, rightContent);

  if (!leftBlocks || !rightBlocks || !leftBlocks.length || !rightBlocks.length) {
    return null;
  }

  try {
    const leftCol = types.column.createChecked({ index: 0, type: 'none', cols: 2 }, leftBlocks);
    const rightCol = types.column.createChecked({ index: 1, type: 'none', cols: 2 }, rightBlocks);

    return types.columns.createChecked({ cols: 2 }, [leftCol, rightCol]);
  } catch {
    return null;
  }
}
