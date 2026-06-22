import { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";

/**
 * Drag-to-reorder for table rows and columns.
 *
 * The row/column "grips" rendered by the table-cell and table-header
 * decorations are marked draggable and tagged with their index
 * (`data-grip-row` / `data-grip-col`). This plugin turns a drag that starts
 * on a grip into a reorder:
 *
 * - on `dragstart` it records the source kind + index
 * - on `dragover` it figures out the drop target under the pointer and shows
 *   a floating indicator line at the insertion boundary
 * - on `drop` it runs `moveTableRowToIndex` / `moveTableColumnToIndex`
 *
 * The actual structure mutation (and its merged-cell safety guard) lives in
 * the table commands; this plugin only handles the pointer interaction.
 */

type DragState = { type: "row" | "col"; from: number } | null;

const INDICATOR_ID = "kn-table-drop-indicator";

export const tableReorderPlugin = (editor: Editor): Plugin => {
  let drag: DragState = null;
  let targetIndex = -1;

  const removeIndicator = () => {
    document.getElementById(INDICATOR_ID)?.remove();
  };

  const showIndicator = (rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  }) => {
    let el = document.getElementById(INDICATOR_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = INDICATOR_ID;
      el.className = "table-drop-indicator";
      el.style.position = "fixed";
      el.style.zIndex = "1000";
      el.style.pointerEvents = "none";
      document.body.appendChild(el);
    }
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top}px`;
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
  };

  const cleanup = () => {
    drag = null;
    targetIndex = -1;
    removeIndicator();
  };

  /**
   * Convert an insertion slot in the original array to the final index after
   * the dragged item is removed, matching the splice semantics of the
   * move commands.
   */
  const toFinalIndex = (slot: number, from: number) =>
    slot > from ? slot - 1 : slot;

  const handleRowDragOver = (event: DragEvent, from: number): boolean => {
    const target = event.target as HTMLElement;
    const rowEl = target.closest?.("tr") as HTMLTableRowElement | null;
    const tableEl = target.closest?.("table") as HTMLElement | null;
    if (!rowEl || !tableEl) return false;

    const rows = Array.from(tableEl.querySelectorAll("tr"));
    const rowIndex = rows.indexOf(rowEl);
    if (rowIndex < 0) return false;

    const rect = rowEl.getBoundingClientRect();
    const below = event.clientY > rect.top + rect.height / 2;
    const slot = below ? rowIndex + 1 : rowIndex;
    targetIndex = toFinalIndex(slot, from);

    showIndicator({
      left: rect.left,
      top: below ? rect.bottom - 1 : rect.top - 1,
      width: rect.width,
      height: 2
    });
    return true;
  };

  const handleColDragOver = (event: DragEvent, from: number): boolean => {
    const target = event.target as HTMLElement;
    const cellEl = target.closest?.("td, th") as HTMLTableCellElement | null;
    const tableEl = target.closest?.("table") as HTMLElement | null;
    if (!cellEl || !tableEl) return false;

    const colIndex = cellEl.cellIndex;
    if (colIndex < 0) return false;

    const cellRect = cellEl.getBoundingClientRect();
    const tableRect = tableEl.getBoundingClientRect();
    const after = event.clientX > cellRect.left + cellRect.width / 2;
    const slot = after ? colIndex + 1 : colIndex;
    targetIndex = toFinalIndex(slot, from);

    showIndicator({
      left: after ? cellRect.right - 1 : cellRect.left - 1,
      top: tableRect.top,
      width: 2,
      height: tableRect.height
    });
    return true;
  };

  return new Plugin({
    key: new PluginKey("table-reorder"),
    props: {
      handleDOMEvents: {
        dragstart: (_view: EditorView, event: DragEvent) => {
          if (!editor.isEditable) return false;
          const el = event.target as HTMLElement;
          const rowGrip = el.closest?.("[data-grip-row]") as HTMLElement | null;
          const colGrip = el.closest?.("[data-grip-col]") as HTMLElement | null;

          if (rowGrip) {
            drag = { type: "row", from: Number(rowGrip.dataset.gripRow) };
          } else if (colGrip) {
            drag = { type: "col", from: Number(colGrip.dataset.gripCol) };
          } else {
            return false;
          }

          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            // Some browsers require data to be set for drag to proceed.
            event.dataTransfer.setData("text/plain", "table-reorder");
          }
          return false;
        },

        dragover: (_view: EditorView, event: DragEvent) => {
          if (!drag) return false;
          const handled =
            drag.type === "row"
              ? handleRowDragOver(event, drag.from)
              : handleColDragOver(event, drag.from);
          if (handled) {
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
          }
          return handled;
        },

        drop: (_view: EditorView, event: DragEvent) => {
          if (!drag) return false;
          event.preventDefault();
          const { type, from } = drag;
          const to = targetIndex;
          cleanup();

          if (to < 0 || to === from) return true;
          if (type === "row") {
            editor.commands.moveTableRowToIndex(from, to);
          } else {
            editor.commands.moveTableColumnToIndex(from, to);
          }
          return true;
        },

        dragend: () => {
          if (drag) cleanup();
          return false;
        }
      }
    }
  });
};
