import LogicFlow from "@logicflow/core";
import {
  BpmnElement,
  MiniMap,
  PoolElements,
  SelectionSelect,
  Snapshot,
} from "@logicflow/extension";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { normalizeLogicFlowData } from "../model/normalize";
import { stableStringify } from "../model/stable-stringify";
import {
  buildContainerIndex,
  containerRegistry,
  getContainerChildren,
  getContainerMetadata,
  getContainerParent,
} from "../composites";
import {
  canonicalizeContainerNode,
  installContainerRuntime,
  materializeContainerAfterAdd,
} from "../composites/runtime";
import type {
  LogicFlowEdgeData,
  LogicFlowGraphData,
  LogicFlowNodeData,
  Page,
} from "../model/types";
import {
  canonicalizeShapeThemeColor,
  getShapeDefinition,
  registerCustomShapes,
  resolveShapeThemeColor,
  type ShapeDefinition,
  type ShapeThemeColorKey,
} from "../shapes";
import "@logicflow/core/dist/index.css";
import "@logicflow/extension/lib/style/index.css";

const MUTATION_EVENTS = [
  "node:add",
  "node:dnd-add",
  "group:add-node",
  "group:remove-node",
  "node:delete",
  "node:drag",
  "node:drop",
  "node:resize",
  "node:rotate",
  "node:properties-change",
  "node:properties-delete",
  "edge:add",
  "edge:delete",
  "edge:adjust",
  "edge:exchange-node",
  "adjustPoint:drag",
  "text:update",
  "text:clear",
  "selection:drag",
  "selection:drop",
] as const;

const SELECTION_EVENTS = [
  "element:click",
  "blank:click",
  "selection:drop",
  "node:delete",
  "edge:delete",
] as const;

export interface LogicFlowCanvasHandle {
  getInstance(): LogicFlow | null;
  getGraph(): LogicFlowGraphData;
  render(document: Page): void;
  startDrag(shape: ShapeDefinition): void;
  addShape(shape: ShapeDefinition): void;
  deleteSelected(): void;
  select(ids: readonly string[]): void;
  updateText(id: string, value: string): void;
  setProperties(id: string, properties: Record<string, unknown>): void;
  setToolMode(mode: "select" | "pan" | "connector"): void;
  getViewport(): { scale: number; x: number; y: number } | null;
  setViewport(viewport: { scale: number; x: number; y: number }): void;
  fitView(): void;
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  focusOn(id: string): void;
  graphPointToHtml(point: { x: number; y: number }): { x: number; y: number };
  exportBlob(type: "png" | "svg", backgroundColor?: string): Promise<Blob>;
}

interface LogicFlowCanvasProps {
  document: Page;
  readOnly: boolean;
  dark: boolean;
  showMiniMap?: boolean;
  className?: string;
  onGraphChange?: (document: Page) => void;
  onSelectionChange?: (ids: string[]) => void;
  onPointerMove?: (point: { x: number; y: number } | null) => void;
  onReady?: (instance: LogicFlow) => void;
}

const THEME_COLOR_PROPERTIES = [
  ["fill", "fill"],
  ["stroke", "stroke"],
  ["textColor", "text"],
  ["accentColor", "accent"],
] as const satisfies ReadonlyArray<readonly [string, ShapeThemeColorKey]>;

function themedNodeProperties(
  type: string,
  source: Record<string, unknown> | undefined,
  dark: boolean,
  canonical = false,
): Record<string, unknown> {
  if (!getShapeDefinition(type)) return { ...(source ?? {}) };
  const properties = { ...(source ?? {}) };
  const sourceStyle =
    properties.style && typeof properties.style === "object"
      ? (properties.style as Record<string, unknown>)
      : {};
  const style = { ...sourceStyle };

  for (const [propertyKey, themeKey] of THEME_COLOR_PROPERTIES) {
    const resolve = canonical
      ? canonicalizeShapeThemeColor(type, themeKey, properties[propertyKey])
      : resolveShapeThemeColor(type, themeKey, properties[propertyKey], dark);
    if (resolve) properties[propertyKey] = resolve;

    if (propertyKey === "fill" || propertyKey === "stroke") {
      const styled = canonical
        ? canonicalizeShapeThemeColor(
            type,
            themeKey,
            style[propertyKey] ?? properties[propertyKey],
          )
        : resolveShapeThemeColor(
            type,
            themeKey,
            style[propertyKey] ?? properties[propertyKey],
            dark,
          );
      if (styled) style[propertyKey] = styled;
    }
  }
  properties.style = style;
  return properties;
}

function applyShapeThemeDefaults(lf: LogicFlow, dark: boolean): void {
  for (const model of lf.graphModel.nodes) {
    const current = model.properties as Record<string, unknown>;
    const next = themedNodeProperties(model.type, current, dark);
    if (stableStringify(current) !== stableStringify(next)) {
      model.setProperties(next);
    }
  }
}

function graphFromInstance(lf: LogicFlow): LogicFlowGraphData {
  const raw = lf.getGraphRawData();
  const graph = normalizeLogicFlowData(raw).document.pages[0].graph;
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const canonical = canonicalizeContainerNode(node);
      return {
        ...canonical,
        properties: themedNodeProperties(
          canonical.type,
          canonical.properties as Record<string, unknown> | undefined,
          false,
          true,
        ) as LogicFlowNodeData["properties"],
      };
    }),
  };
}

function applyLayerState(lf: LogicFlow, page: Page, readOnly: boolean): void {
  const containerIndex = buildContainerIndex(page.graph);
  const elements = new Map<string, LogicFlowNodeData | LogicFlowEdgeData>([
    ...page.graph.nodes.map((node) => [node.id, node] as const),
    ...page.graph.edges.map((edge) => [edge.id, edge] as const),
  ]);
  let zIndex = 0;
  for (const layer of page.layers) {
    for (const id of layer.elementIds) {
      const model = lf.graphModel.getElement(id);
      const element = elements.get(id);
      if (!model || !element) continue;
      const root = containerIndex.instanceForRoot(id);
      const locked =
        readOnly || layer.locked || element.properties?.locked === true;
      model.visible = layer.visible;
      Object.assign(model, {
        draggable: !locked,
        resizable: !locked && (root?.definition.capabilities.resizable ?? true),
        rotatable: !locked && (root?.definition.capabilities.rotatable ?? true),
        isHitable: layer.visible,
      });
      if (model.text) model.text.editable = !locked;
      lf.graphModel.setElementZIndex(id, zIndex++);
    }
  }
}

function elementText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in value)
    return String((value as { value?: unknown }).value ?? "");
  return "";
}

function shapeSizeConfig(
  shape: ShapeDefinition,
  dark: boolean,
): Partial<LogicFlow.NodeConfig> {
  const width = shape.width;
  const height = shape.height;
  const visual = dark ? shape.defaultStyle.dark : shape.defaultStyle.light;
  const properties: Record<string, unknown> = {
    ...(shape.defaultProperties ?? {}),
    fill: visual.fill,
    stroke: visual.stroke,
    textColor: visual.text,
    accentColor: visual.accent,
    strokeWidth: shape.defaultStyle.strokeWidth,
    style: {
      fill: visual.fill,
      stroke: visual.stroke,
      strokeWidth: shape.defaultStyle.strokeWidth,
    },
  };
  if (shape.type === "circle") {
    const r = Math.max(width ?? 80, height ?? 80) / 2;
    return {
      r,
      properties: { ...properties, r, width: r * 2, height: r * 2 },
    };
  }
  if (shape.type === "ellipse" || shape.type === "diamond") {
    const rx = (width ?? 100) / 2;
    const ry = (height ?? 60) / 2;
    return {
      rx,
      ry,
      properties: { ...properties, rx, ry, width: rx * 2, height: ry * 2 },
    };
  }
  return {
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    properties: {
      ...properties,
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
    },
  };
}

function updateElementAttributes(
  lf: LogicFlow,
  id: string,
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
  node: boolean,
): void {
  const attributes = { ...next };
  if (
    node &&
    (next.type === "circle" ||
      next.type === "ellipse" ||
      next.type === "diamond")
  ) {
    const properties =
      next.properties &&
      typeof next.properties === "object" &&
      !Array.isArray(next.properties)
        ? { ...(next.properties as Record<string, unknown>) }
        : {};
    const width =
      typeof next.width === "number"
        ? next.width
        : typeof properties.width === "number"
          ? properties.width
          : undefined;
    const height =
      typeof next.height === "number"
        ? next.height
        : typeof properties.height === "number"
          ? properties.height
          : undefined;

    delete attributes.width;
    delete attributes.height;

    if (next.type === "circle") {
      const explicitRadius =
        typeof properties.r === "number"
          ? properties.r
          : typeof next.r === "number"
            ? next.r
            : undefined;
      const radius =
        explicitRadius ??
        (width !== undefined || height !== undefined
          ? Math.max(width ?? 0, height ?? 0) / 2
          : undefined);
      if (radius !== undefined) {
        attributes.r = radius;
        attributes.properties = {
          ...properties,
          r: radius,
          width: radius * 2,
          height: radius * 2,
        };
      }
    } else {
      const rx =
        typeof properties.rx === "number"
          ? properties.rx
          : typeof next.rx === "number"
            ? next.rx
            : width !== undefined
              ? width / 2
              : undefined;
      const ry =
        typeof properties.ry === "number"
          ? properties.ry
          : typeof next.ry === "number"
            ? next.ry
            : height !== undefined
              ? height / 2
              : undefined;
      if (rx !== undefined) attributes.rx = rx;
      if (ry !== undefined) attributes.ry = ry;
      if (rx !== undefined || ry !== undefined) {
        attributes.properties = {
          ...properties,
          ...(rx !== undefined ? { rx, width: rx * 2 } : {}),
          ...(ry !== undefined ? { ry, height: ry * 2 } : {}),
        };
      }
    }
  }
  if (
    node &&
    typeof next.x === "number" &&
    typeof next.y === "number" &&
    (previous.x !== next.x || previous.y !== next.y)
  ) {
    lf.graphModel.moveNode2Coordinate(id, next.x, next.y, true);
    delete attributes.x;
    delete attributes.y;
  }
  if (elementText(previous.text) !== elementText(next.text))
    lf.updateText(id, elementText(next.text));
  delete attributes.text;
  lf.graphModel.updateAttributes(id, attributes);
}

function sameStringArray(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function applyGraphIncrementally(
  lf: LogicFlow,
  next: LogicFlowGraphData,
): boolean {
  const current = graphFromInstance(lf);
  const currentNodes = new Map(current.nodes.map((node) => [node.id, node]));
  const nextNodes = new Map(next.nodes.map((node) => [node.id, node]));
  const currentEdges = new Map(current.edges.map((edge) => [edge.id, edge]));
  const nextEdges = new Map(next.edges.map((edge) => [edge.id, edge]));
  const related = (node: LogicFlowNodeData) =>
    Boolean(
      containerRegistry.getByRootType(node.type) || getContainerParent(node),
    );
  for (const node of current.nodes) {
    if (!nextNodes.has(node.id) && related(node)) return false;
  }
  for (const node of next.nodes) {
    const previous = currentNodes.get(node.id);
    if (!previous) {
      if (related(node)) return false;
      continue;
    }
    if (previous.type !== node.type) return false;
    if (
      !sameStringArray(
        getContainerChildren(previous),
        getContainerChildren(node),
      ) ||
      getContainerParent(previous) !== getContainerParent(node)
    )
      return false;
    if (
      (node.type === "pool" || node.type === "lane") &&
      stableStringify(previous) !== stableStringify(node)
    )
      return false;
  }
  for (const edge of next.edges) {
    const previous = currentEdges.get(edge.id);
    if (!previous) continue;
    if (
      previous.type !== edge.type ||
      previous.sourceNodeId !== edge.sourceNodeId ||
      previous.targetNodeId !== edge.targetNodeId
    )
      return false;
  }

  for (const edge of current.edges) {
    if (!nextEdges.has(edge.id)) lf.deleteEdge(edge.id);
  }
  for (const node of current.nodes) {
    if (!nextNodes.has(node.id)) lf.deleteNode(node.id);
  }
  for (const node of next.nodes) {
    const previous = currentNodes.get(node.id);
    if (!previous) lf.addNode(node as LogicFlow.NodeConfig);
    else if (stableStringify(previous) !== stableStringify(node))
      updateElementAttributes(
        lf,
        node.id,
        previous as unknown as Record<string, unknown>,
        node as unknown as Record<string, unknown>,
        true,
      );
  }
  for (const edge of next.edges) {
    const previous = currentEdges.get(edge.id);
    if (!previous) lf.addEdge(edge as LogicFlow.EdgeConfig);
    else if (stableStringify(previous) !== stableStringify(edge))
      updateElementAttributes(
        lf,
        edge.id,
        previous as unknown as Record<string, unknown>,
        edge as unknown as Record<string, unknown>,
        false,
      );
  }
  return true;
}

export const LogicFlowCanvas = forwardRef<
  LogicFlowCanvasHandle,
  LogicFlowCanvasProps
>(function LogicFlowCanvas(
  {
    document: sourceDocument,
    readOnly,
    dark,
    showMiniMap = false,
    className,
    onGraphChange,
    onSelectionChange,
    onPointerMove,
    onReady,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<LogicFlow | null>(null);
  const documentRef = useRef(sourceDocument);
  const emittedFingerprintRef = useRef<string | null>(null);
  const applyingExternalRef = useRef(false);
  const changeFrameRef = useRef<number | null>(null);
  const latestCallbacksRef = useRef({
    onGraphChange,
    onSelectionChange,
    onPointerMove,
    onReady,
  });
  latestCallbacksRef.current = {
    onGraphChange,
    onSelectionChange,
    onPointerMove,
    onReady,
  };

  const emitSelection = () => {
    const lf = instanceRef.current;
    if (!lf) return;
    const selected = lf.graphModel.getSelectElements(true);
    const ids = [
      ...(selected.nodes ?? []).map((node) => node.id),
      ...(selected.edges ?? []).map((edge) => edge.id),
    ];
    latestCallbacksRef.current.onSelectionChange?.(ids);
  };

  const scheduleGraphChange = () => {
    if (applyingExternalRef.current || changeFrameRef.current !== null) return;
    changeFrameRef.current = requestAnimationFrame(() => {
      changeFrameRef.current = null;
      const lf = instanceRef.current;
      if (!lf || applyingExternalRef.current) return;
      const normalizedPage = normalizeLogicFlowData({
        graph: graphFromInstance(lf),
        groups: documentRef.current.groups,
        layers: documentRef.current.layers,
        settings: documentRef.current.settings,
      }).document.pages[0];
      const next: Page = {
        ...normalizedPage,
        id: documentRef.current.id,
        name: documentRef.current.name,
      };
      const fingerprint = stableStringify(next);
      emittedFingerprintRef.current = fingerprint;
      documentRef.current = next;
      latestCallbacksRef.current.onGraphChange?.(next);
      emitSelection();
    });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const lf = new LogicFlow({
      container,
      plugins: [Snapshot, MiniMap, SelectionSelect, BpmnElement, PoolElements],
      grid: sourceDocument.settings.grid
        ? {
            visible: true,
            type: "dot",
            size: 24,
            config: {
              color: dark
                ? "rgba(148, 163, 184, 0.28)"
                : "rgba(71, 85, 105, 0.18)",
              thickness: 1,
            },
            majorBold: false,
          }
        : false,
      snapline: sourceDocument.settings.snapline,
      keyboard: { enabled: false },
      history: false,
      allowResize: !readOnly,
      allowRotate: !readOnly,
      adjustEdge: !readOnly,
      stopMoveGraph: false,
      stopZoomGraph: false,
      stopScrollGraph: false,
    });
    instanceRef.current = lf;
    registerCustomShapes(lf);
    const uninstallContainerRuntime = installContainerRuntime(lf);
    applyingExternalRef.current = true;
    lf.render(sourceDocument.graph as LogicFlow.GraphConfigData);
    applyShapeThemeDefaults(lf, dark);
    applyLayerState(lf, sourceDocument, readOnly);
    emittedFingerprintRef.current = stableStringify(sourceDocument);
    documentRef.current = sourceDocument;
    applyingExternalRef.current = false;
    if (showMiniMap) {
      (lf.extension.miniMap as MiniMap | undefined)?.show();
    }
    (
      lf.extension.selectionSelect as SelectionSelect | undefined
    )?.openSelectionSelect();

    const onNodeDndAdd = ({ data }: { data: LogicFlow.NodeData }) => {
      materializeContainerAfterAdd(lf, data);
    };

    lf.on("node:dnd-add", onNodeDndAdd);
    for (const event of MUTATION_EVENTS) lf.on(event, scheduleGraphChange);
    for (const event of SELECTION_EVENTS) lf.on(event, emitSelection);

    const onMouseMove = (event: MouseEvent) => {
      const point = lf.graphModel.getPointByClient({
        x: event.clientX,
        y: event.clientY,
      }).canvasOverlayPosition;
      latestCallbacksRef.current.onPointerMove?.(point);
    };
    const onMouseLeave = () => latestCallbacksRef.current.onPointerMove?.(null);
    container.addEventListener("mousemove", onMouseMove, { passive: true });
    container.addEventListener("mouseleave", onMouseLeave, { passive: true });
    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      lf.resize(width, height);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();
    latestCallbacksRef.current.onReady?.(lf);
    requestAnimationFrame(() => {
      resize();
      lf.fitView(24, 24);
    });

    return () => {
      if (changeFrameRef.current !== null)
        cancelAnimationFrame(changeFrameRef.current);
      resizeObserver.disconnect();
      container.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("mouseleave", onMouseLeave);
      latestCallbacksRef.current.onPointerMove?.(null);
      lf.off("node:dnd-add", onNodeDndAdd);
      uninstallContainerRuntime();
      lf.destroy();
      instanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const lf = instanceRef.current;
    if (!lf) return;
    lf.keyboard.disable();
    lf.updateEditConfig({
      isSilentMode: false,
      adjustEdge: !readOnly,
      adjustEdgeMiddle: !readOnly,
      adjustEdgeStartAndEnd: !readOnly,
      adjustEdgeStart: !readOnly,
      adjustEdgeEnd: !readOnly,
      adjustNodePosition: !readOnly,
      hideAnchors: readOnly,
      allowRotate: !readOnly,
      allowResize: !readOnly,
      textEdit: !readOnly,
      nodeTextEdit: !readOnly,
      edgeTextEdit: !readOnly,
    });
  }, [readOnly]);

  useEffect(() => {
    const lf = instanceRef.current;
    if (lf) applyLayerState(lf, sourceDocument, readOnly);
  }, [readOnly, sourceDocument.graph, sourceDocument.layers]);

  useEffect(() => {
    const lf = instanceRef.current;
    if (!lf) return;
    const theme = {
      background: {
        background:
          sourceDocument.settings.background === "solid"
            ? "hsl(var(--background))"
            : "transparent",
      },
      grid: sourceDocument.settings.grid
        ? {
            visible: true,
            type: "dot",
            size: 24,
            config: {
              color: dark
                ? "rgba(148, 163, 184, 0.28)"
                : "rgba(71, 85, 105, 0.18)",
              thickness: 1,
            },
            majorBold: false,
          }
        : false,
      rect: {
        stroke: dark ? "#94a3b8" : "#475569",
        fill: dark ? "#172033" : "#ffffff",
        radius: 8,
      },
      circle: {
        stroke: dark ? "#94a3b8" : "#475569",
        fill: dark ? "#172033" : "#ffffff",
      },
      ellipse: {
        stroke: dark ? "#94a3b8" : "#475569",
        fill: dark ? "#172033" : "#ffffff",
      },
      diamond: {
        stroke: dark ? "#94a3b8" : "#475569",
        fill: dark ? "#172033" : "#ffffff",
      },
      nodeText: { color: dark ? "#f8fafc" : "#0f172a", fontSize: 13 },
      edgeText: {
        color: dark ? "#e2e8f0" : "#334155",
        background: { fill: dark ? "#0f172a" : "#ffffff" },
      },
      polyline: { stroke: dark ? "#94a3b8" : "#64748b", strokeWidth: 2 },
      arrow: {
        fill: dark ? "#94a3b8" : "#64748b",
        stroke: dark ? "#94a3b8" : "#64748b",
      },
      outline: { stroke: dark ? "#60a5fa" : "#2563eb", strokeWidth: 2 },
      anchor: { fill: dark ? "#0f172a" : "#ffffff", stroke: "#3b82f6", r: 4 },
      snapline: { stroke: "#f43f5e", strokeWidth: 1 },
    } as unknown as Partial<LogicFlow.Theme>;
    const themeMode = dark ? "dark" : "default";
    lf.setTheme(theme, themeMode);
    applyingExternalRef.current = true;
    applyShapeThemeDefaults(lf, dark);
    const miniMap = lf.extension.miniMap as unknown as
      | { lfMap?: LogicFlow }
      | undefined;
    if (miniMap?.lfMap) {
      miniMap.lfMap.setTheme(theme, themeMode);
      applyShapeThemeDefaults(miniMap.lfMap, dark);
    }
    applyingExternalRef.current = false;
  }, [dark, sourceDocument.settings.background, sourceDocument.settings.grid]);

  useEffect(() => {
    const nextFingerprint = stableStringify(sourceDocument);
    documentRef.current = sourceDocument;
    if (nextFingerprint === emittedFingerprintRef.current) return;
    const lf = instanceRef.current;
    if (!lf) return;
    const currentFingerprint = stableStringify({
      ...sourceDocument,
      graph: graphFromInstance(lf),
    });
    if (currentFingerprint === nextFingerprint) return;
    const transform = lf.getTransform();
    const selectedIds = [
      ...(lf.graphModel.getSelectElements(true).nodes ?? []).map(
        (node) => node.id,
      ),
      ...(lf.graphModel.getSelectElements(true).edges ?? []).map(
        (edge) => edge.id,
      ),
    ];
    applyingExternalRef.current = true;
    const appliedIncrementally = applyGraphIncrementally(
      lf,
      sourceDocument.graph,
    );
    if (!appliedIncrementally) {
      lf.render(sourceDocument.graph as LogicFlow.GraphConfigData);
      lf.graphModel.transformModel.resetZoom();
      lf.graphModel.transformModel.zoom(transform.SCALE_X);
      lf.graphModel.transformModel.translate(
        transform.TRANSLATE_X,
        transform.TRANSLATE_Y,
      );
    }
    applyShapeThemeDefaults(lf, dark);
    applyLayerState(lf, sourceDocument, readOnly);
    lf.clearSelectElements();
    for (const id of selectedIds) {
      if (lf.graphModel.getElement(id)) lf.selectElementById(id, true, false);
    }
    applyingExternalRef.current = false;
  }, [sourceDocument]);

  useImperativeHandle(
    ref,
    (): LogicFlowCanvasHandle => ({
      getInstance: () => instanceRef.current,
      getGraph: () =>
        instanceRef.current
          ? graphFromInstance(instanceRef.current)
          : documentRef.current.graph,
      render: (document) => {
        const lf = instanceRef.current;
        documentRef.current = document;
        if (!lf) return;
        applyingExternalRef.current = true;
        lf.render(document.graph as LogicFlow.GraphConfigData);
        applyShapeThemeDefaults(lf, dark);
        applyLayerState(lf, document, readOnly);
        applyingExternalRef.current = false;
      },
      startDrag: (shape) => {
        if (readOnly) return;
        const containerDefinition = shape.containerId
          ? containerRegistry.getById(shape.containerId)
          : containerRegistry.getByRootType(shape.type);
        instanceRef.current?.dnd.startDrag({
          type: shape.type,
          text: containerDefinition ? undefined : shape.defaultText,
          ...shapeSizeConfig(shape, dark),
        });
      },
      addShape: (shape) => {
        if (readOnly) return;
        const lf = instanceRef.current;
        const container = containerRef.current;
        if (!lf || !container) return;
        const rect = container.getBoundingClientRect();
        const point = lf.graphModel.getPointByClient({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        }).canvasOverlayPosition;
        const containerDefinition = shape.containerId
          ? containerRegistry.getById(shape.containerId)
          : containerRegistry.getByRootType(shape.type);
        const node = lf.addNode({
          type: shape.type,
          x: point.x,
          y: point.y,
          text: containerDefinition ? undefined : shape.defaultText,
          ...shapeSizeConfig(shape, dark),
        });
        if (containerDefinition)
          materializeContainerAfterAdd(lf, node.getData());
        lf.clearSelectElements();
        lf.selectElementById(node.id, false, true);
        scheduleGraphChange();
      },
      deleteSelected: () => {
        if (readOnly) return;
        const lf = instanceRef.current;
        if (!lf) return;
        const selected = lf.graphModel.getSelectElements(true);
        for (const edge of selected.edges ?? []) lf.deleteEdge(edge.id);
        for (const node of selected.nodes ?? []) lf.deleteNode(node.id);
        scheduleGraphChange();
      },
      select: (ids) => {
        const lf = instanceRef.current;
        if (!lf) return;
        lf.clearSelectElements();
        ids.forEach((id) => lf.selectElementById(id, true, false));
        emitSelection();
      },
      updateText: (id, value) => {
        if (readOnly) return;
        instanceRef.current?.updateText(id, value);
        scheduleGraphChange();
      },
      setProperties: (id, properties) => {
        if (readOnly) return;
        instanceRef.current?.setProperties(id, properties);
        scheduleGraphChange();
      },
      setToolMode: (mode) => {
        const lf = instanceRef.current;
        if (!lf) return;
        const selection = lf.extension.selectionSelect as
          | SelectionSelect
          | undefined;
        if (mode === "select") {
          selection?.openSelectionSelect();
          lf.updateEditConfig({
            adjustNodePosition: !readOnly,
            hideAnchors: readOnly,
            stopMoveGraph: false,
          });
        } else if (mode === "pan") {
          selection?.closeSelectionSelect();
          lf.clearSelectElements();
          lf.updateEditConfig({
            adjustNodePosition: false,
            hideAnchors: true,
            stopMoveGraph: false,
          });
        } else {
          selection?.closeSelectionSelect();
          lf.updateEditConfig({
            adjustNodePosition: false,
            hideAnchors: readOnly,
            stopMoveGraph: true,
          });
        }
      },
      getViewport: () => {
        const transform = instanceRef.current?.getTransform();
        return transform
          ? {
              scale: transform.SCALE_X,
              x: transform.TRANSLATE_X,
              y: transform.TRANSLATE_Y,
            }
          : null;
      },
      setViewport: (viewport) => {
        const transform = instanceRef.current?.graphModel.transformModel;
        if (!transform) return;
        transform.resetZoom();
        transform.zoom(viewport.scale);
        transform.translate(viewport.x, viewport.y);
      },
      fitView: () => instanceRef.current?.fitView(24, 24),
      zoomIn: () => void instanceRef.current?.zoom(true),
      zoomOut: () => void instanceRef.current?.zoom(false),
      resetZoom: () => instanceRef.current?.resetZoom(),
      focusOn: (id) => instanceRef.current?.focusOn(id),
      graphPointToHtml: ({ x, y }) => {
        const point =
          instanceRef.current?.graphModel.transformModel.CanvasPointToHtmlPoint(
            [x, y],
          );
        return point ? { x: point[0], y: point[1] } : { x, y };
      },
      exportBlob: async (type, backgroundColor) => {
        const snapshot = instanceRef.current?.extension.snapshot as
          | Snapshot
          | undefined;
        if (!snapshot)
          throw new Error("LogicFlow snapshot extension is unavailable");
        const result = await snapshot.getSnapshotBlob(backgroundColor, type, {
          fileType: type,
          backgroundColor,
          padding: 32,
          partial: false,
        });
        if (result.data instanceof Blob) return result.data;
        return new Blob([result.data], {
          type: type === "svg" ? "image/svg+xml" : "image/png",
        });
      },
    }),
    [dark, readOnly],
  );

  return <div ref={containerRef} className={className ?? "h-full w-full"} />;
});
