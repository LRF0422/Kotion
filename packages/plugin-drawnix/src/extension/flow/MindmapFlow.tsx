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
import { createThemeAwareColor } from "@kn/ui";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import type { DrawnixController } from "../hooks/useDrawnixController";
import type { MindmapDirection } from "../layout/tree-layout";
import type { MindmapNodeStyle } from "../model/types";
import {
  assignMindmapBranchColors,
  type MindmapBranchColorAssignment,
} from "./branch-colors";
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

type MindmapVisualStyle = React.CSSProperties & {
  "--drawnix-branch-color-light"?: string;
  "--drawnix-branch-color-dark"?: string;
  "--drawnix-node-font-size"?: string;
  "--drawnix-node-line-height"?: string;
  "--drawnix-node-text-color-light"?: string;
  "--drawnix-node-text-color-dark"?: string;
  "--drawnix-node-border-color-light"?: string;
  "--drawnix-node-border-color-dark"?: string;
  "--drawnix-node-background-color-light"?: string;
  "--drawnix-node-background-color-dark"?: string;
};

function branchStyle(
  assignment: MindmapBranchColorAssignment,
): MindmapVisualStyle {
  return {
    "--drawnix-branch-color-light": assignment.light,
    "--drawnix-branch-color-dark": assignment.dark,
  };
}

function nodeVisualStyle(
  style: MindmapNodeStyle | undefined,
  fontSize: number,
  lineHeight: number,
  assignment: MindmapBranchColorAssignment | undefined,
): MindmapVisualStyle {
  const result: MindmapVisualStyle = {
    "--drawnix-node-font-size": `${fontSize}px`,
    "--drawnix-node-line-height": `${lineHeight}px`,
    ...(assignment ? branchStyle(assignment) : {}),
  };
  if (style?.textColor) {
    const color = createThemeAwareColor(style.textColor);
    result["--drawnix-node-text-color-light"] = color.light;
    result["--drawnix-node-text-color-dark"] = color.dark;
  }
  if (style?.borderColor) {
    const color = createThemeAwareColor(style.borderColor);
    result["--drawnix-node-border-color-light"] = color.light;
    result["--drawnix-node-border-color-dark"] = color.dark;
  }
  if (style?.backgroundColor) {
    const color = createThemeAwareColor(style.backgroundColor);
    result["--drawnix-node-background-color-light"] = color.light;
    result["--drawnix-node-background-color-dark"] = color.dark;
  }
  return result;
}

export function MindmapFlow({ controller, onActionsReady }: MindmapFlowProps) {
  const flow = useReactFlow<MindmapFlowNode>();
  const fitViewOnInitRef = useRef(!controller.document.viewport);
  const isViewportInteractionRef = useRef(false);
  const branchAssignmentsRef = useRef(
    new Map<string, MindmapBranchColorAssignment>(),
  );
  const branchAssignments = useMemo(
    () =>
      assignMindmapBranchColors(
        controller.document.root.children.map((child) => child.id),
        branchAssignmentsRef.current,
      ),
    [controller.document.root.children],
  );

  useEffect(() => {
    branchAssignmentsRef.current = branchAssignments;
  }, [branchAssignments]);

  const projectedNodes = useMemo<MindmapFlowNode[]>(
    () =>
      controller.layoutResult.nodes.map((item) => {
        const assignment = item.branchId
          ? branchAssignments.get(item.branchId)
          : undefined;
        return {
          id: item.id,
          type: "mindmap",
          position: item.position,
          width: item.width,
          height: item.height,
          style: {
            width: item.width,
            height: item.height,
            ...nodeVisualStyle(
              item.node.style,
              item.fontSize,
              item.lineHeight,
              assignment,
            ),
          },
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
            onPreviewStyle: controller.previewNodeStyle,
            onCommitStylePreview: controller.commitNodeStylePreview,
            onSetStyle: controller.setNodeStyle,
            onUpdateHref: controller.updateNodeHref,
            onToggleCollapsed: controller.toggleCollapsed,
          },
        };
      }),
    [
      branchAssignments,
      controller.cancelEditing,
      controller.commitEditing,
      controller.commitNodeStylePreview,
      controller.draftText,
      controller.editingId,
      controller.isEditable,
      controller.layoutResult.nodes,
      controller.previewNodeStyle,
      controller.selectedId,
      controller.setDraftText,
      controller.setNodeStyle,
      controller.startEditing,
      controller.updateNodeHref,
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
      controller.layoutResult.edges.map((edge) => {
        const assignment = branchAssignments.get(edge.branchId);
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: "smoothstep",
          ...edgeHandles(edge.direction),
          className: "drawnix-edge",
          style: assignment ? branchStyle(assignment) : undefined,
        };
      }),
    [branchAssignments, controller.layoutResult.edges],
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
      defaultViewport={controller.viewport}
      fitView={fitViewOnInitRef.current}
      fitViewOptions={{ padding: 0.22 }}
      minZoom={0.2}
      maxZoom={2.5}
      deleteKeyCode={null}
      selectionKeyCode={null}
      multiSelectionKeyCode={null}
      panActivationKeyCode={null}
      zoomActivationKeyCode={null}
      disableKeyboardA11y
      nodesFocusable={false}
      edgesFocusable={false}
      nodesConnectable={false}
      autoPanOnNodeFocus={false}
      elementsSelectable
      panOnDrag
      zoomOnPinch
      zoomOnScroll
      zoomOnDoubleClick={false}
      preventScrolling
      onMoveStart={(event) => {
        isViewportInteractionRef.current =
          event instanceof MouseEvent || event instanceof TouchEvent;
      }}
      onMoveEnd={(_, viewport: Viewport) => {
        if (isViewportInteractionRef.current) {
          controller.persistViewport(viewport);
        }
        isViewportInteractionRef.current = false;
      }}
      onNodeClick={(_, node) => controller.selectNode(node.id)}
      onNodeDoubleClick={(_, node) => controller.startEditing(node.id)}
      onNodeDragStop={(_, node) =>
        controller.commitNodePosition(node.id, node.position)
      }
      onPaneClick={() => controller.selectNode(controller.document.root.id)}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
    </ReactFlow>
  );
}
