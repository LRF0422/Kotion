import { getCollaborationRuntime, type Editor } from "@kn/editor";
import type { Node as ProseMirrorNode } from "@kn/editor";
import {
  readAuthoritativeLogicFlowDocument,
  replaceAuthoritativeLogicFlowDocument,
} from "../../collaboration/diagram-store";
import type { Page } from "../../model/types";
import {
  getCurrentLogicFlowEditingContext,
  type LogicFlowEditingContextSnapshot,
} from "../logicflow-editing-context";
import { normalizeLogicFlowData } from "../../model/normalize";
import { serializeLogicFlowDocument } from "../../model/serialize";
import { stableStringify } from "../../model/stable-stringify";
import type { LogicFlowDocument } from "../../model/types";

export interface LogicFlowDiagramTarget {
  diagramId?: string;
  position?: number;
}

export interface LogicFlowDiagramRef {
  index: number;
  position: number;
  nodeSize: number;
  diagramId: string | null;
  node: ProseMirrorNode;
}

export interface LogicFlowDiagramSnapshot {
  ref: LogicFlowDiagramRef;
  document: LogicFlowDocument;
}

export interface ResolvedLogicFlowEditingContext {
  ref: LogicFlowDiagramRef;
  snapshot: LogicFlowEditingContextSnapshot;
}

export interface LogicFlowPageContext {
  page: Page;
  activePageId: string;
  selectedElementIds: string[];
  mode: "inline" | "workspace" | null;
  isCurrent: boolean;
}

function nodeDiagramId(node: ProseMirrorNode): string | null {
  return typeof node.attrs.id === "string" && node.attrs.id.trim()
    ? node.attrs.id
    : null;
}

export function listLogicFlowDiagramRefs(
  editor: Editor,
): LogicFlowDiagramRef[] {
  const refs: LogicFlowDiagramRef[] = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== "logicflowDiagram") return;
    refs.push({
      index: refs.length,
      position,
      nodeSize: node.nodeSize,
      diagramId: nodeDiagramId(node),
      node,
    });
  });
  return refs;
}

export function resolveCurrentLogicFlowEditingContext(
  editor: Editor,
): ResolvedLogicFlowEditingContext | null {
  const snapshot = getCurrentLogicFlowEditingContext(editor);
  if (!snapshot) return null;
  const refs = listLogicFlowDiagramRefs(editor);
  const ref = snapshot.diagramId
    ? refs.find((candidate) => candidate.diagramId === snapshot.diagramId)
    : refs.find((candidate) => candidate.position === snapshot.position);
  return ref ? { ref, snapshot } : null;
}

export function resolveLogicFlowDiagramRef(
  editor: Editor,
  target: LogicFlowDiagramTarget = {},
): LogicFlowDiagramRef {
  const refs = listLogicFlowDiagramRefs(editor);
  const diagramId = target.diagramId?.trim();
  const hasPosition = target.position !== undefined;

  if (!diagramId && !hasPosition) {
    const current = resolveCurrentLogicFlowEditingContext(editor);
    if (current) return current.ref;
    if (refs.length === 1) return refs[0];
    if (!refs.length) throw new Error("当前文档中没有 LogicFlow 流程图");
    throw new Error(
      "当前文档中有多张 LogicFlow 流程图，请先激活目标流程图或提供 diagramId",
    );
  }

  const byId = diagramId
    ? refs.find((candidate) => candidate.diagramId === diagramId)
    : undefined;
  if (diagramId && !byId)
    throw new Error(`未找到 diagramId 为 "${diagramId}" 的 LogicFlow 流程图`);

  const byPosition = hasPosition
    ? refs.find((candidate) => candidate.position === target.position)
    : undefined;
  if (hasPosition && !byPosition)
    throw new Error(`位置 ${target.position} 不是 LogicFlow 流程图节点`);

  if (byId && byPosition && byId.position !== byPosition.position) {
    throw new Error("diagramId 与 position 指向不同的 LogicFlow 流程图");
  }

  return byId ?? (byPosition as LogicFlowDiagramRef);
}

export function readLogicFlowDiagramRef(
  editor: Editor,
  ref: LogicFlowDiagramRef,
): LogicFlowDiagramSnapshot {
  const runtime = getCollaborationRuntime(editor);
  const document =
    runtime && ref.diagramId
      ? readAuthoritativeLogicFlowDocument(
          runtime.document,
          ref.diagramId,
          ref.node.attrs.data,
        )
      : normalizeLogicFlowData(ref.node.attrs.data).document;
  return { ref, document };
}

export function readLogicFlowDiagramAtTarget(
  editor: Editor,
  target: LogicFlowDiagramTarget = {},
): LogicFlowDiagramSnapshot {
  return readLogicFlowDiagramRef(
    editor,
    resolveLogicFlowDiagramRef(editor, target),
  );
}

export function resolveLogicFlowPageContext(
  editor: Editor,
  diagram: LogicFlowDiagramSnapshot,
  explicitPageId?: string,
): LogicFlowPageContext {
  const current = resolveCurrentLogicFlowEditingContext(editor);
  const matchingCurrent =
    current?.ref.position === diagram.ref.position ? current : null;
  const isCurrent = Boolean(matchingCurrent);
  const activePage =
    matchingCurrent &&
    diagram.document.pages.some(
      (page) => page.id === matchingCurrent.snapshot.pageId,
    )
      ? matchingCurrent.snapshot.pageId
      : undefined;
  const pageId = explicitPageId ?? activePage ?? diagram.document.pages[0]?.id;
  const page = diagram.document.pages.find(
    (candidate) => candidate.id === pageId,
  );
  if (!page) throw new Error(`未找到 pageId 为 "${pageId}" 的页面`);

  const selectedElementIds =
    matchingCurrent?.snapshot.pageId === page.id
      ? matchingCurrent.snapshot.selectedElementIds.filter(
          (id) =>
            page.graph.nodes.some((node) => node.id === id) ||
            page.graph.edges.some((edge) => edge.id === id),
        )
      : [];
  return {
    page,
    activePageId: activePage ?? page.id,
    selectedElementIds,
    mode: isCurrent ? (current?.snapshot.mode ?? null) : null,
    isCurrent,
  };
}

export function updateLogicFlowDiagramAtTarget(
  editor: Editor,
  target: LogicFlowDiagramTarget,
  nextDocument: LogicFlowDocument,
): LogicFlowDiagramSnapshot & { changed: boolean } {
  const current = readLogicFlowDiagramAtTarget(editor, target);
  const document = serializeLogicFlowDocument(nextDocument);
  const changed =
    stableStringify(current.document) !== stableStringify(document);
  if (!changed) return { ...current, changed: false };

  const runtime = getCollaborationRuntime(editor);
  let canonical = document;
  if (runtime) {
    if (!current.ref.diagramId) {
      throw new Error("协作模式下的 LogicFlow 流程图缺少稳定 diagramId");
    }
    canonical = replaceAuthoritativeLogicFlowDocument(
      runtime.document,
      current.ref.diagramId,
      document,
    );
  }

  const latestRef = current.ref.diagramId
    ? resolveLogicFlowDiagramRef(editor, { diagramId: current.ref.diagramId })
    : resolveLogicFlowDiagramRef(editor, { position: current.ref.position });
  const updated = editor.commands.updateLogicFlowAtPos(
    latestRef.position,
    canonical,
    runtime ? { addToHistory: false } : undefined,
  );
  if (!updated) throw new Error("LogicFlow 流程图更新失败");

  return {
    ref: latestRef,
    document: canonical,
    changed: true,
  };
}
