import { logger } from "@kn/common";
import type { NodeViewProps } from "@kn/editor";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Viewport } from "@xyflow/react";
import {
  compensateViewportForNodeTopCenter,
  layoutMindmap,
} from "../layout/tree-layout";
import { normalizeDrawnixData, stableStringify } from "../model/normalize";
import {
  addMindmapChild,
  addMindmapSibling,
  createMindmapNode,
  deleteMindmapNode,
  findMindmapNode,
  setMindmapLayout,
  setMindmapManualOffset,
  toggleMindmapNodeCollapsed,
  updateMindmapNodeHref,
  updateMindmapNodeStyle,
  updateMindmapNodeText,
  type MindmapNodeStylePatch,
} from "../model/operations";
import { serializeDrawnixDocument } from "../model/serialize";
import type { MindmapDocument, MindmapLayout } from "../model/types";

function contentFingerprint(document: MindmapDocument): string {
  return stableStringify({ root: document.root, layout: document.layout });
}

export function useDrawnixController(props: NodeViewProps) {
  const normalized = useMemo(
    () => normalizeDrawnixData(props.node.attrs.data),
    [props.node.attrs.data],
  );
  const [document, setDocument] = useState(normalized.document);
  const documentRef = useRef(document);
  const [viewport, setViewport] = useState<Viewport>(
    normalized.document.viewport ?? { x: 0, y: 0, zoom: 1 },
  );
  const viewportRef = useRef(viewport);
  const [selectedId, setSelectedId] = useState(normalized.document.root.id);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const lastPersistedFingerprintRef = useRef<string | null>(null);
  const stylePreviewFingerprintRef = useRef<string | null>(null);
  const isEditable = props.editor.isEditable;

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const persistDocument = useCallback(
    (next: MindmapDocument, addToHistory = true) => {
      const position = props.getPos();
      if (typeof position !== "number") return false;
      const withViewport = { ...next, viewport: viewportRef.current };
      const serialized = serializeDrawnixDocument(withViewport);
      lastPersistedFingerprintRef.current = stableStringify(serialized);
      documentRef.current = withViewport;
      setDocument(withViewport);
      return props.editor.commands.updateDrawnixAtPos(position, serialized, {
        addToHistory,
      });
    },
    [props.editor, props.getPos],
  );

  const commitNodeStylePreview = useCallback(() => {
    const baseline = stylePreviewFingerprintRef.current;
    if (baseline === null) return false;
    stylePreviewFingerprintRef.current = null;
    const current = documentRef.current;
    if (contentFingerprint(current) === baseline) return false;
    return persistDocument(current);
  }, [persistDocument]);

  useEffect(() => {
    if (normalized.sourceFingerprint === lastPersistedFingerprintRef.current)
      return;
    const current = documentRef.current;
    if (
      contentFingerprint(normalized.document) !== contentFingerprint(current)
    ) {
      stylePreviewFingerprintRef.current = null;
      const next = { ...normalized.document, viewport: viewportRef.current };
      if (editingId && !findMindmapNode(next.root, editingId)) {
        logger.warn(
          `[Drawnix] Node ${editingId} was removed while it was being edited`,
        );
        setEditingId(null);
        setDraftText("");
      }
      documentRef.current = next;
      setDocument(next);
      if (!findMindmapNode(next.root, selectedId)) setSelectedId(next.root.id);
    }
  }, [editingId, normalized, selectedId]);

  const layoutResult = useMemo(() => layoutMindmap(document), [document]);
  const selectedNode = findMindmapNode(document.root, selectedId);
  const canUndo = props.editor.can().undo();
  const canRedo = props.editor.can().redo();

  const selectNode = useCallback(
    (nodeId: string) => {
      if (nodeId === selectedId) return;
      commitNodeStylePreview();
      setSelectedId(nodeId);
    },
    [commitNodeStylePreview, selectedId],
  );

  const previewNodeStyle = useCallback(
    (nodeId: string, patch: MindmapNodeStylePatch) => {
      if (!isEditable) return;
      const current = documentRef.current;
      const next = updateMindmapNodeStyle(current, nodeId, patch);
      if (!next || next === current) return;
      if (stylePreviewFingerprintRef.current === null)
        stylePreviewFingerprintRef.current = contentFingerprint(current);
      documentRef.current = next;
      setDocument(next);
    },
    [isEditable],
  );

  const setNodeStyle = useCallback(
    (nodeId: string, patch: MindmapNodeStylePatch | null) => {
      if (!isEditable) return false;
      commitNodeStylePreview();
      const current = documentRef.current;
      const next = updateMindmapNodeStyle(current, nodeId, patch);
      if (!next || next === current) return false;

      const mayChangeFontSize =
        patch === null ||
        Object.prototype.hasOwnProperty.call(patch, "fontSize");
      if (mayChangeFontSize) {
        const previousNode = layoutMindmap(current).nodes.find(
          (node) => node.id === nodeId,
        );
        const nextNode = layoutMindmap(next).nodes.find(
          (node) => node.id === nodeId,
        );
        if (
          previousNode &&
          nextNode &&
          previousNode.fontSize !== nextNode.fontSize
        ) {
          const compensatedViewport = compensateViewportForNodeTopCenter(
            viewportRef.current,
            previousNode,
            nextNode,
          );
          viewportRef.current = compensatedViewport;
          setViewport(compensatedViewport);
        }
      }

      return persistDocument(next);
    },
    [commitNodeStylePreview, isEditable, persistDocument],
  );

  const updateNodeHref = useCallback(
    (nodeId: string, href: string | null) => {
      if (!isEditable) return false;
      commitNodeStylePreview();
      const current = documentRef.current;
      const next = updateMindmapNodeHref(current, nodeId, href);
      if (!next) return false;
      if (next === current) return true;
      return persistDocument(next);
    },
    [commitNodeStylePreview, isEditable, persistDocument],
  );

  const startEditing = useCallback(
    (nodeId = selectedId) => {
      if (!isEditable) return;
      commitNodeStylePreview();
      const node = findMindmapNode(documentRef.current.root, nodeId);
      if (!node) return;
      setSelectedId(nodeId);
      setEditingId(nodeId);
      setDraftText(node.text);
    },
    [commitNodeStylePreview, isEditable, selectedId],
  );

  const commitEditing = useCallback(
    (value?: string) => {
      if (!editingId) return;
      commitNodeStylePreview();
      const nextText = value ?? draftText;
      const current = documentRef.current;
      const node = findMindmapNode(current.root, editingId);
      if (node && node.text !== nextText) {
        const next = updateMindmapNodeText(current, editingId, nextText);
        if (next) persistDocument(next);
      }
      setDraftText(nextText);
      setEditingId(null);
    },
    [commitNodeStylePreview, draftText, editingId, persistDocument],
  );

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setDraftText("");
  }, []);

  const addChild = useCallback(
    (parentId = selectedId) => {
      if (!isEditable) return;
      commitNodeStylePreview();
      const newNode = createMindmapNode(nanoid(8), "新节点");
      const next = addMindmapChild(documentRef.current, parentId, newNode);
      if (!next) return;
      persistDocument(next);
      setSelectedId(newNode.id);
      setEditingId(newNode.id);
      setDraftText(newNode.text);
    },
    [commitNodeStylePreview, isEditable, persistDocument, selectedId],
  );

  const addSibling = useCallback(
    (nodeId = selectedId) => {
      if (!isEditable) return;
      commitNodeStylePreview();
      const newNode = createMindmapNode(nanoid(8), "新节点");
      const next = addMindmapSibling(documentRef.current, nodeId, newNode);
      if (!next) return;
      persistDocument(next);
      setSelectedId(newNode.id);
      setEditingId(newNode.id);
      setDraftText(newNode.text);
    },
    [commitNodeStylePreview, isEditable, persistDocument, selectedId],
  );

  const deleteSelected = useCallback(() => {
    if (!isEditable || selectedId === documentRef.current.root.id) return;
    commitNodeStylePreview();
    const next = deleteMindmapNode(documentRef.current, selectedId);
    if (!next) return;
    persistDocument(next);
    setSelectedId(next.root.id);
    cancelEditing();
  }, [
    cancelEditing,
    commitNodeStylePreview,
    isEditable,
    persistDocument,
    selectedId,
  ]);

  const toggleCollapsed = useCallback(
    (nodeId = selectedId) => {
      if (!isEditable) return;
      commitNodeStylePreview();
      const next = toggleMindmapNodeCollapsed(documentRef.current, nodeId);
      if (next) persistDocument(next);
    },
    [commitNodeStylePreview, isEditable, persistDocument, selectedId],
  );

  const setLayout = useCallback(
    (layout: MindmapLayout) => {
      if (!isEditable) return;
      commitNodeStylePreview();
      const next = setMindmapLayout(documentRef.current, layout);
      if (next !== documentRef.current) persistDocument(next);
    },
    [commitNodeStylePreview, isEditable, persistDocument],
  );

  const commitNodePosition = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      if (!isEditable) return;
      commitNodeStylePreview();
      const layoutNode = layoutMindmap(documentRef.current).nodes.find(
        (node) => node.id === nodeId,
      );
      if (!layoutNode || layoutNode.isRoot) return;
      const next = setMindmapManualOffset(documentRef.current, nodeId, {
        x: position.x - layoutNode.basePosition.x,
        y: position.y - layoutNode.basePosition.y,
      });
      if (next) persistDocument(next);
    },
    [commitNodeStylePreview, isEditable, persistDocument],
  );

  const persistViewport = useCallback(
    (next = viewportRef.current) => {
      commitNodeStylePreview();
      viewportRef.current = next;
      setViewport(next);
      persistDocument({ ...documentRef.current, viewport: next }, false);
    },
    [commitNodeStylePreview, persistDocument],
  );

  const undo = useCallback(() => {
    commitNodeStylePreview();
    return props.editor.chain().focus().undo().run();
  }, [commitNodeStylePreview, props.editor]);
  const redo = useCallback(() => {
    commitNodeStylePreview();
    return props.editor.chain().focus().redo().run();
  }, [commitNodeStylePreview, props.editor]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          'input, textarea, select, button, [role="menu"], [role="listbox"], [contenteditable="true"]',
        )
      )
        return;
      if (!isEditable) return;
      if (event.key === "Tab") {
        event.preventDefault();
        addChild();
      } else if (event.key === "Enter") {
        event.preventDefault();
        addSibling();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      }
    },
    [addChild, addSibling, deleteSelected, isEditable],
  );

  return {
    document,
    layoutResult,
    viewport,
    selectedId,
    selectedNode,
    editingId,
    draftText,
    isEditable,
    canUndo,
    canRedo,
    selectNode,
    setDraftText,
    previewNodeStyle,
    commitNodeStylePreview,
    setNodeStyle,
    updateNodeHref,
    startEditing,
    commitEditing,
    cancelEditing,
    addChild,
    addSibling,
    deleteSelected,
    toggleCollapsed,
    setLayout,
    commitNodePosition,
    persistViewport,
    undo,
    redo,
    handleKeyDown,
  };
}

export type DrawnixController = ReturnType<typeof useDrawnixController>;
