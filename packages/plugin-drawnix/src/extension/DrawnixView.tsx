import type { NodeViewProps } from "@kn/editor";
import { NodeViewWrapper } from "@kn/editor";
import { useResolvedTheme } from "@kn/ui";
import { ReactFlowProvider } from "@xyflow/react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
import { MindmapFlow, type MindmapFlowActions } from "./flow/MindmapFlow";
import { useDrawnixController } from "./hooks/useDrawnixController";
import { MindmapToolbar } from "./MindmapToolbar";
import "./style/index.css";

export function DrawnixView(props: NodeViewProps) {
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
          <ReactFlowProvider>
            <MindmapFlow
              controller={controller}
              onActionsReady={handleActionsReady}
            />
          </ReactFlowProvider>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
