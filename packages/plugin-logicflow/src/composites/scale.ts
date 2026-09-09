import type {
  JsonValue,
  LogicFlowEdgeData,
  LogicFlowNodeData,
  LogicFlowPoint,
  LogicFlowText,
  Page,
} from "../model/types";
import { buildContainerIndex } from "./graph-index";
import type { ContainerBounds } from "./types";

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function transformPoint(
  point: LogicFlowPoint,
  oldBounds: ContainerBounds,
  nextBounds: ContainerBounds,
): LogicFlowPoint {
  const scaleX = nextBounds.width / oldBounds.width;
  const scaleY = nextBounds.height / oldBounds.height;
  const oldLeft = oldBounds.x - oldBounds.width / 2;
  const oldTop = oldBounds.y - oldBounds.height / 2;
  const nextLeft = nextBounds.x - nextBounds.width / 2;
  const nextTop = nextBounds.y - nextBounds.height / 2;
  return {
    x: nextLeft + (point.x - oldLeft) * scaleX,
    y: nextTop + (point.y - oldTop) * scaleY,
  };
}

function scaleProperties(
  properties: Record<string, JsonValue> | undefined,
  scaleX: number,
  scaleY: number,
  scaleText: boolean,
): Record<string, JsonValue> {
  const next = { ...(properties ?? {}) };
  const width = number(next.width);
  const height = number(next.height);
  const r = number(next.r);
  const rx = number(next.rx);
  const ry = number(next.ry);
  if (width !== undefined) next.width = Math.max(8, width * Math.abs(scaleX));
  if (height !== undefined)
    next.height = Math.max(8, height * Math.abs(scaleY));
  if (r !== undefined)
    next.r = Math.max(4, (r * (Math.abs(scaleX) + Math.abs(scaleY))) / 2);
  if (rx !== undefined) next.rx = Math.max(4, rx * Math.abs(scaleX));
  if (ry !== undefined) next.ry = Math.max(4, ry * Math.abs(scaleY));
  if (scaleText) {
    const textScale = Math.max(0.25, (Math.abs(scaleX) + Math.abs(scaleY)) / 2);
    const fontSize = number(next.fontSize);
    if (fontSize !== undefined)
      next.fontSize = Math.max(6, fontSize * textScale);
    if (
      next.textStyle &&
      typeof next.textStyle === "object" &&
      !Array.isArray(next.textStyle)
    ) {
      const textStyle = { ...(next.textStyle as Record<string, JsonValue>) };
      const nestedFontSize = number(textStyle.fontSize);
      const lineHeight = number(textStyle.lineHeight);
      if (nestedFontSize !== undefined)
        textStyle.fontSize = Math.max(6, nestedFontSize * textScale);
      if (lineHeight !== undefined)
        textStyle.lineHeight = Math.max(7, lineHeight * textScale);
      next.textStyle = textStyle;
    }
  }
  return next;
}

function scaleTextPosition(
  text: string | LogicFlowText | undefined,
  oldBounds: ContainerBounds,
  nextBounds: ContainerBounds,
): string | LogicFlowText | undefined {
  if (!text || typeof text === "string") return text;
  if (typeof text.x !== "number" || typeof text.y !== "number") return text;
  return {
    ...text,
    ...transformPoint({ x: text.x, y: text.y }, oldBounds, nextBounds),
  };
}

function scaleNode(
  node: LogicFlowNodeData,
  oldBounds: ContainerBounds,
  nextBounds: ContainerBounds,
  scaleText: boolean,
): LogicFlowNodeData {
  const scaleX = nextBounds.width / oldBounds.width;
  const scaleY = nextBounds.height / oldBounds.height;
  const point = transformPoint(node, oldBounds, nextBounds);
  const width = number(node.width);
  const height = number(node.height);
  const r = number(node.r);
  const rx = number(node.rx);
  const ry = number(node.ry);
  return {
    ...node,
    ...point,
    ...(width !== undefined
      ? { width: Math.max(8, width * Math.abs(scaleX)) }
      : {}),
    ...(height !== undefined
      ? { height: Math.max(8, height * Math.abs(scaleY)) }
      : {}),
    ...(r !== undefined
      ? { r: Math.max(4, (r * (Math.abs(scaleX) + Math.abs(scaleY))) / 2) }
      : {}),
    ...(rx !== undefined ? { rx: Math.max(4, rx * Math.abs(scaleX)) } : {}),
    ...(ry !== undefined ? { ry: Math.max(4, ry * Math.abs(scaleY)) } : {}),
    text: scaleTextPosition(node.text, oldBounds, nextBounds),
    properties: scaleProperties(node.properties, scaleX, scaleY, scaleText),
  };
}

function scaleEdge(
  edge: LogicFlowEdgeData,
  oldBounds: ContainerBounds,
  nextBounds: ContainerBounds,
): LogicFlowEdgeData {
  return {
    ...edge,
    ...(edge.startPoint
      ? { startPoint: transformPoint(edge.startPoint, oldBounds, nextBounds) }
      : {}),
    ...(edge.endPoint
      ? { endPoint: transformPoint(edge.endPoint, oldBounds, nextBounds) }
      : {}),
    ...(edge.pointsList
      ? {
          pointsList: edge.pointsList.map((point) =>
            transformPoint(point, oldBounds, nextBounds),
          ),
        }
      : {}),
    text: scaleTextPosition(edge.text, oldBounds, nextBounds),
  };
}

export function resizeContainerSubtree(
  page: Page,
  rootId: string,
  next: Partial<ContainerBounds>,
): Page {
  const index = buildContainerIndex(page.graph);
  const instance = index.instanceForRoot(rootId);
  if (!instance || !instance.definition.capabilities.resizable) return page;
  const properties = instance.root.properties ?? {};
  const oldBounds: ContainerBounds = {
    x: instance.root.x,
    y: instance.root.y,
    width:
      number(instance.root.width) ??
      number(properties.width) ??
      instance.definition.defaultSize.width,
    height:
      number(instance.root.height) ??
      number(properties.height) ??
      instance.definition.defaultSize.height,
  };
  const nextBounds: ContainerBounds = {
    x: next.x ?? oldBounds.x,
    y: next.y ?? oldBounds.y,
    width: Math.max(
      instance.definition.minSize.width,
      next.width ?? oldBounds.width,
    ),
    height: Math.max(
      instance.definition.minSize.height,
      next.height ?? oldBounds.height,
    ),
  };
  const descendants = new Set(index.descendants(rootId).map((node) => node.id));
  const subtree = new Set([rootId, ...descendants]);
  return {
    ...page,
    graph: {
      nodes: page.graph.nodes.map((node) => {
        if (node.id === rootId) {
          return {
            ...node,
            ...nextBounds,
            properties: {
              ...(node.properties ?? {}),
              width: nextBounds.width,
              height: nextBounds.height,
            },
          };
        }
        return descendants.has(node.id)
          ? scaleNode(
              node,
              oldBounds,
              nextBounds,
              instance.definition.capabilities.scaleText,
            )
          : node;
      }),
      edges: page.graph.edges.map((edge) =>
        subtree.has(edge.sourceNodeId) && subtree.has(edge.targetNodeId)
          ? scaleEdge(edge, oldBounds, nextBounds)
          : edge,
      ),
    },
  };
}
