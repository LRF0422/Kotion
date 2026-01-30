// @ts-nocheck
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeView } from "@tiptap/pm/view";

/**
 * Updates the column structure of a table based on node attributes
 * @param node - The ProseMirror table node
 * @param colgroup - The colgroup DOM element
 * @param table - The table DOM element
 * @param cellMinWidth - Minimum width for cells
 * @param overrideCol - Optional column index to override
 * @param overrideValue - Optional value for the overridden column
 */
export function updateColumns(
  node: ProseMirrorNode,
  colgroup: Element,
  table: Element,
  cellMinWidth: number,
  overrideCol?: number,
  overrideValue?: any
) {
  let totalWidth = 0;
  let fixedWidth = true;
  let nextDOM = colgroup.firstChild as Element | null;
  const row = node.firstChild;

  if (!row) return;

  for (let i = 0, col = 0; i < row.childCount; i += 1) {
    const { colspan, colwidth } = row.child(i).attrs;

    for (let j = 0; j < colspan; j += 1, col += 1) {
      const hasWidth =
        overrideCol === col ? overrideValue : colwidth && colwidth[j];
      const cssWidth = hasWidth ? `${hasWidth}px` : "";

      totalWidth += hasWidth || cellMinWidth;

      if (!hasWidth) {
        fixedWidth = false;
      }

      if (!nextDOM) {
        const colElement = document.createElement("col");
        colElement.style.width = cssWidth;
        colgroup.appendChild(colElement);
      } else {
        if (nextDOM.style.width !== cssWidth) {
          nextDOM.style.width = cssWidth;
        }
        nextDOM = nextDOM.nextSibling as Element | null;
      }
    }
  }

  // Remove extra columns
  while (nextDOM) {
    const after = nextDOM.nextSibling;
    nextDOM.parentNode?.removeChild(nextDOM);
    nextDOM = after as Element | null;
  }

  // Set table width
  if (fixedWidth) {
    table.style.width = `${totalWidth}px`;
    table.style.minWidth = "";
  } else {
    table.style.width = "";
    table.style.minWidth = `${totalWidth}px`;
  }
}

export class TableView implements NodeView {
  node: ProseMirrorNode;
  cellMinWidth: number;
  dom: HTMLDivElement;
  scrollDom: HTMLDivElement;
  table: HTMLTableElement;
  colgroup: HTMLElement;
  contentDOM: HTMLTableSectionElement;

  constructor(node: ProseMirrorNode, cellMinWidth: number) {
    this.node = node;
    this.cellMinWidth = cellMinWidth;

    // Create wrapper
    this.dom = document.createElement("div");
    this.dom.className = "tableWrapper";
    this.dom.dataset["blockId"] = node.attrs["blockId"];

    // Create scroll wrapper
    this.scrollDom = document.createElement("div");
    this.scrollDom.className = "scrollWrapper";
    this.dom.appendChild(this.scrollDom);

    // Create table structure
    this.table = document.createElement("table");
    this.scrollDom.appendChild(this.table);

    this.colgroup = document.createElement("colgroup");
    this.table.appendChild(this.colgroup);

    updateColumns(node, this.colgroup, this.table, cellMinWidth);

    this.contentDOM = document.createElement("tbody");
    this.table.appendChild(this.contentDOM);
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) {
      return false;
    }

    this.node = node;
    this.dom.dataset["blockId"] = node.attrs["blockId"];
    updateColumns(node, this.colgroup, this.table, this.cellMinWidth);

    return true;
  }

  ignoreMutation(
    mutation: MutationRecord | { type: "selection"; target: Element }
  ): boolean {
    return (
      mutation.type === "attributes" &&
      (mutation.target === this.table ||
        this.colgroup.contains(mutation.target))
    );
  }
}
