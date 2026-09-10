import type LogicFlow from "@logicflow/core";
import { useTranslation } from "@kn/common";
import type { NodeViewProps } from "@kn/editor";
import { Maximize2 } from "@kn/icon";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useResolvedTheme,
} from "@kn/ui";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  LogicFlowCanvas,
  type LogicFlowCanvasHandle,
} from "../canvas/LogicFlowCanvas";
import { CollaborationOverlay } from "../collaboration/CollaborationOverlay";
import { useLogicFlowCollaboration } from "../collaboration/useLogicFlowCollaboration";
import { registerLogicFlowEditingContext } from "../extension/logicflow-editing-context";
import "../style/index.css";
import { LogicFlowWorkspace } from "./LogicFlowWorkspace";

export function LogicFlowEditor(props: NodeViewProps) {
  const { t } = useTranslation();
  const resolvedTheme = useResolvedTheme();
  const dark = resolvedTheme === "dark";
  const rootRef = useRef<HTMLDivElement>(null);
  const inlineCanvasRef = useRef<LogicFlowCanvasHandle>(null);
  const [inlineReady, setInlineReady] = useState(false);
  const [inlineRevision, setInlineRevision] = useState(0);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isFallbackFullscreen, setIsFallbackFullscreen] = useState(false);
  const collaboration = useLogicFlowCollaboration(props);
  const isFullscreen = isNativeFullscreen || isFallbackFullscreen;
  const readOnly = !props.editor.isEditable;
  const activePage = collaboration.activePage;
  const activePageIdRef = useRef(collaboration.activePageId);
  const selectionRef = useRef<string[]>([]);
  const modeRef = useRef<"inline" | "workspace">("inline");
  const getPosRef = useRef(props.getPos);
  const diagramIdRef = useRef<unknown>(props.node.attrs.id);
  const editingContextRef = useRef<ReturnType<
    typeof registerLogicFlowEditingContext
  > | null>(null);
  activePageIdRef.current = collaboration.activePageId;
  modeRef.current = isFullscreen ? "workspace" : "inline";
  getPosRef.current = props.getPos;
  diagramIdRef.current = props.node.attrs.id;

  useEffect(() => {
    const handle = registerLogicFlowEditingContext(props.editor, () => {
      const currentDiagramId = diagramIdRef.current;
      const diagramId =
        typeof currentDiagramId === "string" && currentDiagramId.trim()
          ? currentDiagramId
          : null;
      const position = getPosRef.current();
      return {
        diagramId,
        position: typeof position === "number" ? position : null,
        pageId: activePageIdRef.current,
        selectedElementIds: selectionRef.current,
        mode: modeRef.current,
      };
    });
    editingContextRef.current = handle;
    return () => {
      handle.unregister();
      if (editingContextRef.current === handle)
        editingContextRef.current = null;
    };
  }, [props.editor]);

  const activateEditingContext = useCallback(() => {
    editingContextRef.current?.activate();
  }, []);

  const handleActivePageChange = useCallback(
    (pageId: string) => {
      activePageIdRef.current = pageId;
      selectionRef.current = [];
      activateEditingContext();
      collaboration.setActivePageId(pageId);
    },
    [activateEditingContext, collaboration.setActivePageId],
  );

  const handleSelectionChange = useCallback(
    (ids: string[]) => {
      selectionRef.current = ids;
      activateEditingContext();
      collaboration.setSelection(ids);
    },
    [activateEditingContext, collaboration.setSelection],
  );

  useEffect(() => {
    const handleFullscreenChange = () =>
      setIsNativeFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    collaboration.setMode(isFullscreen ? "workspace" : "inline");
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }, [collaboration.setMode, isFullscreen]);

  useEffect(() => {
    if (!isFallbackFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFallbackFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isFallbackFullscreen]);

  const handleInlineReady = useCallback((lf: LogicFlow) => {
    setInlineReady(true);
    lf.on("graph:transform", () => setInlineRevision((value) => value + 1));
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (isFallbackFullscreen) {
      collaboration.flushCheckpoint();
      setIsFallbackFullscreen(false);
      return;
    }
    if (document.fullscreenElement === rootRef.current) {
      collaboration.flushCheckpoint();
      await document.exitFullscreen();
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    try {
      await root.requestFullscreen();
    } catch {
      setIsFallbackFullscreen(true);
    }
  }, [collaboration, isFallbackFullscreen]);

  if (!activePage) return null;

  return (
    <div
      ref={rootRef}
      className={`logicflow-editor-root ${isFullscreen ? "" : "is-inline"} ${isFallbackFullscreen ? "is-fallback-fullscreen" : ""}`}
      data-theme={resolvedTheme}
      onPointerDownCapture={activateEditingContext}
      onFocusCapture={activateEditingContext}
    >
      {isFullscreen ? (
        <LogicFlowWorkspace
          document={collaboration.document}
          activePage={activePage}
          activePageId={collaboration.activePageId}
          readOnly={readOnly}
          dark={dark}
          status={collaboration.status}
          presences={collaboration.presences}
          allCollaborators={collaboration.allCollaborators}
          canUndo={collaboration.canUndo}
          canRedo={collaboration.canRedo}
          dirtyPageIds={collaboration.dirtyPageIds}
          lastSavedAt={collaboration.lastSavedAt}
          saveError={collaboration.saveError}
          onDocumentChange={collaboration.updateDocument}
          onPageChange={collaboration.updateActivePage}
          onViewportChange={collaboration.updatePageViewport}
          onReplaceDocument={collaboration.replaceDocument}
          onActivePageChange={handleActivePageChange}
          onUndo={collaboration.undo}
          onRedo={collaboration.redo}
          onRetrySave={() => void collaboration.retryCheckpoint()}
          onFlush={() => void collaboration.flushCheckpoint()}
          onPointerMove={collaboration.setPointer}
          onSelectionChange={handleSelectionChange}
          onToggleFullscreen={() => void toggleFullscreen()}
          onClose={() => void toggleFullscreen()}
        />
      ) : (
        <>
          <div
            className="logicflow-inline-header"
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <div className="logicflow-inline-meta">
              <span
                className="logicflow-inline-title"
                title={collaboration.document.title}
              >
                {collaboration.document.title}
              </span>
              <Select
                value={collaboration.activePageId}
                onValueChange={handleActivePageChange}
              >
                <SelectTrigger
                  className="logicflow-inline-page-trigger"
                  aria-label={t("logicflow.inline.switchPage")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {collaboration.document.pages.map((page) => (
                    <SelectItem key={page.id} value={page.id}>
                      {page.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {readOnly && (
                <span className="logicflow-inline-readonly">
                  {t("logicflow.inline.readOnly")}
                </span>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="logicflow-inline-open"
              onClick={() => void toggleFullscreen()}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              {t("logicflow.inline.workspace")}
            </Button>
          </div>
          <div className="logicflow-inline-canvas">
            <LogicFlowCanvas
              key={`${activePage.id}-${activePage.settings.grid}-${activePage.settings.snapline}-${activePage.settings.background}`}
              ref={inlineCanvasRef}
              document={activePage}
              readOnly
              dark={dark}
              showMiniMap={false}
              className={`h-full w-full ${activePage.settings.grid ? "" : "logicflow-grid-disabled"} ${activePage.settings.background === "solid" ? "logicflow-solid-background" : ""}`}
              onSelectionChange={handleSelectionChange}
              onPointerMove={collaboration.setPointer}
              onReady={handleInlineReady}
            />
            <CollaborationOverlay
              canvas={inlineReady ? inlineCanvasRef.current : null}
              document={activePage}
              presences={collaboration.presences}
              revision={inlineRevision}
            />
            {!activePage.graph.nodes.length && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                {t(
                  readOnly
                    ? "logicflow.inline.empty"
                    : "logicflow.inline.openWorkspaceHint",
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
