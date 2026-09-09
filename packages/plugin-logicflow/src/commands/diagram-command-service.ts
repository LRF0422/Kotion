import { nanoid } from "nanoid";
import { resizeContainerSubtree } from "../composites";
import { updatePage } from "../model/pages";
import type { LogicFlowDocument, LogicFlowPoint, Page } from "../model/types";
import {
  alignNodes,
  distributeNodes,
  type AlignMode,
  type DistributeMode,
} from "./alignment";
import {
  copySelection,
  cutSelection,
  pasteSelection,
  type ClipboardAdapter,
} from "./clipboard";
import {
  changeEdgesType,
  deleteElements,
  duplicateElements,
  flipNodes,
  nudgeNodes,
  patchElementProperties,
  reverseEdges,
  rotateNodes,
  selectAllElementIds,
  setElementsLocked,
} from "./element-commands";
import { groupNodes, ungroupNodes } from "./groups";
import { reorderElements, type ZOrderAction } from "./layer-commands";
import { createSelectionState } from "./selection";
import { insertScratchpadItem, saveSelectionToScratchpad } from "./scratchpad";

export type DiagramToolMode = "select" | "pan" | "connector";

export interface DiagramCommandContext {
  getDocument(): LogicFlowDocument;
  getActivePageId(): string;
  getSelection(): string[];
  updateDocument(document: LogicFlowDocument): void;
  setSelection(ids: string[]): void;
  getInsertionPoint?(): LogicFlowPoint;
  clipboard?: ClipboardAdapter;
}

function activePage(context: DiagramCommandContext): Page | undefined {
  return context
    .getDocument()
    .pages.find((page) => page.id === context.getActivePageId());
}

function commitPage(context: DiagramCommandContext, page: Page): void {
  context.updateDocument(
    updatePage(context.getDocument(), context.getActivePageId(), page),
  );
}

export function createDiagramCommandService(context: DiagramCommandContext) {
  let toolMode: DiagramToolMode = "select";
  let pasteCount = 0;
  const selection = () => context.getSelection();
  const page = () => activePage(context);
  const canEditSelection = () => {
    const current = page();
    return Boolean(
      current && createSelectionState(current, selection()).editableIds.length,
    );
  };

  return {
    get toolMode() {
      return toolMode;
    },
    setToolMode(mode: DiagramToolMode) {
      toolMode = mode;
    },
    canEditSelection,
    selectAll() {
      const current = page();
      if (current) context.setSelection(selectAllElementIds(current));
    },
    clearSelection() {
      context.setSelection([]);
    },
    delete() {
      const current = page();
      if (!current) return;
      commitPage(context, deleteElements(current, selection()));
      context.setSelection([]);
    },
    duplicate() {
      const current = page();
      if (!current) return;
      commitPage(context, duplicateElements(current, selection()));
    },
    async copy() {
      const current = page();
      if (current) await copySelection(current, selection(), context.clipboard);
    },
    async cut() {
      const current = page();
      if (!current) return;
      commitPage(
        context,
        await cutSelection(current, selection(), context.clipboard),
      );
      context.setSelection([]);
    },
    async paste(inPlace = false) {
      const current = page();
      if (!current) return;
      pasteCount += 1;
      const point = inPlace
        ? { x: 0, y: 0 }
        : (context.getInsertionPoint?.() ?? {
            x: 24 * pasteCount,
            y: 24 * pasteCount,
          });
      commitPage(
        context,
        await pasteSelection(current, point, context.clipboard),
      );
    },
    align(mode: AlignMode) {
      const current = page();
      if (current) commitPage(context, alignNodes(current, selection(), mode));
    },
    distribute(mode: DistributeMode) {
      const current = page();
      if (current)
        commitPage(context, distributeNodes(current, selection(), mode));
    },
    group() {
      const current = page();
      if (current)
        commitPage(
          context,
          groupNodes(current, `group-${nanoid(10)}`, selection(), "Group"),
        );
    },
    ungroup() {
      const current = page();
      if (current) commitPage(context, ungroupNodes(current, selection()));
    },
    setLocked(locked: boolean) {
      const current = page();
      if (current)
        commitPage(context, setElementsLocked(current, selection(), locked));
    },
    rotate(angle: number | "reset") {
      const current = page();
      if (current)
        commitPage(context, rotateNodes(current, selection(), angle));
    },
    flip(axis: "horizontal" | "vertical") {
      const current = page();
      if (current) commitPage(context, flipNodes(current, selection(), axis));
    },
    nudge(dx: number, dy: number) {
      const current = page();
      if (current)
        commitPage(context, nudgeNodes(current, selection(), dx, dy));
    },
    reorder(action: ZOrderAction) {
      const current = page();
      if (current)
        commitPage(context, reorderElements(current, selection(), action));
    },
    patchProperties(patch: Parameters<typeof patchElementProperties>[2]) {
      const current = page();
      if (current)
        commitPage(
          context,
          patchElementProperties(current, selection(), patch),
        );
    },
    updateContainerBounds(
      rootId: string,
      patch: Parameters<typeof resizeContainerSubtree>[2],
    ) {
      const current = page();
      if (!current) return;
      const selected = createSelectionState(current, [rootId]);
      if (!selected.editableIds.includes(rootId)) return;
      commitPage(context, resizeContainerSubtree(current, rootId, patch));
    },
    reverseEdges() {
      const current = page();
      if (current) commitPage(context, reverseEdges(current, selection()));
    },
    changeEdgeType(type: string) {
      const current = page();
      if (current)
        commitPage(context, changeEdgesType(current, selection(), type));
    },
    saveToScratchpad(name?: string) {
      const current = page();
      if (!current) return;
      context.updateDocument(
        saveSelectionToScratchpad(
          context.getDocument(),
          current,
          createSelectionState(current, selection()).nodeIds,
          name,
        ),
      );
    },
    insertScratchpad(itemId: string) {
      const current = page();
      const item = context
        .getDocument()
        .scratchpad.find((candidate) => candidate.id === itemId);
      if (!current || !item) return;
      commitPage(
        context,
        insertScratchpadItem(
          current,
          item,
          context.getInsertionPoint?.() ?? { x: 40, y: 40 },
        ),
      );
    },
  };
}

export type DiagramCommandService = ReturnType<
  typeof createDiagramCommandService
>;
