import type { NodeViewProps } from "@kn/editor";
import { NodeViewWrapper } from "@kn/editor";
import { useTranslation } from "@kn/common";
import { useResolvedTheme } from "@kn/ui";
import { ReactFlowProvider } from "@xyflow/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import { MindmapFlow, type MindmapFlowActions } from "./flow/MindmapFlow";
import {
  type DrawnixController,
  useDrawnixController,
} from "./hooks/useDrawnixController";
import { normalizeDrawnixData } from "./model/normalize";
import { MindmapToolbar } from "./MindmapToolbar";
import "./style/index.css";

function DetachedMindmapFlow({
  controller,
  onActionsReady,
}: {
  controller: DrawnixController;
  onActionsReady: (actions: MindmapFlowActions) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<Root | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = createRoot(host);
    rootRef.current = root;
    return () => {
      rootRef.current = null;
      // Unmounting another React root synchronously during a commit trips
      // React's "synchronously unmount a root" guard and can race the host
      // editor's teardown; let the current task finish first.
      queueMicrotask(() => root.unmount());
    };
  }, []);

  useEffect(() => {
    rootRef.current?.render(
      <ReactFlowProvider>
        <MindmapFlow controller={controller} onActionsReady={onActionsReady} />
      </ReactFlowProvider>,
    );
  }, [controller, onActionsReady]);

  return <div ref={hostRef} className="h-full w-full" />;
}

/**
 * True while the node view is mounted inside a throwaway read-only preview
 * (Home hover card, template preview, [[ page picker). The preview editor marks
 * its DOM with `data-kn-preview`. Mounting the interactive ReactFlow root inside
 * those previews repeatedly broke the host editor (`domFromPos` on a null view)
 * and tripped React's nested-root guards, so previews get a static card instead.
 */
function isPreviewEditor(editor: NodeViewProps["editor"]): boolean {
  try {
    return editor?.view?.dom?.getAttribute("data-kn-preview") === "true";
  } catch {
    return false;
  }
}

function DrawnixPreviewPlaceholder({ node }: { node: NodeViewProps["node"] }) {
  const { t } = useTranslation();
  const rootText = useMemo(() => {
    try {
      const text = normalizeDrawnixData(node.attrs.data).document.root.text?.trim();
      return text || t("drawnix.previewTitle");
    } catch {
      return t("drawnix.previewTitle");
    }
  }, [node.attrs.data, t]);

  return (
    <NodeViewWrapper className="w-full" contentEditable={false}>
      <div className="flex items-center gap-2 rounded-md border border-dashed border-border/60 bg-muted/20 px-3 py-4">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/80">
          {rootText}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground/70">
          {t("drawnix.previewHint")}
        </span>
      </div>
    </NodeViewWrapper>
  );
}

function DrawnixInteractiveView(props: NodeViewProps) {
  const resolvedTheme = useResolvedTheme();
  const controller = useDrawnixController(props);
  const containerRef = useRef<HTMLDivElement>(null);
  const flowActionsRef = useRef<MindmapFlowActions | null>(null);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isFallbackFullscreen, setIsFallbackFullscreen] = useState(false);
  const isFullscreen = isNativeFullscreen || isFallbackFullscreen;

  const handleActionsReady = useCallback((actions: MindmapFlowActions) => {
    flowActionsRef.current = actions;
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsNativeFullscreen(
        document.fullscreenElement === containerRef.current,
      );
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

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

  useEffect(() => {
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }, [isFullscreen]);

  const toggleFullscreen = useCallback(async () => {
    if (isFallbackFullscreen) {
      setIsFallbackFullscreen(false);
      return;
    }
    if (document.fullscreenElement === containerRef.current) {
      await document.exitFullscreen();
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    try {
      await container.requestFullscreen();
    } catch {
      setIsFallbackFullscreen(true);
    }
  }, [isFallbackFullscreen]);

  const selectedNode = controller.selectedNode;

  return (
    <NodeViewWrapper className="w-full" contentEditable={false}>
      <div
        ref={containerRef}
        className={`drawnix-root ${resolvedTheme === "dark" ? "drawnix-dark" : ""} ${isFallbackFullscreen ? "is-fallback-fullscreen" : ""}`}
        data-theme={resolvedTheme}
        tabIndex={0}
        onKeyDown={controller.handleKeyDown}
      >
        <MindmapToolbar
          canUndo={controller.canUndo}
          canRedo={controller.canRedo}
          zoom={controller.viewport.zoom * 100}
          hasSelection={Boolean(selectedNode)}
          canDelete={Boolean(
            selectedNode && selectedNode.id !== controller.document.root.id,
          )}
          canCollapse={Boolean(selectedNode?.children.length)}
          isCollapsed={Boolean(selectedNode?.collapsed)}
          isEditable={controller.isEditable}
          isFullscreen={isFullscreen}
          layout={controller.document.layout}
          onAddChild={() => controller.addChild()}
          onAddSibling={() => controller.addSibling()}
          onEdit={() => controller.startEditing()}
          onDelete={controller.deleteSelected}
          onToggleCollapse={() => controller.toggleCollapsed()}
          onUndo={controller.undo}
          onRedo={controller.redo}
          onZoomIn={() => void flowActionsRef.current?.zoomIn()}
          onZoomOut={() => void flowActionsRef.current?.zoomOut()}
          onZoomReset={() => void flowActionsRef.current?.resetZoom()}
          onFit={() => void flowActionsRef.current?.fit()}
          onToggleFullscreen={() => void toggleFullscreen()}
          onSetLayout={controller.setLayout}
        />
        <div className="drawnix-board-area">
          <DetachedMindmapFlow
            controller={controller}
            onActionsReady={handleActionsReady}
          />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

function DrawnixViewComponent(props: NodeViewProps) {
  if (isPreviewEditor(props.editor)) {
    return <DrawnixPreviewPlaceholder node={props.node} />;
  }
  return <DrawnixInteractiveView {...props} />;
}

export const DrawnixView: React.FC<NodeViewProps> = React.memo(
  DrawnixViewComponent,
  (previous, next) =>
    previous.editor === next.editor && previous.node.eq(next.node),
);

DrawnixView.displayName = "DrawnixView";
