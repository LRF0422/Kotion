import LogicFlow, { h, RectNodeModel } from "@logicflow/core";
import {
  DynamicGroupNode,
  DynamicGroupNodeModel,
  type PoolElements,
} from "@logicflow/extension";
import type { JsonValue, LogicFlowNodeData } from "../model/types";
import {
  canonicalizeShapeThemeColor,
  resolveShapeThemeColor,
} from "../shapes/shape-registry";
import { createContainer } from "./factory";
import { buildContainerIndex } from "./graph-index";
import {
  getContainerChildren,
  getContainerMetadata,
  getContainerParent,
  withContainerMetadata,
} from "./metadata";
import { containerRegistry } from "./registry";
import { resolveContainerZone } from "./helpers";
import type { ContainerBounds, ContainerDefinition } from "./types";

interface VisualStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  text: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finiteDimension(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function visualStyle(model: RectNodeModel): VisualStyle {
  const properties = record(model.properties);
  const nested = record(properties.style);
  const dark = model.graphModel.themeMode === "dark";
  const color = (key: "fill" | "stroke" | "textColor", fallback: string) => {
    const themeKey = key === "textColor" ? "text" : key;
    const value = nested[key] ?? properties[key];
    return (
      resolveShapeThemeColor(
        model.type,
        themeKey,
        typeof value === "string" ? value : undefined,
        dark,
      ) ?? (typeof value === "string" ? value : fallback)
    );
  };
  const strokeWidth = nested.strokeWidth ?? properties.strokeWidth;
  return {
    fill: color("fill", "hsl(var(--card))"),
    stroke: color("stroke", "hsl(var(--border))"),
    strokeWidth:
      typeof strokeWidth === "number" && Number.isFinite(strokeWidth)
        ? strokeWidth
        : 2,
    text: color("textColor", "hsl(var(--card-foreground))"),
  };
}

function rootBounds(
  model: RectNodeModel,
  definition: ContainerDefinition,
): ContainerBounds {
  return {
    x: model.x,
    y: model.y,
    width: finiteDimension(model.width, definition.defaultSize.width),
    height: finiteDimension(model.height, definition.defaultSize.height),
  };
}

function createContainerModel(definition: ContainerDefinition) {
  return class ContainerRootModel extends DynamicGroupNodeModel {
    initNodeData(data: LogicFlow.NodeConfig) {
      super.initNodeData(data);
      const properties = record(this.properties);
      this.width = Math.max(
        definition.minSize.width,
        finiteDimension(properties.width, definition.defaultSize.width),
      );
      this.height = Math.max(
        definition.minSize.height,
        finiteDimension(properties.height, definition.defaultSize.height),
      );
      this.radius = 2;
      this.collapsible = false;
      this.isCollapsed = false;
      this.isRestrict = false;
      this.autoResize = false;
      this.transformWithContainer = false;
      this.resizable = definition.capabilities.resizable;
      this.rotatable = definition.capabilities.rotatable;
      this.autoToFront = false;
      this.text.editable = false;
    }

    setAttributes() {
      super.setAttributes();
      const properties = record(this.properties);
      this.width = Math.max(
        definition.minSize.width,
        finiteDimension(properties.width, this.width),
      );
      this.height = Math.max(
        definition.minSize.height,
        finiteDimension(properties.height, this.height),
      );
      this.radius = 2;
    }

    isAllowAppendIn(nodeData: LogicFlow.NodeData): boolean {
      if (
        nodeData.id === this.id ||
        containerRegistry.getByRootType(nodeData.type)
      ) {
        return false;
      }
      const zone = resolveContainerZone(
        definition,
        this.getData() as unknown as LogicFlowNodeData,
        nodeData,
      );
      return Boolean(
        zone &&
        definition.accepts(nodeData as unknown as LogicFlowNodeData, zone),
      );
    }

    getNodeStyle() {
      const style = visualStyle(this);
      return {
        ...super.getNodeStyle(),
        fill: style.fill,
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
      };
    }
  };
}

function createContainerView(definition: ContainerDefinition) {
  return class ContainerRootView extends DynamicGroupNode {
    getText() {
      return null;
    }

    getOperateIcon() {
      return null;
    }

    getShape() {
      const model = this.props.model as DynamicGroupNodeModel;
      const style = visualStyle(model);
      const bounds = rootBounds(model, definition);
      const zones = definition.zones(bounds);
      const left = bounds.x - bounds.width / 2;
      const top = bounds.y - bounds.height / 2;
      return h(
        "g",
        { className: `lf-container lf-container-${definition.id}` },
        h("rect", {
          x: left,
          y: top,
          width: bounds.width,
          height: bounds.height,
          rx: model.radius,
          fill: style.fill,
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
        }),
        ...zones.slice(1).map((zone) =>
          h("line", {
            x1: left,
            y1: zone.y - zone.height / 2,
            x2: left + bounds.width,
            y2: zone.y - zone.height / 2,
            stroke: style.stroke,
            strokeWidth: style.strokeWidth,
            pointerEvents: "none",
          }),
        ),
      );
    }
  };
}

export function registerContainers(lf: LogicFlow): void {
  for (const definition of containerRegistry.getAll()) {
    lf.register(definition.rootType, () => ({
      model: createContainerModel(definition),
      view: createContainerView(definition),
    }));
  }
}

export function materializeContainerAfterAdd(
  lf: LogicFlow,
  node: LogicFlow.NodeData,
): boolean {
  const definition = containerRegistry.getByRootType(node.type);
  if (!definition) return false;
  const model = lf.getNodeModelById(node.id);
  if (!(model instanceof DynamicGroupNodeModel)) return false;
  const metadata = getContainerMetadata(node as unknown as LogicFlowNodeData);
  if (metadata) {
    for (const childId of getContainerChildren(
      node as unknown as LogicFlowNodeData,
    )) {
      if (lf.getNodeModelById(childId) && !model.children.has(childId)) {
        model.addChild(childId);
      }
    }
    return false;
  }
  const existingIds = new Set(lf.graphModel.nodes.map((item) => item.id));
  const materialized = createContainer(definition, {
    id: node.id,
    x: node.x,
    y: node.y,
    width: model.width,
    height: model.height,
    properties: node.properties as LogicFlowNodeData["properties"],
    usedIds: existingIds,
  });
  for (const child of materialized.children) {
    lf.addNode(child as LogicFlow.NodeConfig);
    model.addChild(child.id);
  }
  model.setProperties({ ...model.properties, ...materialized.root.properties });
  return true;
}

function scaleProperties(
  properties: Record<string, unknown>,
  scaleX: number,
  scaleY: number,
  scaleText: boolean,
) {
  const next = { ...properties };
  const average = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
  const scale = (key: string, factor: number, min: number) => {
    const value = next[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      next[key] = Math.max(min, value * factor);
    }
  };
  scale("width", Math.abs(scaleX), 8);
  scale("height", Math.abs(scaleY), 8);
  scale("r", average, 4);
  scale("rx", Math.abs(scaleX), 4);
  scale("ry", Math.abs(scaleY), 4);
  if (scaleText) {
    scale("fontSize", average, 6);
    const textStyle = record(next.textStyle);
    if (Object.keys(textStyle).length) {
      const nested = { ...textStyle };
      for (const key of ["fontSize", "lineHeight"]) {
        const value = nested[key];
        if (typeof value === "number" && Number.isFinite(value)) {
          nested[key] = Math.max(6, value * average);
        }
      }
      next.textStyle = nested;
    }
  }
  return next;
}

function transformCoordinate(
  value: number,
  oldStart: number,
  oldSize: number,
  nextStart: number,
  nextSize: number,
): number {
  return nextStart + ((value - oldStart) / oldSize) * nextSize;
}

function scaleContainerModels(
  lf: LogicFlow,
  root: DynamicGroupNodeModel,
  definition: ContainerDefinition,
  previous: LogicFlow.NodeData,
): void {
  if (!definition.capabilities.scaleChildren) return;
  const oldWidth = finiteDimension(previous.width, root.width);
  const oldHeight = finiteDimension(previous.height, root.height);
  const oldLeft = previous.x - oldWidth / 2;
  const oldTop = previous.y - oldHeight / 2;
  const nextLeft = root.x - root.width / 2;
  const nextTop = root.y - root.height / 2;
  const scaleX = root.width / oldWidth;
  const scaleY = root.height / oldHeight;
  for (const childId of root.children) {
    const child = lf.getNodeModelById(childId);
    if (!child) continue;
    const data = child.getData();
    const nextX = transformCoordinate(
      data.x,
      oldLeft,
      oldWidth,
      nextLeft,
      root.width,
    );
    const nextY = transformCoordinate(
      data.y,
      oldTop,
      oldHeight,
      nextTop,
      root.height,
    );
    const textX =
      data.text &&
      typeof data.text === "object" &&
      typeof data.text.x === "number"
        ? nextX + (data.text.x - data.x) * scaleX
        : nextX;
    const textY =
      data.text &&
      typeof data.text === "object" &&
      typeof data.text.y === "number"
        ? nextY + (data.text.y - data.y) * scaleY
        : nextY;
    const attributes: Record<string, unknown> = {
      properties: scaleProperties(
        record(data.properties),
        scaleX,
        scaleY,
        definition.capabilities.scaleText,
      ),
    };
    for (const [key, factor, min] of [
      ["width", Math.abs(scaleX), 8],
      ["height", Math.abs(scaleY), 8],
      ["r", (Math.abs(scaleX) + Math.abs(scaleY)) / 2, 4],
      ["rx", Math.abs(scaleX), 4],
      ["ry", Math.abs(scaleY), 4],
    ] as const) {
      const value = data[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        attributes[key] = Math.max(min, value * factor);
      }
    }
    child.moveTo(nextX, nextY, true);
    lf.graphModel.updateAttributes(childId, attributes);
    if (child.text) {
      child.text = { ...child.text, x: textX, y: textY };
    }
  }
}

export function installContainerRuntime(lf: LogicFlow): () => void {
  const pool = lf.extension.PoolElements as
    | (PoolElements & {
        checkGroupBoundsWithChildren: (
          model: DynamicGroupNodeModel,
          deltaX: number,
          deltaY: number,
          width: number,
          height: number,
        ) => boolean;
      })
    | undefined;
  let restoreCheck: (() => void) | undefined;
  if (pool) {
    const original = pool.checkGroupBoundsWithChildren.bind(pool);
    pool.checkGroupBoundsWithChildren = (model, ...args) => {
      const definition = containerRegistry.getByRootType(model.type);
      return definition?.capabilities.scaleChildren
        ? true
        : original(model, ...args);
    };
    restoreCheck = () => {
      pool.checkGroupBoundsWithChildren = original;
    };
  }

  const updateZone = (childId: string) => {
    const child = lf.getNodeModelById(childId);
    if (!child) return;
    const parentId = getContainerParent(
      child.getData() as unknown as LogicFlowNodeData,
    );
    if (!parentId) return;
    const root = lf.getNodeModelById(parentId);
    if (!(root instanceof DynamicGroupNodeModel)) return;
    const definition = containerRegistry.getByRootType(root.type);
    if (!definition) return;
    const zone = resolveContainerZone(
      definition,
      root.getData() as unknown as LogicFlowNodeData,
      child.getData() as unknown as LogicFlowNodeData,
    );
    if (
      !zone ||
      !definition.accepts(child.getData() as unknown as LogicFlowNodeData, zone)
    ) {
      root.removeChild(childId);
      child.deleteProperty("parent");
      child.deleteProperty("containerZone");
      return;
    }
    child.setProperty("parent", parentId);
    child.setProperty("containerZone", zone.id);
  };

  const onGroupAdd = ({
    data,
    childId,
  }: {
    data: LogicFlow.NodeData;
    childId: string;
  }) => {
    if (!containerRegistry.getByRootType(data.type)) return;
    updateZone(childId);
  };
  const onGroupRemove = ({ childId }: { childId: string }) => {
    const child = lf.getNodeModelById(childId);
    child?.deleteProperty("parent");
    child?.deleteProperty("containerZone");
  };
  const onNodeDrop = ({ data }: { data: LogicFlow.NodeData }) =>
    updateZone(data.id);
  const onNodeResize = ({ model, preData }: any) => {
    if (!(model instanceof DynamicGroupNodeModel)) return;
    const definition = containerRegistry.getByRootType(model.type);
    if (definition) scaleContainerModels(lf, model, definition, preData);
  };

  lf.on("group:add-node", onGroupAdd);
  lf.on("group:remove-node", onGroupRemove);
  lf.on("node:drop", onNodeDrop);
  lf.on("node:resize", onNodeResize);
  return () => {
    restoreCheck?.();
    lf.off("group:add-node", onGroupAdd);
    lf.off("group:remove-node", onGroupRemove);
    lf.off("node:drop", onNodeDrop);
    lf.off("node:resize", onNodeResize);
  };
}

export function canonicalizeContainerNode(
  node: LogicFlowNodeData,
): LogicFlowNodeData {
  const definition = containerRegistry.getByRootType(node.type);
  if (!definition && !getContainerMetadata(node)) return node;
  const { children: _children, ...canonical } = node;
  return canonical;
}

export function canonicalizeContainerThemeColor(
  type: string,
  key: "fill" | "stroke" | "text" | "accent",
  value: unknown,
): string | undefined {
  return canonicalizeShapeThemeColor(type, key, value);
}
