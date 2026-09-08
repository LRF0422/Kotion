import React from "react";
import type { LogicFlowCanvasHandle } from "../canvas/LogicFlowCanvas";
import type {
  Page,
  LogicFlowEdgeData,
  LogicFlowNodeData,
} from "../model/types";

export interface DiagramPresenceView {
  clientId: number;
  pageId?: string;
  user: { name?: string; color?: string; avatar?: string };
  cursor?: { x: number; y: number } | null;
  selectedIds: string[];
}

function size(
  node: LogicFlowNodeData,
  key: "width" | "height",
  fallback: number,
) {
  const direct = node[key];
  if (typeof direct === "number") return direct;
  const property = node.properties?.[key];
  return typeof property === "number" ? property : fallback;
}

function edgeCenter(edge: LogicFlowEdgeData, document: Page) {
  const points = edge.pointsList;
  if (points?.length) return points[Math.floor(points.length / 2)];
  const source = document.graph.nodes.find(
    (node) => node.id === edge.sourceNodeId,
  );
  const target = document.graph.nodes.find(
    (node) => node.id === edge.targetNodeId,
  );
  if (!source || !target) return null;
  return { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };
}

export function CollaborationOverlay({
  canvas,
  document,
  presences,
}: {
  canvas: LogicFlowCanvasHandle | null;
  document: Page;
  presences: DiagramPresenceView[];
  revision?: number;
}) {
  if (!canvas) return null;
  const nodes = new Map(document.graph.nodes.map((node) => [node.id, node]));
  const edges = new Map(document.graph.edges.map((edge) => [edge.id, edge]));
  return (
    <div className="logicflow-collaboration-overlay" aria-hidden="true">
      {presences.flatMap((presence) => {
        const color = presence.user.color || "#3b82f6";
        const name = presence.user.name || "Anonymous";
        const elements: React.ReactNode[] = [];
        if (presence.cursor) {
          const point = canvas.graphPointToHtml(presence.cursor);
          elements.push(
            <div
              key={`cursor-${presence.clientId}`}
              className="logicflow-remote-cursor"
              style={{
                color,
                transform: `translate(${point.x}px, ${point.y}px)`,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 1.5L13.5 7.5L8.5 8.8L6.2 13.8L2 1.5Z"
                  fill="currentColor"
                  stroke="white"
                  strokeWidth="1"
                />
              </svg>
              <span style={{ backgroundColor: color }}>{name}</span>
            </div>,
          );
        }
        for (const id of presence.selectedIds) {
          const node = nodes.get(id);
          if (node) {
            const topLeft = canvas.graphPointToHtml({
              x: node.x - size(node, "width", 100) / 2,
              y: node.y - size(node, "height", 60) / 2,
            });
            const bottomRight = canvas.graphPointToHtml({
              x: node.x + size(node, "width", 100) / 2,
              y: node.y + size(node, "height", 60) / 2,
            });
            elements.push(
              <div
                key={`node-${presence.clientId}-${id}`}
                className="logicflow-remote-selection"
                style={{
                  left: topLeft.x,
                  top: topLeft.y,
                  width: Math.max(1, bottomRight.x - topLeft.x),
                  height: Math.max(1, bottomRight.y - topLeft.y),
                  borderColor: color,
                }}
              />,
            );
            continue;
          }
          const edge = edges.get(id);
          const center = edge ? edgeCenter(edge, document) : null;
          if (center) {
            const point = canvas.graphPointToHtml(center);
            elements.push(
              <span
                key={`edge-${presence.clientId}-${id}`}
                className="logicflow-remote-edge-selection"
                style={{ left: point.x, top: point.y, backgroundColor: color }}
              />,
            );
          }
        }
        return elements;
      })}
    </div>
  );
}
