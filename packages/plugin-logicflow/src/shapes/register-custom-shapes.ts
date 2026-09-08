import LogicFlow, {
  h,
  RectNode,
  RectNodeModel,
  type GraphModel,
} from "@logicflow/core";
import type { RichCardContent } from "../model/types";
import {
  createDefaultRichCardContent,
  layoutRichCardSvgLines,
  sanitizeRichCardContent,
} from "../rich-text/rich-card-content";
import type { ShapeDefinition } from "./shape-registry";
import { SHAPE_DEFINITIONS } from "./shape-registry";

const CUSTOM_TYPES = new Set([
  "rich-card",
  "actor",
  "cloud",
  "database",
  "document",
  "callout",
  "arrow",
  "er-entity",
  "er-relationship",
  "uml-class",
  "uml-interface",
  "uml-actor",
  "uml-component",
  "network-server",
  "network-database",
  "network-cloud",
  "network-service",
  "network-queue",
]);

type UnknownRecord = Record<string, unknown>;

type NodeVisualStyle = {
  fill: string;
  stroke: string;
  strokeWidth: number;
  text: string;
  accent: string;
};

function finiteDimension(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function stringProperty(
  properties: UnknownRecord,
  style: UnknownRecord,
  key: string,
  fallback: string,
): string {
  const styled = style[key];
  if (typeof styled === "string" && styled.trim()) return styled;
  const direct = properties[key];
  return typeof direct === "string" && direct.trim() ? direct : fallback;
}

function numberProperty(
  properties: UnknownRecord,
  style: UnknownRecord,
  key: string,
  fallback: number,
): number {
  const styled = style[key];
  if (typeof styled === "number" && Number.isFinite(styled)) return styled;
  const direct = properties[key];
  return typeof direct === "number" && Number.isFinite(direct)
    ? direct
    : fallback;
}

function visualStyle(model: RectNodeModel): NodeVisualStyle {
  const properties = record(model.properties);
  const style = record(properties.style);
  return {
    fill: stringProperty(properties, style, "fill", "hsl(var(--card))"),
    stroke: stringProperty(properties, style, "stroke", "hsl(var(--border))"),
    strokeWidth: numberProperty(properties, style, "strokeWidth", 2),
    text: stringProperty(
      properties,
      style,
      "textColor",
      "hsl(var(--card-foreground))",
    ),
    accent: stringProperty(
      properties,
      style,
      "accentColor",
      "hsl(var(--primary))",
    ),
  };
}

function nodeText(model: RectNodeModel): string {
  const text = model.text as unknown;
  if (typeof text === "string") return text;
  if (text && typeof text === "object" && "value" in text) {
    const value = (text as { value?: unknown }).value;
    return typeof value === "string" ? value : "";
  }
  return "";
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(1, max - 1))}…`;
}

function svgText(
  x: number,
  y: number,
  text: string,
  style: NodeVisualStyle,
  options: {
    size?: number;
    weight?: number;
    anchor?: "start" | "middle" | "end";
  } = {},
) {
  return h(
    "text",
    {
      x,
      y,
      fill: style.text,
      fontSize: options.size ?? 13,
      fontWeight: options.weight ?? 500,
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      textAnchor: options.anchor ?? "middle",
      dominantBaseline: "middle",
      pointerEvents: "none",
    },
    text,
  );
}

function baseAttributes(style: NodeVisualStyle) {
  return {
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    strokeLinejoin: "round",
    strokeLinecap: "round",
  };
}

function renderActor(
  model: RectNodeModel,
  style: NodeVisualStyle,
  uml = false,
) {
  const { x, y, width, height } = model;
  const top = y - height / 2 + 8;
  const figureBottom = y + height / 2 - 28;
  const headR = Math.max(7, Math.min(width, height) * 0.1);
  const headY = top + headR;
  const shoulderY = headY + headR + Math.max(8, height * 0.08);
  const hipY = figureBottom - Math.max(10, height * 0.11);
  const armSpan = Math.min(width * 0.58, 44);
  const legSpan = Math.min(width * 0.38, 28);
  return h(
    "g",
    { className: uml ? "lf-uml-actor" : "lf-actor" },
    h("circle", {
      cx: x,
      cy: headY,
      r: headR,
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
    }),
    h("path", {
      d: `M ${x} ${headY + headR} L ${x} ${hipY} M ${x - armSpan / 2} ${shoulderY} L ${x + armSpan / 2} ${shoulderY} M ${x} ${hipY} L ${x - legSpan / 2} ${figureBottom} M ${x} ${hipY} L ${x + legSpan / 2} ${figureBottom}`,
      fill: "none",
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeLinecap: "round",
    }),
    svgText(x, y + height / 2 - 11, truncate(nodeText(model), 18), style, {
      size: 12,
      weight: 600,
    }),
  );
}

function renderCloud(model: RectNodeModel, style: NodeVisualStyle) {
  const { x, y, width: w, height: hgt } = model;
  const left = x - w / 2;
  const top = y - hgt / 2;
  const p = `M ${left + w * 0.2} ${top + hgt * 0.76}
    C ${left + w * 0.06} ${top + hgt * 0.76}, ${left + w * 0.02} ${top + hgt * 0.58}, ${left + w * 0.13} ${top + hgt * 0.48}
    C ${left + w * 0.08} ${top + hgt * 0.3}, ${left + w * 0.28} ${top + hgt * 0.2}, ${left + w * 0.4} ${top + hgt * 0.3}
    C ${left + w * 0.48} ${top + hgt * 0.05}, ${left + w * 0.79} ${top + hgt * 0.12}, ${left + w * 0.8} ${top + hgt * 0.38}
    C ${left + w * 0.98} ${top + hgt * 0.38}, ${left + w * 1.01} ${top + hgt * 0.68}, ${left + w * 0.84} ${top + hgt * 0.76} Z`;
  return h(
    "g",
    null,
    h("path", { d: p, ...baseAttributes(style) }),
    svgText(
      x,
      y + hgt * 0.12,
      truncate(nodeText(model), Math.max(8, Math.floor(w / 9))),
      style,
    ),
  );
}

function renderDatabase(model: RectNodeModel, style: NodeVisualStyle) {
  const { x, y, width: w, height: hgt } = model;
  const left = x - w / 2;
  const top = y - hgt / 2;
  const lip = Math.max(8, Math.min(15, hgt * 0.18));
  return h(
    "g",
    null,
    h("path", {
      d: `M ${left} ${top + lip} V ${top + hgt - lip} C ${left} ${top + hgt + lip * 0.2}, ${left + w} ${top + hgt + lip * 0.2}, ${left + w} ${top + hgt - lip} V ${top + lip} Z`,
      ...baseAttributes(style),
    }),
    h("ellipse", {
      cx: x,
      cy: top + lip,
      rx: w / 2,
      ry: lip,
      ...baseAttributes(style),
    }),
    h("path", {
      d: `M ${left} ${top + hgt * 0.55} C ${left} ${top + hgt * 0.55 + lip}, ${left + w} ${top + hgt * 0.55 + lip}, ${left + w} ${top + hgt * 0.55}`,
      fill: "none",
      stroke: style.stroke,
      strokeWidth: Math.max(1, style.strokeWidth * 0.75),
      opacity: 0.65,
    }),
    svgText(
      x,
      y + hgt * 0.08,
      truncate(nodeText(model), Math.max(8, Math.floor(w / 9))),
      style,
    ),
  );
}

function renderDocument(model: RectNodeModel, style: NodeVisualStyle) {
  const { x, y, width: w, height: hgt } = model;
  const left = x - w / 2;
  const top = y - hgt / 2;
  const wave = Math.max(8, hgt * 0.16);
  return h(
    "g",
    null,
    h("path", {
      d: `M ${left} ${top} H ${left + w} V ${top + hgt - wave} C ${left + w * 0.78} ${top + hgt + wave * 0.15}, ${left + w * 0.62} ${top + hgt - wave * 1.2}, ${left + w * 0.42} ${top + hgt - wave * 0.2} C ${left + w * 0.25} ${top + hgt + wave * 0.5}, ${left + w * 0.12} ${top + hgt - wave * 1.05}, ${left} ${top + hgt - wave * 0.15} Z`,
      ...baseAttributes(style),
    }),
    svgText(
      x,
      y - hgt * 0.05,
      truncate(nodeText(model), Math.max(8, Math.floor(w / 9))),
      style,
    ),
  );
}

function renderCallout(model: RectNodeModel, style: NodeVisualStyle) {
  const { x, y, width: w, height: hgt } = model;
  const left = x - w / 2;
  const top = y - hgt / 2;
  const tail = Math.min(18, hgt * 0.23);
  const bodyBottom = top + hgt - tail;
  return h(
    "g",
    null,
    h("path", {
      d: `M ${left + 8} ${top} H ${left + w - 8} Q ${left + w} ${top} ${left + w} ${top + 8} V ${bodyBottom - 8} Q ${left + w} ${bodyBottom} ${left + w - 8} ${bodyBottom} H ${left + w * 0.42} L ${left + w * 0.25} ${top + hgt} L ${left + w * 0.28} ${bodyBottom} H ${left + 8} Q ${left} ${bodyBottom} ${left} ${bodyBottom - 8} V ${top + 8} Q ${left} ${top} ${left + 8} ${top} Z`,
      ...baseAttributes(style),
    }),
    svgText(
      x,
      top + (hgt - tail) / 2,
      truncate(nodeText(model), Math.max(8, Math.floor(w / 9))),
      style,
    ),
  );
}

function renderArrow(model: RectNodeModel, style: NodeVisualStyle) {
  const { x, y, width: w, height: hgt } = model;
  const left = x - w / 2;
  const top = y - hgt / 2;
  const head = Math.min(w * 0.35, hgt * 0.72);
  const inset = hgt * 0.23;
  return h("path", {
    d: `M ${left} ${top + inset} H ${left + w - head} V ${top} L ${left + w} ${y} L ${left + w - head} ${top + hgt} V ${top + hgt - inset} H ${left} Z`,
    fill: stringProperty(
      record(model.properties),
      record(record(model.properties).style),
      "fill",
      style.accent,
    ),
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    strokeLinejoin: "round",
  });
}

function renderErEntity(model: RectNodeModel, style: NodeVisualStyle) {
  const { x, y, width: w, height: hgt } = model;
  const top = y - hgt / 2;
  const left = x - w / 2;
  const header = Math.min(30, hgt * 0.32);
  return h(
    "g",
    null,
    h("rect", {
      x: left,
      y: top,
      width: w,
      height: hgt,
      rx: 3,
      ...baseAttributes(style),
    }),
    h("rect", {
      x: left,
      y: top,
      width: w,
      height: header,
      rx: 3,
      fill: style.accent,
      opacity: 0.13,
      stroke: "none",
    }),
    h("line", {
      x1: left,
      y1: top + header,
      x2: left + w,
      y2: top + header,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
    }),
    svgText(
      x,
      top + header / 2,
      truncate(nodeText(model), Math.max(8, Math.floor(w / 9))),
      style,
      { weight: 700 },
    ),
    h("line", {
      x1: left + 12,
      y1: top + header + 16,
      x2: left + w * 0.58,
      y2: top + header + 16,
      stroke: style.stroke,
      strokeWidth: 1.5,
      opacity: 0.65,
    }),
    h("line", {
      x1: left + 12,
      y1: top + header + 29,
      x2: left + w * 0.72,
      y2: top + header + 29,
      stroke: style.stroke,
      strokeWidth: 1.5,
      opacity: 0.45,
    }),
  );
}

function renderDiamond(model: RectNodeModel, style: NodeVisualStyle) {
  const { x, y, width: w, height: hgt } = model;
  return h(
    "g",
    null,
    h("path", {
      d: `M ${x} ${y - hgt / 2} L ${x + w / 2} ${y} L ${x} ${y + hgt / 2} L ${x - w / 2} ${y} Z`,
      ...baseAttributes(style),
    }),
    svgText(
      x,
      y,
      truncate(nodeText(model), Math.max(7, Math.floor(w / 10))),
      style,
      { size: 12 },
    ),
  );
}

function renderUmlClass(model: RectNodeModel, style: NodeVisualStyle) {
  const { x, y, width: w, height: hgt } = model;
  const left = x - w / 2;
  const top = y - hgt / 2;
  const rawLines = nodeText(model)
    .split(/\r?\n/)
    .filter((line) => !/^[-─\s]+$/.test(line));
  const title = rawLines[0] || "Class";
  const details = rawLines.slice(1);
  const header = Math.min(32, hgt * 0.28);
  const split = top + header + Math.max(24, (hgt - header) * 0.45);
  return h(
    "g",
    null,
    h("rect", {
      x: left,
      y: top,
      width: w,
      height: hgt,
      rx: 2,
      ...baseAttributes(style),
    }),
    h("line", {
      x1: left,
      y1: top + header,
      x2: left + w,
      y2: top + header,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
    }),
    h("line", {
      x1: left,
      y1: split,
      x2: left + w,
      y2: split,
      stroke: style.stroke,
      strokeWidth: Math.max(1, style.strokeWidth * 0.75),
    }),
    svgText(
      x,
      top + header / 2,
      truncate(title, Math.max(8, Math.floor(w / 9))),
      style,
      { weight: 700 },
    ),
    ...details
      .slice(0, 3)
      .map((line, index) =>
        svgText(
          left + 10,
          top + header + 16 + index * 16,
          truncate(line, Math.max(8, Math.floor(w / 8))),
          style,
          { size: 11, anchor: "start" },
        ),
      ),
  );
}

function renderUmlInterface(model: RectNodeModel, style: NodeVisualStyle) {
  const { x, y, width: w, height: hgt } = model;
  const left = x - w / 2;
  const top = y - hgt / 2;
  const lines = nodeText(model).split(/\r?\n/).filter(Boolean);
  const name = lines.at(-1) || "Interface";
  return h(
    "g",
    null,
    h("rect", {
      x: left,
      y: top,
      width: w,
      height: hgt,
      rx: 2,
      strokeDasharray: "6 3",
      ...baseAttributes(style),
    }),
    svgText(x, y - 12, "«interface»", style, { size: 11 }),
    svgText(x, y + 10, truncate(name, Math.max(8, Math.floor(w / 9))), style, {
      weight: 700,
    }),
  );
}

function renderUmlComponent(model: RectNodeModel, style: NodeVisualStyle) {
  const { x, y, width: w, height: hgt } = model;
  const left = x - w / 2;
  const top = y - hgt / 2;
  const tabW = Math.min(24, w * 0.18);
  const tabH = Math.min(13, hgt * 0.2);
  return h(
    "g",
    null,
    h("rect", {
      x: left + tabW * 0.45,
      y: top,
      width: w - tabW * 0.45,
      height: hgt,
      rx: 4,
      ...baseAttributes(style),
    }),
    h("rect", {
      x: left,
      y: y - tabH - 3,
      width: tabW,
      height: tabH,
      rx: 2,
      ...baseAttributes(style),
    }),
    h("rect", {
      x: left,
      y: y + 3,
      width: tabW,
      height: tabH,
      rx: 2,
      ...baseAttributes(style),
    }),
    svgText(
      x + tabW * 0.15,
      y,
      truncate(nodeText(model), Math.max(8, Math.floor(w / 9))),
      style,
      { weight: 600 },
    ),
  );
}

function renderServer(model: RectNodeModel, style: NodeVisualStyle) {
  const { x, y, width: w, height: hgt } = model;
  const left = x - w / 2;
  const top = y - hgt / 2;
  const rows = 3;
  return h(
    "g",
    null,
    h("rect", {
      x: left,
      y: top,
      width: w,
      height: hgt,
      rx: 5,
      ...baseAttributes(style),
    }),
    ...Array.from({ length: rows }, (_, index) => {
      const rowY = top + (hgt / rows) * index;
      return h(
        "g",
        { key: index },
        index > 0 &&
          h("line", {
            x1: left,
            y1: rowY,
            x2: left + w,
            y2: rowY,
            stroke: style.stroke,
            strokeWidth: 1,
            opacity: 0.65,
          }),
        h("circle", {
          cx: left + w - 13,
          cy: rowY + hgt / rows / 2,
          r: 2.5,
          fill: style.accent,
          stroke: "none",
        }),
      );
    }),
    svgText(
      left + 12,
      y,
      truncate(nodeText(model), Math.max(7, Math.floor(w / 11))),
      style,
      { size: 11, weight: 600, anchor: "start" },
    ),
  );
}

function renderService(model: RectNodeModel, style: NodeVisualStyle) {
  const { x, y, width: w, height: hgt } = model;
  const left = x - w / 2;
  const top = y - hgt / 2;
  const cut = Math.min(20, w * 0.14);
  return h(
    "g",
    null,
    h("path", {
      d: `M ${left + cut} ${top} H ${left + w - cut} L ${left + w} ${y} L ${left + w - cut} ${top + hgt} H ${left + cut} L ${left} ${y} Z`,
      ...baseAttributes(style),
    }),
    h("circle", {
      cx: left + cut,
      cy: y,
      r: 4,
      fill: style.accent,
      stroke: "none",
    }),
    svgText(
      x + 4,
      y,
      truncate(nodeText(model), Math.max(8, Math.floor(w / 9))),
      style,
      { weight: 600 },
    ),
  );
}

function renderQueue(model: RectNodeModel, style: NodeVisualStyle) {
  const { x, y, width: w, height: hgt } = model;
  const left = x - w / 2;
  const top = y - hgt / 2;
  const count = 3;
  const r = Math.min(7, hgt * 0.12);
  return h(
    "g",
    null,
    h("rect", {
      x: left,
      y: top,
      width: w,
      height: hgt,
      rx: 7,
      ...baseAttributes(style),
    }),
    ...Array.from({ length: count }, (_, index) =>
      h("circle", {
        key: index,
        cx: left + 17 + index * (r * 2 + 7),
        cy: y,
        r,
        fill: index === 0 ? style.accent : "none",
        stroke: style.stroke,
        strokeWidth: 1.5,
      }),
    ),
    svgText(
      left + w - 12,
      y,
      truncate(nodeText(model), Math.max(5, Math.floor(w / 14))),
      style,
      { size: 11, weight: 600, anchor: "end" },
    ),
  );
}

function renderCustomShape(type: string, model: RectNodeModel) {
  const style = visualStyle(model);
  switch (type) {
    case "actor":
      return renderActor(model, style);
    case "uml-actor":
      return renderActor(model, style, true);
    case "cloud":
    case "network-cloud":
      return renderCloud(model, style);
    case "database":
    case "network-database":
      return renderDatabase(model, style);
    case "document":
      return renderDocument(model, style);
    case "callout":
      return renderCallout(model, style);
    case "arrow":
      return renderArrow(model, style);
    case "er-entity":
      return renderErEntity(model, style);
    case "er-relationship":
      return renderDiamond(model, style);
    case "uml-class":
      return renderUmlClass(model, style);
    case "uml-interface":
      return renderUmlInterface(model, style);
    case "uml-component":
      return renderUmlComponent(model, style);
    case "network-server":
      return renderServer(model, style);
    case "network-service":
      return renderService(model, style);
    case "network-queue":
      return renderQueue(model, style);
    default:
      return null;
  }
}

interface RichCardProperties extends Record<string, unknown> {
  width?: number;
  height?: number;
  richContent?: RichCardContent;
  style?: LogicFlow.CommonTheme;
}

class RichCardModel extends RectNodeModel<RichCardProperties> {
  setAttributes() {
    this.width = Math.max(160, finiteDimension(this.properties.width, 240));
    this.height = Math.max(100, finiteDimension(this.properties.height, 150));
    this.radius = 10;
    this.properties.richContent = this.properties.richContent
      ? sanitizeRichCardContent(this.properties.richContent)
      : createDefaultRichCardContent();
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
}

class RichCardView extends RectNode {
  getText() {
    return null;
  }

  getShape() {
    const model = this.props.model as RichCardModel;
    const style = visualStyle(model);
    const left = model.x - model.width / 2;
    const top = model.y - model.height / 2;
    const content = sanitizeRichCardContent(model.properties.richContent);
    const lines = layoutRichCardSvgLines(content, model.width, model.height);
    const titleLines = lines.filter((line) => line.kind === "title");
    const firstBody = lines.find((line) => line.kind !== "title");
    const dividerY = firstBody
      ? top + firstBody.y - firstBody.fontSize * 0.9
      : top + Math.min(48, model.height * 0.34);
    return h(
      "g",
      { className: "lf-rich-card" },
      h("rect", {
        x: left,
        y: top,
        width: model.width,
        height: model.height,
        rx: model.radius,
        ...baseAttributes(style),
      }),
      titleLines.length > 0 &&
        h("line", {
          x1: left,
          y1: dividerY,
          x2: left + model.width,
          y2: dividerY,
          stroke: style.stroke,
          strokeWidth: Math.max(1, style.strokeWidth * 0.65),
          opacity: 0.5,
        }),
      ...lines.map((line, index) =>
        h(
          "g",
          { key: index },
          line.marker &&
            svgText(left + line.x - 9, top + line.y, line.marker, style, {
              size: line.fontSize,
              anchor: "start",
            }),
          svgText(left + line.x, top + line.y, line.text, style, {
            size: line.fontSize,
            weight: line.fontWeight,
            anchor: "start",
          }),
        ),
      ),
    );
  }
}

function createModel(shape: ShapeDefinition) {
  return class CustomShapeModel extends RectNodeModel {
    constructor(data: LogicFlow.NodeConfig, graphModel: GraphModel) {
      super(data, graphModel);
    }

    setAttributes() {
      const properties = record(this.properties);
      this.width = finiteDimension(properties.width, shape.width ?? 140);
      this.height = finiteDimension(properties.height, shape.height ?? 72);
      this.radius = shape.defaultStyle.radius ?? 6;
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

    getTextStyle() {
      const style = visualStyle(this);
      return {
        ...super.getTextStyle(),
        color: style.text,
      };
    }
  };
}

function createView(type: string) {
  return class CustomShapeView extends RectNode {
    getText() {
      return null;
    }

    getShape() {
      return renderCustomShape(type, this.props.model);
    }
  };
}

export function registerCustomShapes(lf: LogicFlow): void {
  for (const shape of SHAPE_DEFINITIONS) {
    if (!CUSTOM_TYPES.has(shape.type)) continue;
    if (shape.type === "rich-card") {
      lf.register(shape.type, () => ({
        view: RichCardView,
        model: RichCardModel,
      }));
      continue;
    }
    lf.register(shape.type, () => ({
      view: createView(shape.type),
      model: createModel(shape),
    }));
  }
}
