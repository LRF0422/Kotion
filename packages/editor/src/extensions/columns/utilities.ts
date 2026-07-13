import { Node, NodeType, Schema } from "@tiptap/pm/model";
import { addAnalytics } from "../perf";

import { Column } from "./column";
import { Columns } from "./columns";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { findParentNode } from "prosemirror-utils";

export type ColumnPreset = 'none' | 'left' | 'right' | 'center';

export interface ColumnStyle {
  background?: string | null;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  verticalAlign?: 'top' | 'center' | 'bottom';
}

export interface CreateColumnsOptions {
  gap?: number | null;
  widths?: (number | null)[] | null;
  styles?: (ColumnStyle | null | undefined)[] | null;
}

/**
 * Distribute widths across `count` columns so they sum to ~100 and each is
 * clamped to at least MIN_WIDTH. `null`/undefined entries share the leftover
 * proportionally. When the input is fully invalid, returns an empty array so
 * callers can decide to fall back to preset flex sizing.
 */
export function normalizeWidths(widths: (number | null | undefined)[] | null | undefined, count: number): number[] {
  const MIN = 5;
  if (!widths || widths.length === 0 || count <= 0) return [];

  // Truncate / pad with null to exactly `count` entries.
  const trimmed: (number | null)[] = [];
  for (let i = 0; i < count; i++) {
    const w = widths[i];
    if (typeof w === 'number' && Number.isFinite(w) && w > 0) {
      trimmed.push(Math.max(MIN, Math.min(95, w)));
    } else {
      trimmed.push(null);
    }
  }

  const providedSum = trimmed.reduce<number>((s, w) => s + (w ?? 0), 0);
  const nullCount = trimmed.filter(w => w === null).length;

  let result: number[];

  if (nullCount === 0) {
    // All widths provided; rescale to sum=100.
    const scale = providedSum > 0 ? 100 / providedSum : 1;
    result = trimmed.map(w => (w as number) * scale);
  } else if (providedSum >= 100) {
    // Overflow with unknowns; give each unknown the MIN and rescale.
    const shared = MIN;
    const totalForNulls = shared * nullCount;
    const scale = 100 / (providedSum + totalForNulls);
    result = trimmed.map(w => (w ?? shared) * scale);
  } else {
    // Distribute remainder equally among unknowns.
    const remainder = Math.max(nullCount * MIN, 100 - providedSum);
    const perNull = remainder / nullCount;
    result = trimmed.map(w => w ?? perNull);
  }

  // Enforce min again after scaling.
  result = result.map(w => Math.max(MIN, w));
  // Rescale to exactly 100 after clamping.
  const finalSum = result.reduce((s, w) => s + w, 0);
  if (finalSum > 0 && Math.abs(finalSum - 100) > 0.01) {
    const k = 100 / finalSum;
    result = result.map(w => w * k);
  }
  // Round to 2 decimals to keep JSON tidy.
  return result.map(w => Math.round(w * 100) / 100);
}

export function createColumn(
  colType: NodeType,
  index: number,
  colContent: any = null,
  type: string,
  cols: number,
  extraAttrs?: {
    width?: number | null;
    background?: string | null;
    padding?: 'none' | 'sm' | 'md' | 'lg';
    verticalAlign?: 'top' | 'center' | 'bottom';
  }
): Node | null {
  const attrs: Record<string, any> = { index, type, cols };
  if (extraAttrs) {
    if (extraAttrs.width !== undefined) attrs.width = extraAttrs.width;
    if (extraAttrs.background !== undefined) attrs.background = extraAttrs.background;
    if (extraAttrs.padding !== undefined) attrs.padding = extraAttrs.padding;
    if (extraAttrs.verticalAlign !== undefined) attrs.verticalAlign = extraAttrs.verticalAlign;
  }

  if (colContent) {
    return colType.createChecked(attrs, colContent);
  }

  return colType.createAndFill(attrs);
}

export function getColumnsNodeTypes(schema: Schema): { columns: NodeType; column: NodeType } {
  if (schema.cached.columnsNodeTypes) {
    return schema.cached.columnsNodeTypes;
  }

  const roles = {
    columns: schema.nodes["columns"],
    column: schema.nodes["column"]
  };

  schema.cached.columnsNodeTypes = roles;

  return roles;
}

export function createColumns(
  schema: Schema,
  colsCount: number,
  colContent: any = null,
  type: string,
  options?: CreateColumnsOptions
): Node {
  const types = getColumnsNodeTypes(schema);
  const cols: Node[] = [];

  const normalized = options?.widths
    ? normalizeWidths(options.widths, colsCount)
    : [];

  for (let index = 0; index < colsCount; index += 1) {
    const style = options?.styles?.[index];
    const width = normalized.length === colsCount ? normalized[index] : null;
    const col = createColumn(types.column, index, colContent, type, colsCount, {
      width,
      background: style?.background ?? null,
      padding: style?.padding ?? 'none',
      verticalAlign: style?.verticalAlign ?? 'top'
    });

    if (col) {
      cols.push(col);
    }
  }

  const columnsAttrs: Record<string, any> = { cols: colsCount, type };
  if (options?.gap !== undefined && options.gap !== null) {
    columnsAttrs.gap = options.gap;
  }

  return types.columns.createChecked(columnsAttrs, cols);
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

  if (!maybeColumns) {
    return false;
  }

  if (dispatch) {
    const { node: columnsNode, pos: columnsPos } = maybeColumns;
    const columnType = state.schema.nodes[Column.name];
    const tr = state.tr.setTime(Date.now());

    // Collect existing columns to preserve their content
    const existingColumns: Node[] = [];
    columnsNode.forEach((child) => {
      if (child.type.name === Column.name) {
        existingColumns.push(child);
      }
    });

    // Build new column nodes, preserving content from existing columns
    const newColumns: Node[] = [];
    for (let i = 0; i < cols; i++) {
      if (i < existingColumns.length) {
        newColumns.push(
          columnType.createChecked(
            { index: i, type, cols, width: null },
            existingColumns[i].content
          )
        );
      } else {
        const newCol = createColumn(columnType, i, null, type, cols);
        if (newCol) {
          newColumns.push(newCol);
        }
      }
    }

    const newColumnsNode = state.schema.nodes[Columns.name].createChecked(
      { cols, type },
      newColumns
    );

    tr.replaceWith(columnsPos, columnsPos + columnsNode.nodeSize, newColumnsNode);
    tr.setSelection(TextSelection.near(tr.doc.resolve(columnsPos + 1)));

    dispatch(
      addAnalytics(tr, {
        subject: "columns",
        action: `change layout to ${type} ${cols} cols`
      })
    );
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

/**
 * Layout-tree types shared between the buildLayout tool and the utility that
 * materializes a full multi-row/multi-column structure in a single pass.
 */
export interface LayoutCellSpec {
  width?: number | null;
  background?: string | null;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  verticalAlign?: 'top' | 'center' | 'bottom';
  /** Pre-parsed block-group node JSON (paragraphs, headings, lists, etc.). */
  contentJSON?: any[];
  /** Optional single level of nested rows (each nested cell must have no `nested`). */
  nested?: LayoutRowSpec[];
}

export interface LayoutRowSpec {
  gap?: number | null;
  layout?: ColumnPreset;
  cols: LayoutCellSpec[];
}

/**
 * Materialize one row (`columns` node) from a LayoutRowSpec. Nested rows are
 * appended after the cell's content nodes. Returns `null` when the row can't
 * be built (invalid schema, empty cells, deeper-than-1 nesting).
 */
export function buildColumnsRow(
  schema: Schema,
  row: LayoutRowSpec,
  depth: number = 0
): Node | null {
  if (!row || !Array.isArray(row.cols) || row.cols.length < 2) return null;
  const maxCols = depth === 0 ? 8 : 4;
  if (row.cols.length > maxCols) return null;

  const types = getColumnsNodeTypes(schema);
  if (!types.column || !types.columns) return null;

  const preset: ColumnPreset = row.layout ?? 'none';
  const cols = row.cols.length;

  // Precompute width array only if any cell specifies a width; otherwise leave
  // widths null so the preset flex fallback wins.
  const rawWidths = row.cols.map(c => (typeof c.width === 'number' ? c.width : null));
  const anyWidth = rawWidths.some(w => w !== null);
  const widths = anyWidth ? normalizeWidths(rawWidths, cols) : [];

  const columnNodes: Node[] = [];
  for (let i = 0; i < cols; i++) {
    const cell = row.cols[i];

    // Assemble column content: parsed block content + nested columns row.
    const childNodes: Node[] = [];
    const contentJSON = Array.isArray(cell.contentJSON) ? cell.contentJSON : [];
    for (const j of contentJSON) {
      try {
        const n = Node.fromJSON(schema, j);
        if (n && n.type.isBlock) childNodes.push(n);
      } catch {
        // skip invalid content silently
      }
    }

    if (cell.nested && cell.nested.length > 0) {
      if (depth >= 1) return null; // reject deeper nesting
      for (const nestedRow of cell.nested) {
        const nestedNode = buildColumnsRow(schema, nestedRow, depth + 1);
        if (nestedNode) childNodes.push(nestedNode);
      }
    }

    // Every column must have at least one block child.
    if (childNodes.length === 0) {
      const filler = schema.nodes.paragraph?.createAndFill();
      if (filler) childNodes.push(filler);
    }

    const columnAttrs: Record<string, any> = {
      index: i,
      type: preset,
      cols,
      width: widths.length === cols ? widths[i] : null,
      background: cell.background ?? null,
      padding: cell.padding ?? 'none',
      verticalAlign: cell.verticalAlign ?? 'top'
    };

    try {
      columnNodes.push(types.column.createChecked(columnAttrs, childNodes));
    } catch {
      return null;
    }
  }

  const columnsAttrs: Record<string, any> = { cols, type: preset };
  if (row.gap !== undefined && row.gap !== null && Number.isFinite(row.gap)) {
    columnsAttrs.gap = Math.max(0, Math.min(128, row.gap));
  }

  try {
    return types.columns.createChecked(columnsAttrs, columnNodes);
  } catch {
    return null;
  }
}
