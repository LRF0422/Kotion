import LogicFlow, {
  h,
  RectNode,
  RectNodeModel,
  type GraphModel,
} from "@logicflow/core";
import type { RichCardContent } from "../model/types";
import { registerContainers } from "../composites/runtime";
import {
  createDefaultRichCardContent,
  layoutRichCardSvgLines,
  sanitizeRichCardContent,
} from "../rich-text/rich-card-content";
import {
  resolveShapeThemeColor,
  SHAPE_DEFINITIONS,
  type ShapeDefinition,
  type ShapeThemeColorKey,
} from "./shape-registry";

const CUSTOM_TYPES = new Set([
  "rich-card",
  "actor",
  "cloud",
  "database",
  "document",
  "callout",
  "basic-rectangle",
  "basic-rounded-rectangle",
  "basic-square",
  "basic-ellipse",
  "basic-diamond",
  "basic-parallelogram",
  "basic-hexagon",
  "basic-triangle",
  "basic-cube",
  "basic-chevron",
  "basic-trapezoid",
  "basic-wave",
  "basic-note",
  "basic-crescent",
  "basic-delay",
  "basic-concave",
  "basic-frame",
  "basic-window",
  "basic-list",
  "arrow",
  "arrow-left",
  "arrow-up",
  "arrow-down",
  "arrow-chevron-right",
  "arrow-notched-right",
  "arrow-bidirectional",
  "arrow-lightning",
  "arrow-double-chevron-right",
  "arrow-turn-right",
  "arrow-turn-left",
  "arrow-corner-down-right",
  "arrow-corner-down-left",
  "arrow-four-way",
  "arrow-three-way",
  "arrow-u-turn",
  "arrow-curved-right",
  "arrow-curved-left",
  "arrow-triangle-pointer",
  "flowchart-annotation-left",
  "flowchart-annotation-right",
  "flowchart-collate",
  "flowchart-data",
  "flowchart-database",
  "flowchart-delay",
  "flowchart-direct-access-storage",
  "flowchart-terminator",
  "flowchart-document",
  "flowchart-manual-input",
  "flowchart-predefined-process",
  "flowchart-preparation",
  "flowchart-display",
  "flowchart-manual-operation",
  "flowchart-merge",
  "flowchart-extract",
  "flowchart-multiple-documents",
  "flowchart-off-page-connector",
  "flowchart-connector",
  "flowchart-summing-junction",
  "flowchart-paper-tape",
  "flowchart-sort",
  "flowchart-internal-storage",
  "flowchart-alternate-process",
  "flowchart-stored-data",
  "flowchart-or-junction",
  "flowchart-sequential-data",
  "flowchart-card",
  "er-entity",
  "er-relationship",
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

function themeColorProperty(
  model: RectNodeModel,
  properties: UnknownRecord,
  style: UnknownRecord,
  propertyKey: string,
  themeKey: ShapeThemeColorKey,
  fallback: string,
): string {
  const styled = style[propertyKey];
  const direct = properties[propertyKey];
  const value =
    typeof styled === "string" && styled.trim()
      ? styled
      : typeof direct === "string" && direct.trim()
        ? direct
        : undefined;
  return (
    resolveShapeThemeColor(
      model.type,
      themeKey,
      value,
      model.graphModel.themeMode === "dark",
    ) ?? fallback
  );
}

function visualStyle(model: RectNodeModel): NodeVisualStyle {
  const properties = record(model.properties);
  const style = record(properties.style);
  return {
    fill: themeColorProperty(
      model,
      properties,
      style,
      "fill",
      "fill",
      "hsl(var(--card))",
    ),
    stroke: themeColorProperty(
      model,
      properties,
      style,
      "stroke",
      "stroke",
      "hsl(var(--border))",
    ),
    strokeWidth: numberProperty(properties, style, "strokeWidth", 2),
    text: themeColorProperty(
      model,
      properties,
      style,
      "textColor",
      "text",
      "hsl(var(--card-foreground))",
    ),
    accent: themeColorProperty(
      model,
      properties,
      style,
      "accentColor",
      "accent",
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

function renderArrowShape(
  type: string,
  model: RectNodeModel,
  style: NodeVisualStyle,
) {
  if (type === "arrow") return renderArrow(model, style);
  const { x, y, width: w, height: hgt } = model;
  const left = x - w / 2;
  const right = x + w / 2;
  const top = y - hgt / 2;
  const bottom = y + hgt / 2;
  const head = Math.min(w * 0.28, hgt * 0.42);
  const shaft = Math.max(8, hgt * 0.25);
  const fill = stringProperty(
    record(model.properties),
    record(record(model.properties).style),
    "fill",
    style.accent,
  );
  const filled = (d: string) =>
    h("path", {
      d,
      fill,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeLinejoin: "round",
      strokeLinecap: "round",
    });
  const stroked = (d: string) =>
    h("path", {
      d,
      fill: "none",
      stroke: style.stroke,
      strokeWidth: Math.max(3, style.strokeWidth * 1.8),
      strokeLinejoin: "round",
      strokeLinecap: "round",
    });

  switch (type) {
    case "arrow-left":
      return filled(
        `M ${right} ${y - shaft / 2} H ${left + head} V ${top} L ${left} ${y} L ${left + head} ${bottom} V ${y + shaft / 2} H ${right} Z`,
      );
    case "arrow-up":
      return filled(
        `M ${x - shaft / 2} ${bottom} V ${top + head} H ${left} L ${x} ${top} L ${right} ${top + head} H ${x + shaft / 2} V ${bottom} Z`,
      );
    case "arrow-down":
      return filled(
        `M ${x - shaft / 2} ${top} V ${bottom - head} H ${left} L ${x} ${bottom} L ${right} ${bottom - head} H ${x + shaft / 2} V ${top} Z`,
      );
    case "arrow-chevron-right": {
      const notch = Math.min(w * 0.24, hgt * 0.4);
      return filled(
        `M ${left} ${top} H ${right - head} L ${right} ${y} L ${right - head} ${bottom} H ${left} L ${left + notch} ${y} Z`,
      );
    }
    case "arrow-notched-right":
      return filled(
        `M ${left} ${top} H ${right - head} L ${right} ${y} L ${right - head} ${bottom} H ${left} L ${left + head * 0.45} ${y} Z`,
      );
    case "arrow-bidirectional":
      return filled(
        `M ${left} ${y} L ${left + head} ${top} V ${y - shaft / 2} H ${right - head} V ${top} L ${right} ${y} L ${right - head} ${bottom} V ${y + shaft / 2} H ${left + head} V ${bottom} Z`,
      );
    case "arrow-lightning":
      return filled(
        `M ${left} ${y - shaft * 0.2} L ${left + w * 0.38} ${top} L ${left + w * 0.3} ${y - shaft * 0.25} H ${right - head} V ${top + hgt * 0.18} L ${right} ${y} L ${right - head} ${bottom - hgt * 0.18} V ${y + shaft * 0.25} H ${left + w * 0.42} L ${left + w * 0.48} ${bottom} Z`,
      );
    case "arrow-double-chevron-right": {
      const middle = left + w * 0.48;
      return h(
        "g",
        null,
        filled(
          `M ${left} ${top} H ${middle - head * 0.45} L ${middle} ${y} L ${middle - head * 0.45} ${bottom} H ${left + head * 0.2} L ${left + head} ${y} Z`,
        ),
        filled(
          `M ${middle - head * 0.15} ${top} H ${right - head} L ${right} ${y} L ${right - head} ${bottom} H ${middle} L ${middle + head * 0.8} ${y} Z`,
        ),
      );
    }
    case "arrow-turn-right": {
      const stem = Math.max(14, w * 0.22);
      return filled(
        `M ${left} ${bottom} V ${top + shaft} Q ${left} ${top}, ${left + stem} ${top} H ${right - head} V ${top - head * 0.2} L ${right} ${top + shaft / 2} L ${right - head} ${top + shaft * 1.2} V ${top + shaft} H ${left + stem} V ${bottom} Z`,
      );
    }
    case "arrow-turn-left": {
      const stem = Math.max(14, w * 0.22);
      return filled(
        `M ${right} ${bottom} V ${top + shaft} Q ${right} ${top}, ${right - stem} ${top} H ${left + head} V ${top - head * 0.2} L ${left} ${top + shaft / 2} L ${left + head} ${top + shaft * 1.2} V ${top + shaft} H ${right - stem} V ${bottom} Z`,
      );
    }
    case "arrow-corner-down-right":
      return filled(
        `M ${left} ${top} H ${right - shaft} Q ${right} ${top}, ${right} ${top + shaft} V ${bottom - head} H ${right + head * 0.35} L ${right - shaft / 2} ${bottom} L ${right - shaft - head * 0.35} ${bottom - head} H ${right - shaft} V ${top + shaft} H ${left} Z`,
      );
    case "arrow-corner-down-left":
      return filled(
        `M ${right} ${top} H ${left + shaft} Q ${left} ${top}, ${left} ${top + shaft} V ${bottom - head} H ${left - head * 0.35} L ${left + shaft / 2} ${bottom} L ${left + shaft + head * 0.35} ${bottom - head} H ${left + shaft} V ${top + shaft} H ${right} Z`,
      );
    case "arrow-four-way": {
      const arm = Math.min(w, hgt) * 0.2;
      return filled(
        `M ${x} ${top} L ${x + arm} ${top + head} H ${x + arm / 2} V ${y - arm / 2} H ${right - head} V ${y - arm} L ${right} ${y} L ${right - head} ${y + arm} V ${y + arm / 2} H ${x + arm / 2} V ${bottom - head} H ${x + arm} L ${x} ${bottom} L ${x - arm} ${bottom - head} H ${x - arm / 2} V ${y + arm / 2} H ${left + head} V ${y + arm} L ${left} ${y} L ${left + head} ${y - arm} V ${y - arm / 2} H ${x - arm / 2} V ${top + head} H ${x - arm} Z`,
      );
    }
    case "arrow-three-way": {
      const arm = Math.min(w, hgt) * 0.2;
      return filled(
        `M ${x} ${top} L ${x + arm} ${top + head} H ${x + arm / 2} V ${y - arm / 2} H ${right - head} V ${y - arm} L ${right} ${y} L ${right - head} ${y + arm} V ${y + arm / 2} H ${left + head} V ${y + arm} L ${left} ${y} L ${left + head} ${y - arm} V ${y - arm / 2} H ${x - arm / 2} V ${top + head} H ${x - arm} Z`,
      );
    }
    case "arrow-u-turn":
      return h(
        "g",
        null,
        stroked(
          `M ${right - head * 0.5} ${bottom} V ${y} Q ${right - head * 0.5} ${top}, ${x} ${top} Q ${left + head * 0.5} ${top}, ${left + head * 0.5} ${y} V ${bottom - head * 0.2}`,
        ),
        filled(
          `M ${left} ${bottom - head * 0.6} L ${left + head * 0.5} ${bottom} L ${left + head} ${bottom - head * 0.6} Z`,
        ),
      );
    case "arrow-curved-right":
      return h(
        "g",
        null,
        stroked(
          `M ${left} ${bottom} Q ${left + w * 0.1} ${top}, ${right - head} ${top + hgt * 0.28}`,
        ),
        filled(
          `M ${right - head * 1.2} ${top} L ${right} ${top + hgt * 0.28} L ${right - head * 0.75} ${top + hgt * 0.7} Z`,
        ),
      );
    case "arrow-curved-left":
      return h(
        "g",
        null,
        stroked(
          `M ${right} ${bottom} Q ${right - w * 0.1} ${top}, ${left + head} ${top + hgt * 0.28}`,
        ),
        filled(
          `M ${left + head * 1.2} ${top} L ${left} ${top + hgt * 0.28} L ${left + head * 0.75} ${top + hgt * 0.7} Z`,
        ),
      );
    case "arrow-triangle-pointer":
      return filled(`M ${left} ${top} L ${right} ${y} L ${left} ${bottom} Z`);
    default:
      return null;
  }
}

function renderFlowchartShape(
  type: string,
  model: RectNodeModel,
  style: NodeVisualStyle,
) {
  const { x, y, width: w, height: hgt } = model;
  const left = x - w / 2;
  const right = x + w / 2;
  const top = y - hgt / 2;
  const bottom = y + hgt / 2;
  const label = (offsetY = 0) =>
    svgText(
      x,
      y + offsetY,
      truncate(nodeText(model), Math.max(7, Math.floor(w / 10))),
      style,
    );
  const path = (d: string, text = true) =>
    h("g", null, h("path", { d, ...baseAttributes(style) }), text && label());
  const linePath = (d: string) =>
    h("path", {
      d,
      fill: "none",
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeLinejoin: "round",
      strokeLinecap: "round",
    });

  switch (type) {
    case "flowchart-annotation-left":
      return h(
        "g",
        null,
        linePath(
          `M ${right} ${top} H ${left} V ${bottom} H ${right} M ${left} ${y} H ${right}`,
        ),
        label(),
      );
    case "flowchart-annotation-right":
      return h(
        "g",
        null,
        linePath(
          `M ${left} ${top} H ${right} V ${bottom} H ${left} M ${left} ${y} H ${right}`,
        ),
        label(),
      );
    case "flowchart-collate":
      return path(
        `M ${left} ${top} H ${right} L ${left} ${bottom} H ${right} Z`,
      );
    case "flowchart-data": {
      const skew = Math.min(24, w * 0.18);
      return path(
        `M ${left + skew} ${top} H ${right} L ${right - skew} ${bottom} H ${left} Z`,
      );
    }
    case "flowchart-database":
      return renderDatabase(model, style);
    case "flowchart-delay":
      return path(
        `M ${left} ${top} H ${x} Q ${right} ${top}, ${right} ${y} Q ${right} ${bottom}, ${x} ${bottom} H ${left} Z`,
      );
    case "flowchart-direct-access-storage": {
      const cap = Math.min(15, w * 0.12);
      return h(
        "g",
        null,
        h("path", {
          d: `M ${left + cap} ${top} H ${right - cap} Q ${right + cap * 0.15} ${top}, ${right + cap * 0.15} ${y} Q ${right + cap * 0.15} ${bottom}, ${right - cap} ${bottom} H ${left + cap} Z`,
          ...baseAttributes(style),
        }),
        h("ellipse", {
          cx: left + cap,
          cy: y,
          rx: cap,
          ry: hgt / 2,
          ...baseAttributes(style),
        }),
        h("path", {
          d: `M ${right - cap} ${top} Q ${right} ${top}, ${right} ${y} Q ${right} ${bottom}, ${right - cap} ${bottom}`,
          fill: "none",
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
        }),
        label(),
      );
    }
    case "flowchart-terminator":
    case "flowchart-alternate-process":
      return h(
        "g",
        null,
        h("rect", {
          x: left,
          y: top,
          width: w,
          height: hgt,
          rx:
            type === "flowchart-terminator" ? hgt / 2 : Math.min(14, hgt * 0.2),
          ...baseAttributes(style),
        }),
        label(),
      );
    case "flowchart-document":
      return renderDocument(model, style);
    case "flowchart-manual-input": {
      const slope = Math.min(18, hgt * 0.3);
      return path(
        `M ${left} ${top + slope} L ${right} ${top} V ${bottom} H ${left} Z`,
      );
    }
    case "flowchart-predefined-process": {
      const inset = Math.min(18, w * 0.12);
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
          x1: left + inset,
          y1: top,
          x2: left + inset,
          y2: bottom,
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
        }),
        h("line", {
          x1: right - inset,
          y1: top,
          x2: right - inset,
          y2: bottom,
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
        }),
        label(),
      );
    }
    case "flowchart-preparation": {
      const cut = Math.min(22, w * 0.18);
      return path(
        `M ${left + cut} ${top} H ${right - cut} L ${right} ${y} L ${right - cut} ${bottom} H ${left + cut} L ${left} ${y} Z`,
      );
    }
    case "flowchart-display": {
      const point = Math.min(20, w * 0.16);
      return path(
        `M ${left + point} ${top} H ${right - point} Q ${right} ${top}, ${right} ${y} Q ${right} ${bottom}, ${right - point} ${bottom} H ${left + point} L ${left} ${y} Z`,
      );
    }
    case "flowchart-manual-operation": {
      const inset = Math.min(22, w * 0.18);
      return path(
        `M ${left} ${top} H ${right} L ${right - inset} ${bottom} H ${left + inset} Z`,
      );
    }
    case "flowchart-merge":
      return path(`M ${left} ${top} H ${right} L ${x} ${bottom} Z`);
    case "flowchart-extract":
      return path(`M ${x} ${top} L ${right} ${bottom} H ${left} Z`);
    case "flowchart-multiple-documents": {
      const offset = Math.min(9, w * 0.06);
      const documentPath = (dx: number, dy: number) =>
        `M ${left + dx} ${top + dy} H ${right + dx - offset * 2} V ${bottom + dy - offset} C ${right + dx - w * 0.2} ${bottom + dy + offset * 0.4}, ${x + dx} ${bottom + dy - offset * 1.8}, ${left + dx} ${bottom + dy - offset * 0.3} Z`;
      return h(
        "g",
        null,
        h("path", {
          d: documentPath(offset * 2, -offset * 2),
          ...baseAttributes(style),
          opacity: 0.45,
        }),
        h("path", {
          d: documentPath(offset, -offset),
          ...baseAttributes(style),
          opacity: 0.7,
        }),
        h("path", { d: documentPath(0, 0), ...baseAttributes(style) }),
        label(-offset * 0.25),
      );
    }
    case "flowchart-off-page-connector": {
      const cut = Math.min(24, hgt * 0.3);
      return path(
        `M ${left} ${top} H ${right} V ${bottom - cut} L ${x} ${bottom} L ${left} ${bottom - cut} Z`,
      );
    }
    case "flowchart-connector":
      return h(
        "g",
        null,
        h("circle", {
          cx: x,
          cy: y,
          r: Math.min(w, hgt) / 2,
          ...baseAttributes(style),
        }),
        label(),
      );
    case "flowchart-summing-junction": {
      const radius = Math.min(w, hgt) / 2;
      return h(
        "g",
        null,
        h("circle", {
          cx: x,
          cy: y,
          r: radius,
          ...baseAttributes(style),
        }),
        h("line", {
          x1: x - radius,
          y1: y,
          x2: x + radius,
          y2: y,
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
        }),
        h("line", {
          x1: x,
          y1: y - radius,
          x2: x,
          y2: y + radius,
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
        }),
      );
    }
    case "flowchart-paper-tape": {
      const wave = Math.min(16, hgt * 0.2);
      return path(
        `M ${left} ${top + wave} C ${left + w * 0.25} ${top - wave}, ${left + w * 0.35} ${top + wave * 2}, ${x} ${top + wave} C ${left + w * 0.7} ${top - wave}, ${left + w * 0.8} ${top + wave * 2}, ${right} ${top + wave} V ${bottom - wave} C ${left + w * 0.75} ${bottom + wave}, ${left + w * 0.65} ${bottom - wave * 2}, ${x} ${bottom - wave} C ${left + w * 0.3} ${bottom + wave}, ${left + w * 0.2} ${bottom - wave * 2}, ${left} ${bottom - wave} Z`,
      );
    }
    case "flowchart-sort":
      return h(
        "g",
        null,
        h("path", {
          d: `M ${x} ${top} L ${right} ${y} L ${x} ${bottom} L ${left} ${y} Z`,
          ...baseAttributes(style),
        }),
        h("line", {
          x1: left,
          y1: y,
          x2: right,
          y2: y,
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
        }),
        label(),
      );
    case "flowchart-internal-storage": {
      const inset = Math.min(18, w * 0.14, hgt * 0.2);
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
          x1: left + inset,
          y1: top,
          x2: left + inset,
          y2: bottom,
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
        }),
        h("line", {
          x1: left,
          y1: top + inset,
          x2: right,
          y2: top + inset,
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
        }),
        label(inset * 0.35),
      );
    }
    case "flowchart-stored-data": {
      const curve = Math.min(22, w * 0.17);
      return path(
        `M ${left + curve} ${top} H ${right - curve} Q ${right + curve * 0.35} ${top}, ${right} ${y} Q ${right + curve * 0.35} ${bottom}, ${right - curve} ${bottom} H ${left + curve} Q ${left - curve * 0.35} ${bottom}, ${left} ${y} Q ${left - curve * 0.35} ${top}, ${left + curve} ${top} Z`,
      );
    }
    case "flowchart-or-junction": {
      const radius = Math.min(w, hgt) / 2;
      return h(
        "g",
        null,
        h("circle", {
          cx: x,
          cy: y,
          r: radius,
          ...baseAttributes(style),
        }),
        h("line", {
          x1: x - radius * 0.7,
          y1: y - radius * 0.7,
          x2: x + radius * 0.7,
          y2: y + radius * 0.7,
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
        }),
        h("line", {
          x1: x + radius * 0.7,
          y1: y - radius * 0.7,
          x2: x - radius * 0.7,
          y2: y + radius * 0.7,
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
        }),
      );
    }
    case "flowchart-sequential-data":
      return h(
        "g",
        null,
        h("rect", {
          x: left,
          y: top,
          width: w,
          height: hgt,
          rx: hgt / 2,
          ...baseAttributes(style),
        }),
        label(),
      );
    case "flowchart-card": {
      const cut = Math.min(18, w * 0.14, hgt * 0.22);
      return path(
        `M ${left + cut} ${top} H ${right} V ${bottom} H ${left} V ${top + cut} Z`,
      );
    }
    default:
      return null;
  }
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

function renderBasicShape(
  type: string,
  model: RectNodeModel,
  style: NodeVisualStyle,
) {
  const { x, y, width: w, height: hgt } = model;
  const left = x - w / 2;
  const top = y - hgt / 2;
  const label = () =>
    svgText(
      x,
      y,
      truncate(nodeText(model), Math.max(8, Math.floor(w / 10))),
      style,
    );
  const path = (d: string) =>
    h("g", null, h("path", { d, ...baseAttributes(style) }), label());

  switch (type) {
    case "basic-rectangle":
    case "basic-square":
    case "basic-rounded-rectangle":
      return h(
        "g",
        null,
        h("rect", {
          x: left,
          y: top,
          width: w,
          height: hgt,
          rx: type === "basic-rounded-rectangle" ? 12 : 2,
          ...baseAttributes(style),
        }),
        label(),
      );
    case "basic-ellipse":
      return h(
        "g",
        null,
        h("ellipse", {
          cx: x,
          cy: y,
          rx: w / 2,
          ry: hgt / 2,
          ...baseAttributes(style),
        }),
        label(),
      );
    case "basic-diamond":
      return renderDiamond(model, style);
    case "basic-parallelogram": {
      const skew = Math.min(24, w * 0.18);
      return path(
        `M ${left + skew} ${top} H ${left + w} L ${left + w - skew} ${top + hgt} H ${left} Z`,
      );
    }
    case "basic-hexagon": {
      const cut = Math.min(24, w * 0.2);
      return path(
        `M ${left + cut} ${top} H ${left + w - cut} L ${left + w} ${y} L ${left + w - cut} ${top + hgt} H ${left + cut} L ${left} ${y} Z`,
      );
    }
    case "basic-triangle":
      return path(`M ${x} ${top} L ${left + w} ${top + hgt} H ${left} Z`);
    case "basic-chevron": {
      const notch = Math.min(28, w * 0.22);
      return path(
        `M ${left} ${top} H ${left + w - notch} L ${left + w} ${y} L ${left + w - notch} ${top + hgt} H ${left} L ${left + notch} ${y} Z`,
      );
    }
    case "basic-trapezoid": {
      const inset = Math.min(24, w * 0.18);
      return path(
        `M ${left + inset} ${top} H ${left + w - inset} L ${left + w} ${top + hgt} H ${left} Z`,
      );
    }
    case "basic-wave": {
      const wave = hgt * 0.2;
      return path(
        `M ${left} ${top + wave} C ${left + w * 0.2} ${top - wave}, ${left + w * 0.3} ${top + wave * 2}, ${left + w * 0.5} ${top + wave} C ${left + w * 0.7} ${top - wave}, ${left + w * 0.8} ${top + wave * 2}, ${left + w} ${top + wave} V ${top + hgt - wave} C ${left + w * 0.8} ${top + hgt + wave}, ${left + w * 0.7} ${top + hgt - wave * 2}, ${left + w * 0.5} ${top + hgt - wave} C ${left + w * 0.3} ${top + hgt + wave}, ${left + w * 0.2} ${top + hgt - wave * 2}, ${left} ${top + hgt - wave} Z`,
      );
    }
    case "basic-note": {
      const fold = Math.min(24, w * 0.2, hgt * 0.25);
      return h(
        "g",
        null,
        h("path", {
          d: `M ${left} ${top} H ${left + w - fold} L ${left + w} ${top + fold} V ${top + hgt} H ${left} Z`,
          ...baseAttributes(style),
        }),
        h("path", {
          d: `M ${left + w - fold} ${top} V ${top + fold} H ${left + w}`,
          fill: "none",
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
        }),
        label(),
      );
    }
    case "basic-crescent":
      return path(
        `M ${left + w * 0.3} ${top} C ${left + w} ${top}, ${left + w} ${top + hgt}, ${left + w * 0.3} ${top + hgt} C ${left + w * 0.64} ${top + hgt * 0.72}, ${left + w * 0.64} ${top + hgt * 0.28}, ${left + w * 0.3} ${top} Z`,
      );
    case "basic-delay":
      return path(
        `M ${left} ${top} H ${x} Q ${left + w} ${top}, ${left + w} ${y} Q ${left + w} ${top + hgt}, ${x} ${top + hgt} H ${left} Z`,
      );
    case "basic-concave": {
      const cut = Math.min(26, w * 0.2);
      return path(
        `M ${left} ${top} H ${left + w - cut} L ${left + w} ${y} L ${left + w - cut} ${top + hgt} H ${left} L ${left + cut} ${y} Z`,
      );
    }
    case "basic-cube": {
      const depth = Math.min(22, w * 0.16, hgt * 0.24);
      return h(
        "g",
        null,
        h("path", {
          d: `M ${left} ${top + depth} L ${left + depth} ${top} H ${left + w} V ${top + hgt - depth} L ${left + w - depth} ${top + hgt} H ${left} Z`,
          ...baseAttributes(style),
        }),
        h("path", {
          d: `M ${left} ${top + depth} H ${left + w - depth} L ${left + w} ${top} M ${left + w - depth} ${top + depth} V ${top + hgt}`,
          fill: "none",
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
        }),
        label(),
      );
    }
    case "basic-frame":
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
          x: left + 12,
          y: top + 12,
          width: Math.max(1, w - 24),
          height: Math.max(1, hgt - 24),
          rx: 2,
          fill: "none",
          stroke: style.stroke,
          strokeWidth: Math.max(1, style.strokeWidth * 0.75),
        }),
        label(),
      );
    case "basic-window": {
      const header = Math.min(24, hgt * 0.28);
      return h(
        "g",
        null,
        h("rect", {
          x: left,
          y: top,
          width: w,
          height: hgt,
          rx: 4,
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
        ...[0, 1, 2].map((index) =>
          h("circle", {
            key: index,
            cx: left + 12 + index * 10,
            cy: top + header / 2,
            r: 2.2,
            fill: style.accent,
            stroke: "none",
          }),
        ),
        svgText(x, y + header * 0.25, nodeText(model), style),
      );
    }
    case "basic-list": {
      const rows = 4;
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
        ...Array.from({ length: rows - 1 }, (_, index) =>
          h("line", {
            key: index,
            x1: left,
            y1: top + (hgt / rows) * (index + 1),
            x2: left + w,
            y2: top + (hgt / rows) * (index + 1),
            stroke: style.stroke,
            strokeWidth: 1,
            opacity: 0.75,
          }),
        ),
        svgText(left + 10, top + hgt / rows / 2, nodeText(model), style, {
          size: 11,
          anchor: "start",
        }),
      );
    }
    default:
      return null;
  }
}

function renderCustomShape(type: string, model: RectNodeModel) {
  const style = visualStyle(model);
  if (type === "arrow" || type.startsWith("arrow-")) {
    return renderArrowShape(type, model, style);
  }
  if (type.startsWith("flowchart-")) {
    return renderFlowchartShape(type, model, style);
  }
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
      return renderBasicShape(type, model, style);
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
  registerContainers(lf);

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
