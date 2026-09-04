import {
  Background,
  BackgroundVariant,
  ReactFlow,
  useNodesState,
  useReactFlow,
  type Edge,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import React, { useCallback, useEffect, useMemo } from "react";
import type { DrawnixController } from "../hooks/useDrawnixController";
import type { MindmapDirection } from "../layout/tree-layout";
import { MindmapNode, type MindmapFlowNode } from "./MindmapNode";

export interface MindmapFlowActions {
  zoomIn: () => Promise<void>;
  zoomOut: () => Promise<void>;
  resetZoom: () => Promise<void>;
  fit: () => Promise<void>;
}

interface MindmapFlowProps {
  controller: DrawnixController;
  onActionsReady: (actions: MindmapFlowActions) => void;
}

const nodeTypes = { mindmap: MindmapNode };

function edgeHandles(direction: MindmapDirection) {
  if (direction === "left")
    return { sourceHandle: "source-left", targetHandle: "target-right" };
  if (direction === "up")
    return { sourceHandle: "source-top", targetHandle: "target-bottom" };
  if (direction === "down")
    return { sourceHandle: "source-bottom", targetHandle: "target-top" };
  return { sourceHandle: "source-right", targetHandle: "target-left" };
}

export function MindmapFlow({ controller, onActionsReady }: MindmapFlowProps) {
  const flow = useReactFlow<MindmapFlowNode>();

  const projectedNodes = useMemo<MindmapFlowNode[]>(
    () =>
      controller.layoutResult.nodes.map((item) => ({
        id: item.id,
        type: "mindmap",
        position: item.position,
        width: item.width,
        height: item.height,
        style: { width: item.width, height: item.height },
        selected: item.id === controller.selectedId,
        draggable: controller.isEditable && !item.isRoot,
        selectable: true,
        data: {
          semanticNode: item.node,
          direction: item.direction,
          isRoot: item.isRoot,
          isEditable: controller.isEditable,
          isEditing: item.id === controller.editingId,
          draftText:
            item.id === controller.editingId
              ? controller.draftText
              : item.node.text,
          onDraftTextChange: controller.setDraftText,
          onStartEdit: controller.startEditing,
          onCommitEdit: controller.commitEditing,
          onCancelEdit: controller.cancelEditing,
          onToggleCollapsed: controller.toggleCollapsed,
        },
      })),
    [
      controller.cancelEditing,
      controller.commitEditing,
      controller.draftText,
      controller.editingId,
      controller.isEditable,
      controller.layoutResult.nodes,
      controller.selectedId,
      controller.setDraftText,
      controller.startEditing,
      controller.toggleCollapsed,
    ],
  );
  const [nodes, setNodes, onNodesChange] =
    useNodesState<MindmapFlowNode>(projectedNodes);

  useEffect(() => {
    setNodes(projectedNodes);
  }, [projectedNodes, setNodes]);

  const edges = useMemo<Edge[]>(
    () =>
      controller.layoutResult.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "smoothstep",
        ...edgeHandles(edge.direction),
        className: "drawnix-edge",
      })),
    [controller.layoutResult.edges],
  );

  const persistInstanceViewport = useCallback(
    (instance: ReactFlowInstance<MindmapFlowNode, Edge>) => {
      controller.persistViewport(instance.getViewport());
    },
    [controller],
  );

  useEffect(() => {
    const runViewportAction = async (action: () => Promise<boolean>) => {
      await action();
      persistInstanceViewport(flow);
    };
    onActionsReady({
      zoomIn: () => runViewportAction(() => flow.zoomIn({ duration: 160 })),
      zoomOut: () => runViewportAction(() => flow.zoomOut({ duration: 160 })),
      resetZoom: () =>
        runViewportAction(() => flow.zoomTo(1, { duration: 160 })),
      fit: () =>
        runViewportAction(() => flow.fitView({ padding: 0.22, duration: 220 })),
    });
  }, [flow, onActionsReady, persistInstanceViewport]);

  return (
    <ReactFlow<MindmapFlowNode>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      viewport={controller.document.viewport ? controller.viewport : undefined}
      fitView={!controller.document.viewport}
      fitViewOptions={{ padding: 0.22 }}
      minZoom={0.2}
      maxZoom={2.5}
      nodesConnectable={false}
      elementsSelectable
      panOnDrag
      zoomOnPinch
      zoomOnScroll
      zoomOnDoubleClick={false}
      preventScrolling
      onViewportChange={controller.updateViewport}
      onMoveEnd={(_, viewport: Viewport) =>
        controller.persistViewport(viewport)
      }
      onNodeClick={(_, node) => controller.setSelectedId(node.id)}
      onNodeDoubleClick={(_, node) => controller.startEditing(node.id)}
      onNodeDragStop={(_, node) =>
        controller.commitNodePosition(node.id, node.position)
      }
      onPaneClick={() => controller.setSelectedId(controller.document.root.id)}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
    </ReactFlow>
  );
}
