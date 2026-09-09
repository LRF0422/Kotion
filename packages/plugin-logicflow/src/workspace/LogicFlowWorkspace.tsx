import type LogicFlow from "@logicflow/core";
import {
  ClipboardPaste,
  Copy,
  Layers3,
  PanelLeft,
  PanelRight,
  Scissors,
  Search,
  Trash2,
} from "@kn/icon";
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  cn,
  useResponsive,
} from "@kn/ui";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LogicFlowCanvas,
  type LogicFlowCanvasHandle,
} from "../canvas/LogicFlowCanvas";
import {
  createDiagramCommandService,
  createSelectionState,
  deleteLayer,
  deletePage,
  deleteScratchpadItem,
  duplicatePage,
  expandGroupedSelection,
  moveElementsToLayer,
  renameLayer,
  renamePage,
  renameScratchpadItem,
  reorderPage,
  setLayerLocked,
  setLayerVisibility,
  type AlignMode,
  type DiagramToolMode,
  type DistributeMode,
} from "../commands";
import {
  CollaborationOverlay,
  type DiagramPresenceView,
} from "../collaboration/CollaborationOverlay";
import {
  downloadBlob,
  exportDocumentJson,
  exportDocumentPdf,
  readLogicFlowJsonFile,
  renderPageSnapshot,
} from "../io";
import { addLayer } from "../model/layers";
import { addPage } from "../model/pages";
import type {
  Layer,
  LogicFlowDocument,
  LogicFlowPoint,
  LogicFlowViewport,
  Page,
  ScratchpadItem,
} from "../model/types";
import type { ShapeDefinition } from "../shapes";
import { InspectorPanel } from "../inspector/InspectorPanel";
import { ExportDialog, type DiagramExportOptions } from "./ExportDialog";
import { LayersPanel } from "./LayersPanel";
import { MenuBar } from "./MenuBar";
import { PageTabs } from "./PageTabs";
import { SearchPanel } from "./SearchPanel";
import { ShapeLibrary, type ShapeLibraryScratchpadItem } from "./ShapeLibrary";
import { StatusBar, type SyncStatus } from "./StatusBar";
import { TopToolbar } from "./TopToolbar";

export interface LogicFlowWorkspaceProps {
  document: LogicFlowDocument;
  activePage: Page;
  activePageId: string;
  readOnly: boolean;
  dark: boolean;
  status: SyncStatus;
  presences: DiagramPresenceView[];
  allCollaborators: DiagramPresenceView[];
  canUndo: boolean;
  canRedo: boolean;
  dirtyPageIds: string[];
  lastSavedAt: number | null;
  saveError: string | null;
  onDocumentChange: (document: LogicFlowDocument) => void;
  onPageChange: (page: Page) => void;
  onViewportChange: (pageId: string, viewport: LogicFlowViewport) => void;
  onReplaceDocument: (document: LogicFlowDocument) => void;
  onActivePageChange: (pageId: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onRetrySave: () => void;
  onFlush: () => void;
  onPointerMove: (point: LogicFlowPoint | null) => void;
  onSelectionChange: (ids: string[]) => void;
  onToggleFullscreen: () => void;
  onClose?: () => void;
}

function sameIds(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

function sameViewport(
  left: LogicFlowViewport | undefined,
  right: LogicFlowViewport,
): boolean {
  return Boolean(
    left &&
    Math.abs(left.scale - right.scale) < 0.001 &&
    Math.abs(left.x - right.x) < 0.5 &&
    Math.abs(left.y - right.y) < 0.5,
  );
}

export function LogicFlowWorkspace({
  document,
  activePage,
  activePageId,
  readOnly,
  dark,
  status,
  presences,
  allCollaborators,
  canUndo,
  canRedo,
  dirtyPageIds,
  lastSavedAt,
  saveError,
  onDocumentChange,
  onPageChange,
  onViewportChange,
  onReplaceDocument,
  onActivePageChange,
  onUndo,
  onRedo,
  onRetrySave,
  onFlush,
  onPointerMove,
  onSelectionChange,
  onToggleFullscreen,
  onClose,
}: LogicFlowWorkspaceProps) {
  const { isMobile, isTablet, isDesktop } = useResponsive();
  const canvasRef = useRef<LogicFlowCanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pointerRef = useRef<LogicFlowPoint | null>(null);
  const viewportByPageRef = useRef(
    new Map<string, LogicFlowViewport>(
      document.pages.flatMap((page) =>
        page.settings.viewport
          ? ([[page.id, page.settings.viewport]] as const)
          : [],
      ),
    ),
  );
  const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingViewportRef = useRef<{
    pageId: string;
    viewport: LogicFlowViewport;
  } | null>(null);
  const documentRef = useRef(document);
  const pageRef = useRef(activePage);
  const selectionRef = useRef<string[]>([]);
  documentRef.current = document;
  pageRef.current = activePage;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  selectionRef.current = selectedIds;
  const [mobilePanel, setMobilePanel] = useState<
    "shapes" | "inspector" | "search" | "layers" | null
  >(null);
  const [zoom, setZoom] = useState("100%");
  const [transformRevision, setTransformRevision] = useState(0);
  const [canvasReady, setCanvasReady] = useState(false);
  const [toolMode, setToolMode] = useState<DiagramToolMode>("select");
  const [showMiniMap, setShowMiniMap] = useState(!isMobile);
  const [showLayers, setShowLayers] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportType, setExportType] =
    useState<DiagramExportOptions["type"]>("png");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState<string>();
  const exportAbortRef = useRef<AbortController | null>(null);

  const commandContext = useMemo(
    () => ({
      getDocument: () => documentRef.current,
      getActivePageId: () => activePageId,
      getSelection: () => selectionRef.current,
      updateDocument: onDocumentChange,
      setSelection: (ids: string[]) => canvasRef.current?.select(ids),
      getInsertionPoint: () => pointerRef.current ?? { x: 40, y: 40 },
    }),
    [activePageId, onDocumentChange],
  );
  const commands = useMemo(
    () => createDiagramCommandService(commandContext),
    [commandContext],
  );

  const selectionState = useMemo(
    () => createSelectionState(activePage, selectedIds),
    [activePage, selectedIds],
  );
  const selectedNodeIds = selectionState.nodeIds;

  const handleSelectionChange = useCallback(
    (ids: string[]) => {
      const nodeIds = new Set(activePage.graph.nodes.map((node) => node.id));
      const selectedNodes = ids.filter((id) => nodeIds.has(id));
      const expandedNodes = expandGroupedSelection(activePage, selectedNodes);
      const expanded = [
        ...new Set(expandedNodes),
        ...ids.filter((id) => !nodeIds.has(id)),
      ];
      if (!sameIds(expanded, ids)) {
        canvasRef.current?.select(expanded);
        return;
      }
      setSelectedIds(expanded);
      onSelectionChange(expanded);
    },
    [activePage, onSelectionChange],
  );

  useEffect(() => {
    setSelectedIds([]);
    selectionRef.current = [];
    onSelectionChange([]);
  }, [activePageId, onSelectionChange]);

  useEffect(() => {
    canvasRef.current?.setToolMode(toolMode);
  }, [toolMode]);

  useEffect(() => setShowMiniMap(!isMobile), [isMobile]);

  const persistViewport = useCallback(
    (pageId: string, viewport: LogicFlowViewport) => {
      viewportByPageRef.current.set(pageId, viewport);
      const page = documentRef.current.pages.find((item) => item.id === pageId);
      if (!page || sameViewport(page.settings.viewport, viewport)) return;
      onViewportChange(pageId, viewport);
    },
    [onViewportChange],
  );

  const scheduleViewportSave = useCallback(
    (pageId: string, viewport: LogicFlowViewport) => {
      viewportByPageRef.current.set(pageId, viewport);
      pendingViewportRef.current = { pageId, viewport };
      if (viewportSaveTimerRef.current)
        clearTimeout(viewportSaveTimerRef.current);
      viewportSaveTimerRef.current = setTimeout(() => {
        const pending = pendingViewportRef.current;
        pendingViewportRef.current = null;
        viewportSaveTimerRef.current = null;
        if (pending) persistViewport(pending.pageId, pending.viewport);
      }, 350);
    },
    [persistViewport],
  );

  useEffect(
    () => () => {
      if (viewportSaveTimerRef.current)
        clearTimeout(viewportSaveTimerRef.current);
      const pending = pendingViewportRef.current;
      if (pending) persistViewport(pending.pageId, pending.viewport);
    },
    [persistViewport],
  );

  const handleCanvasReady = (lf: LogicFlow) => {
    setCanvasReady(true);
    const updateTransform = () => {
      const transform = lf.getTransform();
      setZoom(`${Math.round(transform.SCALE_X * 100)}%`);
      setTransformRevision((value) => value + 1);
      scheduleViewportSave(activePageId, {
        scale: transform.SCALE_X,
        x: transform.TRANSLATE_X,
        y: transform.TRANSLATE_Y,
      });
    };
    lf.on("graph:transform", updateTransform);
    updateTransform();
    canvasRef.current?.setToolMode(toolMode);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const saved = viewportByPageRef.current.get(activePageId);
        if (saved) canvasRef.current?.setViewport(saved);
      }),
    );
  };

  const handlePointer = (point: LogicFlowPoint | null) => {
    pointerRef.current = point;
    onPointerMove(point);
  };

  const persistCurrentViewport = () => {
    const viewport = canvasRef.current?.getViewport();
    if (viewport) persistViewport(activePageId, viewport);
  };

  const handleFullscreen = () => {
    persistCurrentViewport();
    onToggleFullscreen();
  };

  const handleClose = () => {
    persistCurrentViewport();
    onClose?.();
  };

  const switchPage = (pageId: string) => {
    const viewport = canvasRef.current?.getViewport();
    if (viewport) persistViewport(activePageId, viewport);
    onActivePageChange(pageId);
  };

  const addNewPage = () => {
    const next = addPage(documentRef.current);
    const added = next.pages.find(
      (page) => !documentRef.current.pages.some((old) => old.id === page.id),
    );
    onDocumentChange(next);
    if (added) switchPage(added.id);
  };
  const duplicateCurrentPage = (pageId: string) => {
    const next = duplicatePage(documentRef.current, pageId);
    const index = next.pages.findIndex((page) => page.id === pageId);
    onDocumentChange(next);
    if (next.pages[index + 1]) switchPage(next.pages[index + 1].id);
  };
  const removePage = (pageId: string) => {
    if (!window.confirm("确定删除此页面吗？")) return;
    const next = deletePage(documentRef.current, pageId);
    onDocumentChange(next);
    if (pageId === activePageId) onActivePageChange(next.pages[0].id);
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const result = await readLogicFlowJsonFile(file);
      if (!window.confirm("导入会替换当前流程图文档，是否继续？")) return;
      onReplaceDocument(result.document);
      onActivePageChange(result.document.pages[0].id);
      if (result.warnings.length) window.alert(result.warnings.join("\n"));
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "LogicFlow JSON 导入失败",
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const openExport = (type: DiagramExportOptions["type"]) => {
    setExportType(type);
    setExportProgress(undefined);
    setExportOpen(true);
  };

  const performExport = async (options: DiagramExportOptions) => {
    onFlush();
    setExportBusy(true);
    setExportProgress(undefined);
    const controller = new AbortController();
    exportAbortRef.current = controller;
    const filename =
      options.filename.trim() || document.title || "logicflow-diagram";
    try {
      if (options.type === "json") {
        downloadBlob(
          exportDocumentJson(documentRef.current),
          filename.endsWith(".json") ? filename : `${filename}.json`,
        );
      } else if (options.type === "pdf") {
        await exportDocumentPdf(documentRef.current, {
          filename: filename.endsWith(".pdf") ? filename : `${filename}.pdf`,
          dark,
          signal: controller.signal,
          onProgress: (completed, total, page) =>
            setExportProgress(`${completed}/${total} · ${page.name}`),
        });
      } else {
        const snapshot = await renderPageSnapshot(activePage, {
          type: options.type,
          dark,
          backgroundColor: options.transparent
            ? undefined
            : dark
              ? "#0f172a"
              : "#ffffff",
          padding: options.padding,
          scale: options.scale,
          selectedIds:
            options.selectionOnly && selectedIds.length
              ? selectedIds
              : undefined,
        });
        downloadBlob(
          snapshot.blob,
          filename.endsWith(`.${options.type}`)
            ? filename
            : `${filename}.${options.type}`,
        );
      }
      setExportOpen(false);
    } catch (error) {
      if ((error as { name?: string }).name !== "AbortError")
        window.alert(error instanceof Error ? error.message : "导出失败");
    } finally {
      exportAbortRef.current = null;
      setExportBusy(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.closest(
        "input, textarea, select, button, [role='menu'], [role='listbox'], [contenteditable='true']",
      )
    )
      return;
    const modifier = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (event.code === "Space") {
      event.preventDefault();
      setToolMode("pan");
      return;
    }
    if (readOnly) return;
    if (modifier && key === "z") {
      event.preventDefault();
      event.shiftKey ? onRedo() : onUndo();
    } else if (modifier && key === "y") {
      event.preventDefault();
      onRedo();
    } else if (modifier && key === "c") {
      event.preventDefault();
      void commands.copy();
    } else if (modifier && key === "x") {
      event.preventDefault();
      void commands.cut();
    } else if (modifier && key === "v") {
      event.preventDefault();
      void commands.paste(event.shiftKey);
    } else if (modifier && key === "d") {
      event.preventDefault();
      commands.duplicate();
    } else if (modifier && key === "a") {
      event.preventDefault();
      commands.selectAll();
    } else if (modifier && key === "g") {
      event.preventDefault();
      event.shiftKey ? commands.ungroup() : commands.group();
    } else if (modifier && key === "l") {
      event.preventDefault();
      commands.setLocked(!selectionState.lockedIds.length);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      commands.delete();
    } else if (event.key === "Escape") {
      commands.clearSelection();
    } else if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      commands.nudge(
        event.key === "ArrowLeft"
          ? -step
          : event.key === "ArrowRight"
            ? step
            : 0,
        event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0,
      );
    } else if (event.key === "+" || event.key === "=") {
      canvasRef.current?.zoomIn();
    } else if (event.key === "-") {
      canvasRef.current?.zoomOut();
    } else if (event.key === "0") {
      canvasRef.current?.resetZoom();
    }
  };

  const showStaticLeft = isDesktop || isTablet;
  const showStaticRight = isDesktop;
  const scratchpadItems = document.scratchpad as ShapeLibraryScratchpadItem[];

  const shapeLibrary = (
    <ShapeLibrary
      mobile={isMobile}
      onStartDrag={(shape: ShapeDefinition) =>
        canvasRef.current?.startDrag(shape)
      }
      onAdd={(shape: ShapeDefinition) => canvasRef.current?.addShape(shape)}
      scratchpadItems={scratchpadItems}
      canSaveSelection={Boolean(selectedNodeIds.length)}
      onSaveSelectionToScratchpad={(name) => commands.saveToScratchpad(name)}
      onInsertScratchpadItem={(item) => commands.insertScratchpad(item.id)}
      onRenameScratchpadItem={(id, name) =>
        onDocumentChange(renameScratchpadItem(documentRef.current, id, name))
      }
      onDeleteScratchpadItem={(id) =>
        onDocumentChange(deleteScratchpadItem(documentRef.current, id))
      }
    />
  );

  return (
    <div
      className="logicflow-workspace"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onKeyUp={(event) => {
        if (event.code === "Space" && toolMode === "pan") setToolMode("select");
      }}
    >
      <MenuBar
        title={document.title}
        onTitleChange={(title) =>
          onDocumentChange({ ...documentRef.current, title })
        }
      />
      <TopToolbar
        readOnly={readOnly}
        canUndo={canUndo}
        canRedo={canRedo}
        selectionCount={selectedIds.length}
        toolMode={toolMode}
        zoom={zoom}
        onToolMode={(mode) => {
          setToolMode(mode);
          canvasRef.current?.setToolMode(mode);
        }}
        onUndo={onUndo}
        onRedo={onRedo}
        onDelete={commands.delete}
        onAlign={commands.align as (mode: AlignMode) => void}
        onDistribute={commands.distribute as (mode: DistributeMode) => void}
        onGroup={commands.group}
        onUngroup={commands.ungroup}
        onSearch={() => setMobilePanel("search")}
        onImport={() => fileInputRef.current?.click()}
        onExport={openExport}
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
        onZoomReset={() => canvasRef.current?.resetZoom()}
        onFit={() => canvasRef.current?.fitView()}
        onFullscreen={handleFullscreen}
        onClose={handleClose}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => void handleImport(event.target.files?.[0])}
      />

      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
        {showStaticLeft && !readOnly && (
          <>
            <ResizablePanel defaultSize={18} minSize={14} maxSize={30}>
              <aside className="h-full overflow-hidden border-r bg-muted/20">
                {shapeLibrary}
              </aside>
            </ResizablePanel>
            <ResizableHandle />
          </>
        )}
        <ResizablePanel defaultSize={64} minSize={35}>
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <main className="logicflow-canvas-shell">
                <LogicFlowCanvas
                  key={`${activePage.id}-${activePage.settings.grid}-${activePage.settings.snapline}-${activePage.settings.background}-${showMiniMap}`}
                  ref={canvasRef}
                  document={activePage}
                  readOnly={readOnly}
                  dark={dark}
                  showMiniMap={showMiniMap && !isMobile}
                  className={cn(
                    "h-full w-full",
                    !activePage.settings.grid && "logicflow-grid-disabled",
                    activePage.settings.background === "solid" &&
                      "logicflow-solid-background",
                  )}
                  onGraphChange={onPageChange}
                  onSelectionChange={handleSelectionChange}
                  onPointerMove={handlePointer}
                  onReady={handleCanvasReady}
                />
                <CollaborationOverlay
                  canvas={canvasReady ? canvasRef.current : null}
                  document={activePage}
                  presences={presences}
                  revision={transformRevision}
                />
                {!activePage.graph.nodes.length && !readOnly && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                    从左侧拖入图形开始绘制
                  </div>
                )}
                {!showStaticLeft && !readOnly && (
                  <div className="logicflow-mobile-actions">
                    <Button
                      className="h-11"
                      variant="secondary"
                      onClick={() => setMobilePanel("shapes")}
                    >
                      <PanelLeft className="mr-2 h-4 w-4" />
                      图形
                    </Button>
                    <Button
                      className="h-11"
                      variant="secondary"
                      onClick={() => setMobilePanel("inspector")}
                    >
                      <PanelRight className="mr-2 h-4 w-4" />
                      属性
                    </Button>
                    <Button
                      className="h-11"
                      variant="secondary"
                      onClick={() => setMobilePanel("layers")}
                    >
                      <Layers3 className="mr-2 h-4 w-4" />
                      图层
                    </Button>
                  </div>
                )}
              </main>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                disabled={!selectedIds.length}
                onSelect={() => void commands.cut()}
              >
                <Scissors className="mr-2 h-4 w-4" />
                剪切
              </ContextMenuItem>
              <ContextMenuItem
                disabled={!selectedIds.length}
                onSelect={() => void commands.copy()}
              >
                <Copy className="mr-2 h-4 w-4" />
                复制
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => void commands.paste()}>
                <ClipboardPaste className="mr-2 h-4 w-4" />
                粘贴
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                disabled={!selectedIds.length}
                className="text-destructive"
                onSelect={commands.delete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </ResizablePanel>
        {showStaticRight && (
          <>
            <ResizableHandle />
            <ResizablePanel defaultSize={20} minSize={16} maxSize={35}>
              <aside className="h-full overflow-hidden border-l bg-background">
                {showLayers ? (
                  <LayersPanel
                    page={activePage}
                    selection={selectedIds}
                    editable={!readOnly}
                    onAdd={() => onPageChange(addLayer(activePage))}
                    onRename={(id, name) =>
                      onPageChange(renameLayer(activePage, id, name))
                    }
                    onDelete={(id) => onPageChange(deleteLayer(activePage, id))}
                    onToggleVisible={(layer: Layer) =>
                      onPageChange(
                        setLayerVisibility(
                          activePage,
                          layer.id,
                          !layer.visible,
                        ),
                      )
                    }
                    onToggleLocked={(layer: Layer) =>
                      onPageChange(
                        setLayerLocked(activePage, layer.id, !layer.locked),
                      )
                    }
                    onMoveSelection={(layerId) =>
                      onPageChange(
                        moveElementsToLayer(activePage, selectedIds, layerId),
                      )
                    }
                    onSelectElement={(id) => canvasRef.current?.select([id])}
                  />
                ) : (
                  <InspectorPanel
                    page={activePage}
                    selection={selectedIds}
                    commands={commands}
                    onUpdatePage={onPageChange}
                  />
                )}
              </aside>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      <PageTabs
        pages={document.pages}
        activePageId={activePageId}
        editable={!readOnly}
        dirtyPageIds={dirtyPageIds}
        onSelect={switchPage}
        onAdd={addNewPage}
        onDuplicate={duplicateCurrentPage}
        onRename={(id, name) =>
          onDocumentChange(renamePage(documentRef.current, id, name))
        }
        onReorder={(id, index) =>
          onDocumentChange(reorderPage(documentRef.current, id, index))
        }
        onDelete={removePage}
      />
      <StatusBar
        status={saveError ? "pending" : status}
        collaborators={allCollaborators.length + 1}
        zoom={zoom}
        pageName={activePage.name}
        lastSavedAt={lastSavedAt}
        error={saveError}
        onRetry={onRetrySave}
      />

      {mobilePanel && (
        <div
          className={cn(
            "logicflow-panel-overlay",
            isMobile ? "is-mobile" : "is-tablet",
          )}
        >
          <div className="flex h-11 items-center justify-between border-b px-3 text-sm font-medium">
            <span>
              {mobilePanel === "shapes"
                ? "图形"
                : mobilePanel === "search"
                  ? "搜索"
                  : mobilePanel === "layers"
                    ? "图层"
                    : "属性"}
            </span>
            <Button
              className="h-11"
              variant="ghost"
              onClick={() => setMobilePanel(null)}
            >
              关闭
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            {mobilePanel === "shapes" && shapeLibrary}
            {mobilePanel === "search" && (
              <SearchPanel
                document={activePage}
                onSelect={(id) => {
                  canvasRef.current?.select([id]);
                  canvasRef.current?.focusOn(id);
                  setMobilePanel(null);
                }}
              />
            )}
            {mobilePanel === "inspector" && (
              <InspectorPanel
                page={activePage}
                selection={selectedIds}
                commands={commands}
                onUpdatePage={onPageChange}
              />
            )}
            {mobilePanel === "layers" && (
              <LayersPanel
                page={activePage}
                selection={selectedIds}
                editable={!readOnly}
                onAdd={() => onPageChange(addLayer(activePage))}
                onRename={(id, name) =>
                  onPageChange(renameLayer(activePage, id, name))
                }
                onDelete={(id) => onPageChange(deleteLayer(activePage, id))}
                onToggleVisible={(layer) =>
                  onPageChange(
                    setLayerVisibility(activePage, layer.id, !layer.visible),
                  )
                }
                onToggleLocked={(layer) =>
                  onPageChange(
                    setLayerLocked(activePage, layer.id, !layer.locked),
                  )
                }
                onMoveSelection={(layerId) =>
                  onPageChange(
                    moveElementsToLayer(activePage, selectedIds, layerId),
                  )
                }
                onSelectElement={(id) => canvasRef.current?.select([id])}
              />
            )}
          </div>
        </div>
      )}
      <ExportDialog
        open={exportOpen}
        initialType={exportType}
        defaultName={document.title || activePage.name || "logicflow-diagram"}
        busy={exportBusy}
        progress={exportProgress}
        onOpenChange={(open) => {
          if (!exportBusy) setExportOpen(open);
        }}
        onExport={(options) => void performExport(options)}
        onCancel={() => exportAbortRef.current?.abort()}
      />
    </div>
  );
}
