import { getCollaborationRuntime, type NodeViewProps } from "@kn/editor";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { normalizeLogicFlowData } from "../model/normalize";
import { updatePage } from "../model/pages";
import { stableStringify } from "../model/stable-stringify";
import type { LogicFlowDocument, Page } from "../model/types";
import type { DiagramPresenceView } from "./CollaborationOverlay";
import {
  getLogicFlowCheckpointLeader,
  listRemoteLogicFlowPresence,
  removeLogicFlowAwareness,
  updateLogicFlowAwareness,
  type AwarenessLike,
} from "./awareness";
import {
  LOCAL_ORIGIN,
  getOrCreateDiagramMap,
  readLogicFlowDocument,
  replaceLogicFlowDocument,
  seedLogicFlowDocument,
} from "./yjs-codec";
import type { SyncStatus } from "../workspace/StatusBar";

const ROOT_MAP = "logicflow-diagrams";
const CHECKPOINT_DELAY_MS = 500;
const POINTER_INTERVAL_MS = 40;
const PRESENCE_HEARTBEAT_MS = 10_000;

interface LocalPresence {
  cursor: { x: number; y: number } | null;
  selection: string[];
  mode: "inline" | "workspace";
  pageId: string;
}

function userView(value: unknown): DiagramPresenceView["user"] {
  if (!value || typeof value !== "object")
    return { name: "Anonymous", color: "#3b82f6" };
  const user = value as Record<string, unknown>;
  return {
    name:
      (typeof user.name === "string" && user.name) ||
      (typeof user.nickName === "string" && user.nickName) ||
      "Anonymous",
    color: typeof user.color === "string" ? user.color : "#3b82f6",
    ...(typeof user.avatar === "string" ? { avatar: user.avatar } : {}),
  };
}

function pointValue(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== "object") return null;
  const point = value as Record<string, unknown>;
  return typeof point.x === "number" && typeof point.y === "number"
    ? { x: point.x, y: point.y }
    : null;
}

function changedPageIds(
  previous: LogicFlowDocument,
  next: LogicFlowDocument,
): string[] {
  const before = new Map(
    previous.pages.map((page) => [page.id, stableStringify(page)]),
  );
  const ids = new Set(next.pages.map((page) => page.id));
  for (const page of previous.pages) {
    if (!ids.has(page.id)) ids.add(page.id);
  }
  return [...ids].filter(
    (id) =>
      before.get(id) !== stableStringify(next.pages.find((p) => p.id === id)),
  );
}

function presenceView(
  clientId: number,
  user: unknown,
  presence: Record<string, unknown>,
): DiagramPresenceView {
  return {
    clientId,
    pageId: typeof presence.pageId === "string" ? presence.pageId : undefined,
    user: userView(user),
    cursor: pointValue(presence.cursor),
    selectedIds: Array.isArray(presence.selection)
      ? presence.selection.filter((id): id is string => typeof id === "string")
      : [],
  };
}

export function useLogicFlowCollaboration(props: NodeViewProps) {
  const runtime = getCollaborationRuntime(props.editor);
  const localDocRef = useRef<Y.Doc | null>(null);
  if (!localDocRef.current) localDocRef.current = new Y.Doc();
  const fallbackIdRef = useRef(`local-${nanoid(12)}`);
  const diagramId =
    typeof props.node.attrs.id === "string" && props.node.attrs.id
      ? props.node.attrs.id
      : fallbackIdRef.current;
  const ydoc = runtime?.document ?? localDocRef.current!;
  const awareness = runtime?.awareness as AwarenessLike | null | undefined;
  const diagramMap = useMemo(() => {
    const diagrams = ydoc.getMap<Y.Map<unknown>>(ROOT_MAP);
    const map = getOrCreateDiagramMap(
      diagrams,
      diagramId,
      "logicflow-bootstrap",
    );
    seedLogicFlowDocument(map, props.node.attrs.data, "logicflow-seed");
    return map;
  }, [diagramId, props.node.attrs.data, ydoc]);

  const initialDocument = useMemo(
    () => readLogicFlowDocument(diagramMap),
    [diagramMap],
  );
  const [document, setDocument] = useState(initialDocument);
  const documentRef = useRef(document);
  const [activePageId, setActivePageIdState] = useState(
    initialDocument.pages[0]?.id ?? "page-1",
  );
  const activePageIdRef = useRef(activePageId);
  const [presences, setPresences] = useState<DiagramPresenceView[]>([]);
  const [allCollaborators, setAllCollaborators] = useState<
    DiagramPresenceView[]
  >([]);
  const [status, setStatus] = useState<SyncStatus>(
    runtime ? "connecting" : "local",
  );
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirtyPageIds, setDirtyPageIds] = useState<string[]>([]);
  const presenceRef = useRef<LocalPresence>({
    cursor: null,
    selection: [],
    mode: "inline",
    pageId: activePageId,
  });
  const checkpointTimerRef = useRef<number | null>(null);
  const pointerTimerRef = useRef<number | null>(null);
  const lastPointerSentRef = useRef(0);
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null);
  const flushCheckpointRef = useRef<() => boolean>(() => false);

  const undoManager = useMemo(
    () =>
      new Y.UndoManager(diagramMap, {
        trackedOrigins: new Set([LOCAL_ORIGIN]),
        captureTimeout: 300,
      }),
    [diagramMap],
  );

  const readRemotePresence = useCallback(() => {
    if (!awareness) {
      setPresences([]);
      setAllCollaborators([]);
      return;
    }
    const all = listRemoteLogicFlowPresence(awareness, diagramId).map(
      ({ clientId, user, presence }) => presenceView(clientId, user, presence),
    );
    setAllCollaborators(all);
    setPresences(
      all.filter((presence) => presence.pageId === activePageIdRef.current),
    );
  }, [awareness, diagramId]);

  const publishPresence = useCallback(() => {
    if (!awareness) return;
    updateLogicFlowAwareness(awareness, diagramId, {
      cursor: presenceRef.current.cursor,
      selection: presenceRef.current.selection,
      mode: presenceRef.current.mode,
      pageId: presenceRef.current.pageId,
    });
  }, [awareness, diagramId]);

  const flushCheckpoint = useCallback((): boolean => {
    if (checkpointTimerRef.current !== null) {
      window.clearTimeout(checkpointTimerRef.current);
      checkpointTimerRef.current = null;
    }
    if (awareness) {
      const leader = getLogicFlowCheckpointLeader(awareness, diagramId);
      if (leader !== null && leader !== awareness.clientID) {
        setStatus(runtime?.status === "connected" ? "synced" : "offline");
        setDirtyPageIds([]);
        return true;
      }
    }
    let position: number | undefined;
    try {
      const resolved = props.getPos();
      if (typeof resolved === "number") position = resolved;
    } catch {
      return false;
    }
    if (position === undefined) return false;
    const saved = props.editor.commands.updateLogicFlowAtPos(
      position,
      documentRef.current,
      { addToHistory: false },
    );
    if (!saved) {
      setSaveError("流程图保存失败，请重试");
      setStatus("pending");
      return false;
    }
    setSaveError(null);
    setDirtyPageIds([]);
    setLastSavedAt(Date.now());
    setStatus(
      runtime
        ? runtime.status === "connected"
          ? "synced"
          : "offline"
        : "local",
    );
    return true;
  }, [awareness, diagramId, props.editor, props.getPos, runtime]);
  flushCheckpointRef.current = flushCheckpoint;

  const scheduleCheckpoint = useCallback(() => {
    setStatus("pending");
    if (checkpointTimerRef.current !== null)
      window.clearTimeout(checkpointTimerRef.current);
    checkpointTimerRef.current = window.setTimeout(
      flushCheckpoint,
      CHECKPOINT_DELAY_MS,
    );
  }, [flushCheckpoint]);

  useEffect(() => {
    const updateHistory = () =>
      setHistoryState({
        canUndo: undoManager.canUndo(),
        canRedo: undoManager.canRedo(),
      });
    const handleMapChange = () => {
      const next = readLogicFlowDocument(diagramMap);
      const previous = documentRef.current;
      const changed = changedPageIds(previous, next);
      if (changed.length) {
        setDirtyPageIds((current) => [...new Set([...current, ...changed])]);
      }
      if (stableStringify(next) !== stableStringify(previous)) {
        documentRef.current = next;
        setDocument(next);
      }
      updateHistory();
      scheduleCheckpoint();
    };
    diagramMap.observeDeep(handleMapChange);
    undoManager.on("stack-item-added", updateHistory);
    undoManager.on("stack-item-popped", updateHistory);
    undoManager.on("stack-cleared", updateHistory);
    updateHistory();
    return () => {
      diagramMap.unobserveDeep(handleMapChange);
      undoManager.off("stack-item-added", updateHistory);
      undoManager.off("stack-item-popped", updateHistory);
      undoManager.off("stack-cleared", updateHistory);
    };
  }, [diagramMap, scheduleCheckpoint, undoManager]);

  useEffect(() => {
    documentRef.current = document;
    if (!document.pages.some((page) => page.id === activePageIdRef.current)) {
      const fallback = document.pages[0]?.id ?? "page-1";
      activePageIdRef.current = fallback;
      setActivePageIdState(fallback);
      presenceRef.current = {
        ...presenceRef.current,
        pageId: fallback,
        cursor: null,
        selection: [],
      };
      publishPresence();
    }
  }, [document, publishPresence]);

  useEffect(() => {
    if (runtime) return;
    const external = normalizeLogicFlowData(props.node.attrs.data).document;
    if (stableStringify(external) === stableStringify(documentRef.current))
      return;
    replaceLogicFlowDocument(diagramMap, external, "logicflow-node-sync");
  }, [diagramMap, props.node.attrs.data, runtime]);

  useEffect(() => {
    if (!runtime) return;
    const provider = runtime.provider;
    const updateStatus = ({ status: next }: { status: string }) => {
      if (checkpointTimerRef.current !== null) setStatus("pending");
      else if (next === "connected") setStatus("synced");
      else if (next === "connecting") setStatus("connecting");
      else setStatus("offline");
    };
    updateStatus({ status: runtime.status });
    provider.on("status", updateStatus);
    return () => {
      provider.off("status", updateStatus);
    };
  }, [runtime]);

  useEffect(() => {
    if (!awareness) return;
    publishPresence();
    readRemotePresence();
    const onChange = () => readRemotePresence();
    awareness.on?.("change", onChange);
    const heartbeat = window.setInterval(
      publishPresence,
      PRESENCE_HEARTBEAT_MS,
    );
    return () => {
      flushCheckpointRef.current();
      window.clearInterval(heartbeat);
      awareness.off?.("change", onChange);
      removeLogicFlowAwareness(awareness, diagramId);
    };
  }, [awareness, diagramId, publishPresence, readRemotePresence]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (window.document.visibilityState === "hidden") flushCheckpoint();
    };
    window.document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      window.document.removeEventListener(
        "visibilitychange",
        onVisibilityChange,
      );
  }, [flushCheckpoint]);

  useEffect(
    () => () => {
      flushCheckpointRef.current();
      if (checkpointTimerRef.current !== null)
        window.clearTimeout(checkpointTimerRef.current);
      if (pointerTimerRef.current !== null)
        window.clearTimeout(pointerTimerRef.current);
      undoManager.destroy();
      if (!runtime) localDocRef.current?.destroy();
    },
    [runtime, undoManager],
  );

  const updateDocument = useCallback(
    (next: LogicFlowDocument) => {
      replaceLogicFlowDocument(diagramMap, next, LOCAL_ORIGIN);
    },
    [diagramMap],
  );

  const replaceDocument = useCallback(
    (next: LogicFlowDocument) => {
      undoManager.stopCapturing();
      replaceLogicFlowDocument(diagramMap, next, LOCAL_ORIGIN);
      undoManager.stopCapturing();
    },
    [diagramMap, undoManager],
  );

  const updateActivePage = useCallback(
    (next: Page | Partial<Omit<Page, "id">>) => {
      const current = documentRef.current.pages.find(
        (page) => page.id === activePageIdRef.current,
      );
      if (!current) return;
      const updated = "id" in next ? next : { ...current, ...next };
      updateDocument(
        updatePage(documentRef.current, activePageIdRef.current, updated),
      );
    },
    [updateDocument],
  );

  const setActivePageId = useCallback(
    (pageId: string) => {
      if (!documentRef.current.pages.some((page) => page.id === pageId)) return;
      activePageIdRef.current = pageId;
      setActivePageIdState(pageId);
      presenceRef.current = {
        ...presenceRef.current,
        pageId,
        cursor: null,
        selection: [],
      };
      publishPresence();
      readRemotePresence();
    },
    [publishPresence, readRemotePresence],
  );

  const setSelection = useCallback(
    (selection: string[]) => {
      presenceRef.current = { ...presenceRef.current, selection };
      publishPresence();
    },
    [publishPresence],
  );

  const setMode = useCallback(
    (mode: "inline" | "workspace") => {
      presenceRef.current = { ...presenceRef.current, mode };
      publishPresence();
    },
    [publishPresence],
  );

  const setPointer = useCallback(
    (cursor: { x: number; y: number } | null) => {
      pendingPointerRef.current = cursor;
      const now = Date.now();
      const wait = Math.max(
        0,
        POINTER_INTERVAL_MS - (now - lastPointerSentRef.current),
      );
      if (pointerTimerRef.current !== null) return;
      pointerTimerRef.current = window.setTimeout(() => {
        pointerTimerRef.current = null;
        lastPointerSentRef.current = Date.now();
        presenceRef.current = {
          ...presenceRef.current,
          cursor: pendingPointerRef.current,
        };
        publishPresence();
      }, wait);
    },
    [publishPresence],
  );

  const activePage =
    document.pages.find((page) => page.id === activePageId) ??
    document.pages[0];

  return {
    document,
    activePage,
    activePageId,
    setActivePageId,
    status,
    presences,
    allCollaborators,
    canUndo: historyState.canUndo,
    canRedo: historyState.canRedo,
    lastSavedAt,
    saveError,
    dirtyPageIds,
    updateDocument,
    updateActivePage,
    replaceDocument,
    undo: () => undoManager.undo(),
    redo: () => undoManager.redo(),
    setPointer,
    setSelection,
    setMode,
    flushCheckpoint,
    retryCheckpoint: flushCheckpoint,
  };
}
