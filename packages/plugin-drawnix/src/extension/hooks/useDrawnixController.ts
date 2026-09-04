import { logger } from "@kn/common";
import type { NodeViewProps } from "@kn/editor";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Viewport } from "@xyflow/react";
import { layoutMindmap } from "../layout/tree-layout";
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
  updateMindmapNodeText,
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
  const migratedSourcesRef = useRef(new Set<string>());
  const lastPersistedFingerprintRef = useRef<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
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

  useEffect(() => {
    if (normalized.sourceFingerprint === lastPersistedFingerprintRef.current)
      return;
    const current = documentRef.current;
    if (
      contentFingerprint(normalized.document) !== contentFingerprint(current)
    ) {
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

  useEffect(() => {
    if (!isEditable || !normalized.migrated || !normalized.canWriteBack) return;
    if (migratedSourcesRef.current.has(normalized.sourceFingerprint)) return;
    if (stableStringify(props.node.attrs.data) !== normalized.sourceFingerprint)
      return;
    migratedSourcesRef.current.add(normalized.sourceFingerprint);
    persistDocument(normalized.document, false);
  }, [isEditable, normalized, persistDocument, props.node.attrs.data]);

  useEffect(() => {
    const updateHistory = () => setHistoryVersion((value) => value + 1);
    props.editor.on("transaction", updateHistory);
    return () => {
      props.editor.off("transaction", updateHistory);
    };
  }, [props.editor]);

  const layoutResult = useMemo(() => layoutMindmap(document), [document]);
  const selectedNode = findMindmapNode(document.root, selectedId);
  const canUndo = useMemo(
    () => props.editor.can().undo(),
    [props.editor, historyVersion],
  );
  const canRedo = useMemo(
    () => props.editor.can().redo(),
    [props.editor, historyVersion],
  );

  const startEditing = useCallback(
    (nodeId = selectedId) => {
      if (!isEditable) return;
      const node = findMindmapNode(documentRef.current.root, nodeId);
      if (!node) return;
      setSelectedId(nodeId);
      setEditingId(nodeId);
      setDraftText(node.text);
    },
    [isEditable, selectedId],
  );

  const commitEditing = useCallback(
    (value?: string) => {
      if (!editingId) return;
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
    [draftText, editingId, persistDocument],
  );

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setDraftText("");
  }, []);

  const addChild = useCallback(
    (parentId = selectedId) => {
      if (!isEditable) return;
      const newNode = createMindmapNode(nanoid(8), "新节点");
      const next = addMindmapChild(documentRef.current, parentId, newNode);
      if (!next) return;
      persistDocument(next);
      setSelectedId(newNode.id);
      setEditingId(newNode.id);
      setDraftText(newNode.text);
    },
    [isEditable, persistDocument, selectedId],
  );

  const addSibling = useCallback(
    (nodeId = selectedId) => {
      if (!isEditable) return;
      const newNode = createMindmapNode(nanoid(8), "新节点");
      const next = addMindmapSibling(documentRef.current, nodeId, newNode);
      if (!next) return;
      persistDocument(next);
      setSelectedId(newNode.id);
      setEditingId(newNode.id);
      setDraftText(newNode.text);
    },
    [isEditable, persistDocument, selectedId],
  );

  const deleteSelected = useCallback(() => {
    if (!isEditable || selectedId === documentRef.current.root.id) return;
    const next = deleteMindmapNode(documentRef.current, selectedId);
    if (!next) return;
    persistDocument(next);
    setSelectedId(next.root.id);
    cancelEditing();
  }, [cancelEditing, isEditable, persistDocument, selectedId]);

  const toggleCollapsed = useCallback(
    (nodeId = selectedId) => {
      if (!isEditable) return;
      const next = toggleMindmapNodeCollapsed(documentRef.current, nodeId);
      if (next) persistDocument(next);
    },
    [isEditable, persistDocument, selectedId],
  );

  const setLayout = useCallback(
    (layout: MindmapLayout) => {
      if (!isEditable) return;
      const next = setMindmapLayout(documentRef.current, layout);
      if (next !== documentRef.current) persistDocument(next);
    },
    [isEditable, persistDocument],
  );

  const commitNodePosition = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      if (!isEditable) return;
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
    [isEditable, persistDocument],
  );

  const updateViewport = useCallback((next: Viewport) => {
    viewportRef.current = next;
    setViewport(next);
  }, []);

  const persistViewport = useCallback(
    (next = viewportRef.current) => {
      viewportRef.current = next;
      setViewport(next);
      persistDocument({ ...documentRef.current, viewport: next }, false);
    },
    [persistDocument],
  );

  const undo = useCallback(
    () => props.editor.chain().focus().undo().run(),
    [props.editor],
  );
  const redo = useCallback(
    () => props.editor.chain().focus().redo().run(),
    [props.editor],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable="true"]')) return;
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
    setSelectedId,
    setDraftText,
    startEditing,
    commitEditing,
    cancelEditing,
    addChild,
    addSibling,
    deleteSelected,
    toggleCollapsed,
    setLayout,
    commitNodePosition,
    updateViewport,
    persistViewport,
    undo,
    redo,
    handleKeyDown,
  };
}

export type DrawnixController = ReturnType<typeof useDrawnixController>;
