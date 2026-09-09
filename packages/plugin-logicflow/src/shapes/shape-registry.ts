import type { LucideIcon } from "@kn/icon";
import {
  ArrowRight,
  Box,
  Circle,
  Cloud,
  Component,
  Database,
  Diamond,
  FileText,
  GitBranch,
  LayoutTemplate,
  MessageSquare,
  PanelTop,
  PlayCircle,
  RectangleHorizontal,
  Rows3,
  Server,
  Square,
  StopCircle,
  User,
  Workflow,
} from "@kn/icon";

export type ShapeCategory =
  | "general"
  | "basic"
  | "arrows"
  | "flowchart"
  | "er"
  | "uml"
  | "bpmn"
  | "network";

export interface ShapeThemeStyle {
  fill: string;
  stroke: string;
  text: string;
  accent: string;
}

export interface ShapeDefaultStyle {
  light: ShapeThemeStyle;
  dark: ShapeThemeStyle;
  strokeWidth: number;
  radius?: number;
}

export type ShapePreviewElement =
  | {
      kind: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      rx?: number;
      fill?: "fill" | "none" | "accent";
      stroke?: "stroke" | "none" | "accent";
      strokeWidth?: number;
      strokeDasharray?: string;
    }
  | {
      kind: "circle";
      cx: number;
      cy: number;
      r: number;
      fill?: "fill" | "none" | "accent";
      stroke?: "stroke" | "none" | "accent";
      strokeWidth?: number;
    }
  | {
      kind: "ellipse";
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      fill?: "fill" | "none" | "accent";
      stroke?: "stroke" | "none" | "accent";
      strokeWidth?: number;
    }
  | {
      kind: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke?: "stroke" | "none" | "accent";
      strokeWidth?: number;
      strokeDasharray?: string;
    }
  | {
      kind: "path";
      d: string;
      fill?: "fill" | "none" | "accent";
      stroke?: "stroke" | "none" | "accent";
      strokeWidth?: number;
      strokeDasharray?: string;
    }
  | {
      kind: "text";
      x: number;
      y: number;
      text: string;
      size?: number;
      weight?: number;
      anchor?: "start" | "middle" | "end";
      fill?: "text" | "accent";
    };

export interface ShapePreview {
  viewBox: string;
  elements: ShapePreviewElement[];
}

export interface ShapeDefinition {
  type: string;
  category: ShapeCategory;
  label: string;
  icon: LucideIcon;
  defaultText: string;
  keywords: string[];
  aliases: string[];
  defaultStyle: ShapeDefaultStyle;
  preview: ShapePreview;
  width?: number;
  height?: number;
  defaultProperties?: Record<string, unknown>;
  containerId?: string;
}

export const SHAPE_CATEGORIES: {
  id: ShapeCategory;
  label: string;
}[] = [
  { id: "general", label: "General" },
  { id: "basic", label: "Basic" },
  { id: "arrows", label: "Arrows" },
  { id: "flowchart", label: "Flowchart" },
  { id: "er", label: "ER" },
  { id: "uml", label: "UML" },
  { id: "bpmn", label: "BPMN" },
  { id: "network", label: "Network" },
];

const DEFAULT_STYLES: Record<ShapeCategory, ShapeDefaultStyle> = {
  general: {
    light: {
      fill: "#ffffff",
      stroke: "#475569",
      text: "#0f172a",
      accent: "#64748b",
    },
    dark: {
      fill: "#172033",
      stroke: "#94a3b8",
      text: "#f8fafc",
      accent: "#cbd5e1",
    },
    strokeWidth: 2,
    radius: 8,
  },
  basic: {
    light: {
      fill: "#eef2ff",
      stroke: "#4f46e5",
      text: "#1e1b4b",
      accent: "#6366f1",
    },
    dark: {
      fill: "#1e1b4b",
      stroke: "#a5b4fc",
      text: "#eef2ff",
      accent: "#818cf8",
    },
    strokeWidth: 2,
    radius: 8,
  },
  arrows: {
    light: {
      fill: "#475569",
      stroke: "#334155",
      text: "#ffffff",
      accent: "#64748b",
    },
    dark: {
      fill: "#cbd5e1",
      stroke: "#e2e8f0",
      text: "#0f172a",
      accent: "#94a3b8",
    },
    strokeWidth: 2,
  },
  flowchart: {
    light: {
      fill: "#ecfdf5",
      stroke: "#047857",
      text: "#064e3b",
      accent: "#10b981",
    },
    dark: {
      fill: "#052e2b",
      stroke: "#6ee7b7",
      text: "#ecfdf5",
      accent: "#34d399",
    },
    strokeWidth: 2,
    radius: 8,
  },
  er: {
    light: {
      fill: "#fffbeb",
      stroke: "#b45309",
      text: "#78350f",
      accent: "#f59e0b",
    },
    dark: {
      fill: "#451a03",
      stroke: "#fbbf24",
      text: "#fffbeb",
      accent: "#f59e0b",
    },
    strokeWidth: 2,
    radius: 4,
  },
  uml: {
    light: {
      fill: "#f5f3ff",
      stroke: "#7c3aed",
      text: "#2e1065",
      accent: "#8b5cf6",
    },
    dark: {
      fill: "#2e1065",
      stroke: "#c4b5fd",
      text: "#f5f3ff",
      accent: "#a78bfa",
    },
    strokeWidth: 2,
    radius: 2,
  },
  bpmn: {
    light: {
      fill: "#eff6ff",
      stroke: "#1d4ed8",
      text: "#172554",
      accent: "#3b82f6",
    },
    dark: {
      fill: "#172554",
      stroke: "#93c5fd",
      text: "#eff6ff",
      accent: "#60a5fa",
    },
    strokeWidth: 2,
    radius: 8,
  },
  network: {
    light: {
      fill: "#ecfeff",
      stroke: "#0e7490",
      text: "#164e63",
      accent: "#06b6d4",
    },
    dark: {
      fill: "#083344",
      stroke: "#67e8f9",
      text: "#ecfeff",
      accent: "#22d3ee",
    },
    strokeWidth: 2,
    radius: 10,
  },
};

const preview = (...elements: ShapePreviewElement[]): ShapePreview => ({
  viewBox: "0 0 64 48",
  elements,
});
const rect = (rx = 5) =>
  preview({ kind: "rect", x: 8, y: 9, width: 48, height: 30, rx });
const ellipse = () =>
  preview({ kind: "ellipse", cx: 32, cy: 24, rx: 24, ry: 15 });
const diamond = () => preview({ kind: "path", d: "M32 6 58 24 32 42 6 24Z" });
const flowchartShape = (
  type: string,
  label: string,
  shapePreview: ShapePreview,
  width = 140,
  height = 88,
  defaultText = label,
  keywords: string[] = [],
): ShapeDefinition => ({
  type,
  category: "flowchart",
  label,
  icon: Workflow,
  defaultText,
  keywords: [label, type, "flowchart", "流程图", ...keywords],
  aliases: [label.toLocaleLowerCase()],
  defaultStyle: DEFAULT_STYLES.flowchart,
  preview: shapePreview,
  width,
  height,
});

export const SHAPE_DEFINITIONS: ShapeDefinition[] = [
  {
    type: "text",
    category: "general",
    label: "Text",
    icon: FileText,
    defaultText: "Text",
    keywords: ["label", "caption", "note", "文字", "文本"],
    aliases: ["label", "note"],
    defaultStyle: DEFAULT_STYLES.general,
    preview: preview({
      kind: "text",
      x: 32,
      y: 28,
      text: "Text",
      size: 16,
      weight: 600,
      anchor: "middle",
    }),
  },
  {
    type: "rich-card",
    category: "general",
    label: "Rich card",
    icon: LayoutTemplate,
    defaultText: "",
    keywords: ["card", "rich text", "details", "list", "卡片", "富文本"],
    aliases: ["card", "info card", "rich text"],
    defaultStyle: DEFAULT_STYLES.general,
    preview: preview(
      { kind: "rect", x: 7, y: 5, width: 50, height: 38, rx: 5 },
      {
        kind: "line",
        x1: 13,
        y1: 15,
        x2: 42,
        y2: 15,
        stroke: "accent",
        strokeWidth: 3,
      },
      { kind: "line", x1: 13, y1: 23, x2: 50, y2: 23, strokeWidth: 2 },
      {
        kind: "circle",
        cx: 14,
        cy: 32,
        r: 1.5,
        fill: "accent",
        stroke: "none",
      },
      { kind: "line", x1: 19, y1: 32, x2: 45, y2: 32, strokeWidth: 2 },
    ),
    width: 240,
    height: 150,
    defaultProperties: {
      richContent: {
        title: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Card title" }],
            },
          ],
        },
        body: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Add details" }],
            },
          ],
        },
      },
    },
  },
  {
    type: "circle",
    category: "basic",
    label: "Circle",
    icon: Circle,
    defaultText: "Node",
    keywords: ["round", "dot", "圆", "节点"],
    aliases: ["round", "dot"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview({ kind: "circle", cx: 32, cy: 24, r: 17 }),
    width: 80,
    height: 80,
  },
  {
    type: "actor",
    category: "basic",
    label: "Actor",
    icon: User,
    defaultText: "Actor",
    keywords: ["person", "user", "stick figure", "用户", "人物"],
    aliases: ["person", "user"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview(
      { kind: "circle", cx: 32, cy: 11, r: 6, fill: "none" },
      { kind: "line", x1: 32, y1: 17, x2: 32, y2: 31 },
      { kind: "line", x1: 20, y1: 23, x2: 44, y2: 23 },
      { kind: "line", x1: 32, y1: 31, x2: 22, y2: 42 },
      { kind: "line", x1: 32, y1: 31, x2: 42, y2: 42 },
    ),
    width: 92,
    height: 110,
  },
  {
    type: "cloud",
    category: "basic",
    label: "Cloud",
    icon: Cloud,
    defaultText: "Cloud",
    keywords: ["internet", "cloud service", "云", "云服务"],
    aliases: ["internet cloud"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview({
      kind: "path",
      d: "M17 38C9 38 6 33 7 28c1-5 5-8 10-8 2-8 9-12 16-9 4 1 7 4 8 8 8-2 15 3 16 10 1 6-4 10-10 10Z",
    }),
    width: 150,
    height: 92,
  },
  {
    type: "database",
    category: "basic",
    label: "Database",
    icon: Database,
    defaultText: "Database",
    keywords: ["storage", "cylinder", "data", "数据库", "存储"],
    aliases: ["cylinder", "data store"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview(
      { kind: "path", d: "M10 14C10 8 54 8 54 14v21c0 7-44 7-44 0Z" },
      { kind: "ellipse", cx: 32, cy: 14, rx: 22, ry: 6 },
      { kind: "path", d: "M10 24c0 7 44 7 44 0", fill: "none" },
    ),
    width: 130,
    height: 92,
  },
  {
    type: "document",
    category: "basic",
    label: "Document",
    icon: FileText,
    defaultText: "Document",
    keywords: ["file", "paper", "report", "文档", "文件"],
    aliases: ["file", "paper"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview({
      kind: "path",
      d: "M9 7h46v30c-8 8-15-7-23 0-8 7-15-7-23 0Z",
    }),
    width: 140,
    height: 96,
  },
  {
    type: "callout",
    category: "basic",
    label: "Callout",
    icon: MessageSquare,
    defaultText: "Message",
    keywords: ["chat", "speech", "comment", "消息", "对话", "标注"],
    aliases: ["chat", "speech bubble", "comment"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview({ kind: "path", d: "M7 7h50v28H29l-10 8v-8H7Z" }),
    width: 150,
    height: 88,
  },
  {
    type: "basic-rectangle",
    category: "basic",
    label: "Rectangle",
    icon: RectangleHorizontal,
    defaultText: "Rectangle",
    keywords: ["box", "block", "矩形", "方框"],
    aliases: ["rectangle", "box"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: rect(1),
    width: 150,
    height: 88,
  },
  {
    type: "basic-rounded-rectangle",
    category: "basic",
    label: "Rounded rectangle",
    icon: RectangleHorizontal,
    defaultText: "Rounded",
    keywords: ["rounded", "pill", "圆角矩形", "圆角"],
    aliases: ["rounded rectangle", "round box"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: rect(9),
    width: 150,
    height: 88,
  },
  {
    type: "basic-square",
    category: "basic",
    label: "Square",
    icon: Square,
    defaultText: "Square",
    keywords: ["box", "正方形", "方形"],
    aliases: ["square box"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview({
      kind: "rect",
      x: 14,
      y: 6,
      width: 36,
      height: 36,
      rx: 1,
    }),
    width: 100,
    height: 100,
  },
  {
    type: "basic-ellipse",
    category: "basic",
    label: "Ellipse",
    icon: Circle,
    defaultText: "Ellipse",
    keywords: ["oval", "椭圆", "椭圆形"],
    aliases: ["oval"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: ellipse(),
    width: 150,
    height: 88,
  },
  {
    type: "basic-diamond",
    category: "basic",
    label: "Diamond",
    icon: Diamond,
    defaultText: "Diamond",
    keywords: ["rhombus", "菱形"],
    aliases: ["rhombus"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: diamond(),
    width: 110,
    height: 90,
  },
  {
    type: "basic-parallelogram",
    category: "basic",
    label: "Parallelogram",
    icon: RectangleHorizontal,
    defaultText: "Parallelogram",
    keywords: ["input", "output", "平行四边形", "输入输出"],
    aliases: ["data"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview({ kind: "path", d: "M15 8H58L49 40H6Z" }),
    width: 150,
    height: 88,
  },
  {
    type: "basic-hexagon",
    category: "basic",
    label: "Hexagon",
    icon: Workflow,
    defaultText: "Hexagon",
    keywords: ["six sides", "六边形", "准备"],
    aliases: ["hex"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview({ kind: "path", d: "M14 7H50L60 24 50 41H14L4 24Z" }),
    width: 140,
    height: 88,
  },
  {
    type: "basic-triangle",
    category: "basic",
    label: "Triangle",
    icon: PlayCircle,
    defaultText: "Triangle",
    keywords: ["three sides", "三角形"],
    aliases: ["triangle"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview({ kind: "path", d: "M32 5 59 42H5Z" }),
    width: 110,
    height: 96,
  },
  {
    type: "basic-cube",
    category: "basic",
    label: "Cube",
    icon: Box,
    defaultText: "Cube",
    keywords: ["3d", "box", "立方体", "立体框"],
    aliases: ["3d box"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview(
      { kind: "path", d: "M6 15 18 5h40v29L46 43H6Z" },
      { kind: "line", x1: 6, y1: 15, x2: 46, y2: 15 },
      { kind: "line", x1: 46, y1: 15, x2: 58, y2: 5 },
      { kind: "line", x1: 46, y1: 15, x2: 46, y2: 43 },
    ),
    width: 150,
    height: 96,
  },
  {
    type: "basic-chevron",
    category: "basic",
    label: "Chevron",
    icon: Workflow,
    defaultText: "Chevron",
    keywords: ["step", "arrow", "燕尾形", "流程步骤"],
    aliases: ["step arrow"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview({ kind: "path", d: "M5 7H46L59 24 46 41H5L18 24Z" }),
    width: 150,
    height: 88,
  },
  {
    type: "basic-trapezoid",
    category: "basic",
    label: "Trapezoid",
    icon: RectangleHorizontal,
    defaultText: "Trapezoid",
    keywords: ["manual", "梯形"],
    aliases: ["trapezium"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview({ kind: "path", d: "M15 7H49L59 41H5Z" }),
    width: 150,
    height: 88,
  },
  {
    type: "basic-wave",
    category: "basic",
    label: "Wave",
    icon: Workflow,
    defaultText: "Wave",
    keywords: ["wavy", "波浪", "波形"],
    aliases: ["wavy shape"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview({
      kind: "path",
      d: "M5 12c10-12 18 12 28 0s18 12 26 0v24c-8 12-16-12-26 0S15 24 5 36Z",
    }),
    width: 150,
    height: 88,
  },
  {
    type: "basic-note",
    category: "basic",
    label: "Note",
    icon: FileText,
    defaultText: "Note",
    keywords: ["paper", "file", "便签", "折角文档"],
    aliases: ["folded note"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview(
      { kind: "path", d: "M12 5H44L55 16V43H12Z" },
      { kind: "path", d: "M44 5V16H55", fill: "none" },
    ),
    width: 120,
    height: 110,
  },
  {
    type: "basic-crescent",
    category: "basic",
    label: "Crescent",
    icon: Circle,
    defaultText: "",
    keywords: ["moon", "月牙", "新月"],
    aliases: ["moon"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview({
      kind: "path",
      d: "M22 4c32 0 32 40 0 40 17-11 17-29 0-40Z",
    }),
    width: 92,
    height: 110,
  },
  {
    type: "basic-delay",
    category: "basic",
    label: "Delay",
    icon: PlayCircle,
    defaultText: "Delay",
    keywords: ["wait", "delay", "等待", "延迟"],
    aliases: ["d shape"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview({ kind: "path", d: "M8 6h24c30 0 30 36 0 36H8Z" }),
    width: 140,
    height: 88,
  },
  {
    type: "basic-concave",
    category: "basic",
    label: "Concave",
    icon: Workflow,
    defaultText: "Concave",
    keywords: ["concave", "凹形", "燕尾"],
    aliases: ["concave hexagon"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview({ kind: "path", d: "M5 6H47L59 24 47 42H5L17 24Z" }),
    width: 150,
    height: 88,
  },
  {
    type: "basic-frame",
    category: "basic",
    label: "Frame",
    icon: LayoutTemplate,
    defaultText: "Frame",
    keywords: ["container", "panel", "框架", "容器"],
    aliases: ["container frame"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview(
      { kind: "rect", x: 5, y: 5, width: 54, height: 38, rx: 2 },
      {
        kind: "rect",
        x: 14,
        y: 13,
        width: 36,
        height: 22,
        rx: 1,
        fill: "none",
      },
    ),
    width: 170,
    height: 110,
  },
  {
    type: "basic-window",
    category: "basic",
    label: "Window",
    icon: PanelTop,
    defaultText: "Window",
    keywords: ["browser", "panel", "窗口", "面板"],
    aliases: ["browser window"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview(
      { kind: "rect", x: 5, y: 6, width: 54, height: 36, rx: 3 },
      { kind: "line", x1: 5, y1: 16, x2: 59, y2: 16 },
      {
        kind: "circle",
        cx: 12,
        cy: 11,
        r: 1.5,
        fill: "accent",
        stroke: "none",
      },
      {
        kind: "circle",
        cx: 18,
        cy: 11,
        r: 1.5,
        fill: "accent",
        stroke: "none",
      },
      {
        kind: "circle",
        cx: 24,
        cy: 11,
        r: 1.5,
        fill: "accent",
        stroke: "none",
      },
    ),
    width: 170,
    height: 110,
  },
  {
    type: "basic-list",
    category: "basic",
    label: "List",
    icon: Rows3,
    defaultText: "List",
    keywords: ["rows", "items", "列表", "清单"],
    aliases: ["list box"],
    defaultStyle: DEFAULT_STYLES.basic,
    preview: preview(
      { kind: "rect", x: 7, y: 5, width: 50, height: 38, rx: 1 },
      { kind: "line", x1: 7, y1: 15, x2: 57, y2: 15 },
      { kind: "line", x1: 7, y1: 25, x2: 57, y2: 25 },
      { kind: "line", x1: 7, y1: 35, x2: 57, y2: 35 },
    ),
    width: 150,
    height: 110,
  },
  {
    type: "arrow",
    category: "arrows",
    label: "Right arrow",
    icon: ArrowRight,
    defaultText: "",
    keywords: ["direction", "next", "right", "箭头", "方向"],
    aliases: ["right arrow", "block arrow"],
    defaultStyle: DEFAULT_STYLES.arrows,
    preview: preview({
      kind: "path",
      d: "M5 17h34V8l20 16-20 16v-9H5Z",
      fill: "accent",
      stroke: "stroke",
    }),
    width: 150,
    height: 72,
  },
  {
    type: "arrow-left",
    category: "arrows",
    label: "Left arrow",
    icon: ArrowRight,
    defaultText: "",
    keywords: ["left", "back", "左箭头", "返回"],
    aliases: ["back arrow"],
    defaultStyle: DEFAULT_STYLES.arrows,
    preview: preview({
      kind: "path",
      d: "M59 17H25V8L5 24l20 16v-9h34Z",
      fill: "accent",
    }),
    width: 150,
    height: 72,
  },
  {
    type: "arrow-up",
    category: "arrows",
    label: "Up arrow",
    icon: ArrowRight,
    defaultText: "",
    keywords: ["up", "top", "上箭头"],
    aliases: ["upward arrow"],
    defaultStyle: DEFAULT_STYLES.arrows,
    preview: preview({
      kind: "path",
      d: "M25 43V20H15L32 4l17 16H39v23Z",
      fill: "accent",
    }),
    width: 80,
    height: 130,
  },
  {
    type: "arrow-down",
    category: "arrows",
    label: "Down arrow",
    icon: ArrowRight,
    defaultText: "",
    keywords: ["down", "bottom", "下箭头"],
    aliases: ["downward arrow"],
    defaultStyle: DEFAULT_STYLES.arrows,
    preview: preview({
      kind: "path",
      d: "M25 5v23H15l17 16 17-16H39V5Z",
      fill: "accent",
    }),
    width: 80,
    height: 130,
  },
  {
    type: "arrow-chevron-right",
    category: "arrows",
    label: "Chevron arrow",
    icon: ArrowRight,
    defaultText: "",
    keywords: ["chevron", "step", "V形箭头", "步骤"],
    aliases: ["chevron right"],
    defaultStyle: DEFAULT_STYLES.arrows,
    preview: preview({
      kind: "path",
      d: "M5 7h39l15 17-15 17H5l13-17Z",
      fill: "accent",
    }),
    width: 150,
    height: 76,
  },
  {
    type: "arrow-notched-right",
    category: "arrows",
    label: "Notched arrow",
    icon: ArrowRight,
    defaultText: "",
    keywords: ["notched", "swallowtail", "凹尾箭头"],
    aliases: ["notched right arrow"],
    defaultStyle: DEFAULT_STYLES.arrows,
    preview: preview({
      kind: "path",
      d: "M5 8h38l16 16-16 16H5l8-16Z",
      fill: "accent",
    }),
    width: 150,
    height: 76,
  },
  {
    type: "arrow-bidirectional",
    category: "arrows",
    label: "Left right arrow",
    icon: ArrowRight,
    defaultText: "",
    keywords: ["both", "bidirectional", "双向箭头", "左右"],
    aliases: ["two way arrow"],
    defaultStyle: DEFAULT_STYLES.arrows,
    preview: preview({
      kind: "path",
      d: "M5 24 20 8v9h24V8l15 16-15 16v-9H20v9Z",
      fill: "accent",
    }),
    width: 160,
    height: 72,
  },
  {
    type: "arrow-lightning",
    category: "arrows",
    label: "Lightning arrow",
    icon: ArrowRight,
    defaultText: "",
    keywords: ["lightning", "fast", "闪电箭头"],
    aliases: ["bolt arrow"],
    defaultStyle: DEFAULT_STYLES.arrows,
    preview: preview({
      kind: "path",
      d: "M4 22 25 7l-5 12h22V9l18 15-18 15V29H24l5 12Z",
      fill: "accent",
    }),
    width: 160,
    height: 76,
  },
  {
    type: "arrow-double-chevron-right",
    category: "arrows",
    label: "Double chevron",
    icon: ArrowRight,
    defaultText: "",
    keywords: ["double", "fast forward", "双箭头", "快进"],
    aliases: ["double right arrow"],
    defaultStyle: DEFAULT_STYLES.arrows,
    preview: preview({
      kind: "path",
      d: "M5 8h18l16 16-16 16H5l14-16Zm24 0h14l16 16-16 16H29l14-16Z",
      fill: "accent",
    }),
    width: 170,
    height: 76,
  },
  {
    type: "arrow-turn-right",
    category: "arrows",
    label: "Turn right",
    icon: ArrowRight,
    defaultText: "",
    keywords: ["turn", "corner", "右转箭头"],
    aliases: ["right turn arrow"],
    defaultStyle: DEFAULT_STYLES.arrows,
    preview: preview({
      kind: "path",
      d: "M6 43V19Q6 7 18 7h25V2l16 12-16 12v-6H20v23Z",
      fill: "accent",
    }),
    width: 130,
    height: 110,
  },
  {
    type: "arrow-turn-left",
    category: "arrows",
    label: "Turn left",
    icon: ArrowRight,
    defaultText: "",
    keywords: ["turn", "corner", "左转箭头"],
    aliases: ["left turn arrow"],
    defaultStyle: DEFAULT_STYLES.arrows,
    preview: preview({
      kind: "path",
      d: "M58 43V19Q58 7 46 7H21V2L5 14l16 12v-6h23v23Z",
      fill: "accent",
    }),
    width: 130,
    height: 110,
  },
  {
    type: "arrow-corner-down-right",
    category: "arrows",
    label: "Down right turn",
    icon: ArrowRight,
    defaultText: "",
    keywords: ["corner", "down right", "右下转向"],
    aliases: ["corner down right"],
    defaultStyle: DEFAULT_STYLES.arrows,
    preview: preview({
      kind: "path",
      d: "M5 5h38q12 0 12 12v13h6L49 44 37 30h6V18H5Z",
      fill: "accent",
    }),
    width: 130,
    height: 110,
  },
  {
    type: "arrow-corner-down-left",
    category: "arrows",
    label: "Down left turn",
    icon: ArrowRight,
    defaultText: "",
    keywords: ["corner", "down left", "左下转向"],
    aliases: ["corner down left"],
    defaultStyle: DEFAULT_STYLES.arrows,
    preview: preview({
      kind: "path",
      d: "M59 5H21Q9 5 9 17v13H3l12 14 12-14h-6V18h38Z",
      fill: "accent",
    }),
    width: 130,
    height: 110,
  },
  {
    type: "arrow-four-way",
    category: "arrows",
    label: "Four way arrow",
    icon: ArrowRight,
    defaultText: "",
    keywords: ["move", "four directions", "四向箭头", "移动"],
    aliases: ["move arrow"],
    defaultStyle: DEFAULT_STYLES.arrows,
    preview: preview({
      kind: "path",
      d: "M32 3 43 14h-6v5h8v-6l16 11-16 11v-6h-8v5h6L32 45 21 34h6v-5h-8v6L3 24l16-11v6h8v-5h-6Z",
      fill: "accent",
    }),
    width: 110,
    height: 110,
  },
  {
    type: "arrow-three-way",
    category: "arrows",
    label: "Three way arrow",
    icon: ArrowRight,
    defaultText: "",
    keywords: ["split", "three directions", "三向箭头", "分流"],
    aliases: ["three direction arrow"],
    defaultStyle: DEFAULT_STYLES.arrows,
    preview: preview({
      kind: "path",
      d: "M32 3 43 14h-6v7h8v-6l16 11-16 11v-6H19v6L3 26l16-11v6h8v-7h-6Z",
      fill: "accent",
    }),
    width: 120,
    height: 110,
  },
  {
    type: "arrow-u-turn",
    category: "arrows",
    label: "U-turn arrow",
    icon: ArrowRight,
    defaultText: "",
    keywords: ["return", "u turn", "掉头箭头", "回转"],
    aliases: ["return arrow"],
    defaultStyle: DEFAULT_STYLES.arrows,
    preview: preview(
      {
        kind: "path",
        d: "M49 42V25Q49 7 32 7T15 25v10",
        fill: "none",
        strokeWidth: 4,
      },
      { kind: "path", d: "M7 31 15 43l8-12Z", fill: "accent" },
    ),
    width: 120,
    height: 110,
  },
  {
    type: "arrow-curved-right",
    category: "arrows",
    label: "Curved right arrow",
    icon: ArrowRight,
    defaultText: "",
    keywords: ["curve", "right", "右弯箭头", "曲线"],
    aliases: ["swoosh right"],
    defaultStyle: DEFAULT_STYLES.arrows,
    preview: preview(
      { kind: "path", d: "M7 43Q12 7 48 15", fill: "none", strokeWidth: 4 },
      { kind: "path", d: "M43 7 59 17 45 30Z", fill: "accent" },
    ),
    width: 140,
    height: 110,
  },
  {
    type: "arrow-curved-left",
    category: "arrows",
    label: "Curved left arrow",
    icon: ArrowRight,
    defaultText: "",
    keywords: ["curve", "left", "左弯箭头", "曲线"],
    aliases: ["swoosh left"],
    defaultStyle: DEFAULT_STYLES.arrows,
    preview: preview(
      { kind: "path", d: "M57 43Q52 7 16 15", fill: "none", strokeWidth: 4 },
      { kind: "path", d: "M21 7 5 17l14 13Z", fill: "accent" },
    ),
    width: 140,
    height: 110,
  },
  {
    type: "arrow-triangle-pointer",
    category: "arrows",
    label: "Triangle pointer",
    icon: ArrowRight,
    defaultText: "",
    keywords: ["pointer", "navigation", "指针", "导航箭头"],
    aliases: ["triangle arrow"],
    defaultStyle: DEFAULT_STYLES.arrows,
    preview: preview({
      kind: "path",
      d: "M8 5 59 24 8 43Z",
      fill: "accent",
    }),
    width: 120,
    height: 100,
  },
  {
    type: "rect",
    category: "flowchart",
    label: "Process",
    icon: RectangleHorizontal,
    defaultText: "Process",
    keywords: ["step", "action", "process", "流程", "步骤"],
    aliases: ["process", "step", "rectangle"],
    defaultStyle: DEFAULT_STYLES.flowchart,
    preview: rect(4),
  },
  {
    type: "diamond",
    category: "flowchart",
    label: "Decision",
    icon: Diamond,
    defaultText: "Decision",
    keywords: ["condition", "branch", "判断", "分支"],
    aliases: ["decision", "condition"],
    defaultStyle: DEFAULT_STYLES.flowchart,
    preview: diamond(),
    width: 100,
    height: 80,
  },
  {
    type: "ellipse",
    category: "flowchart",
    label: "Start / End",
    icon: PlayCircle,
    defaultText: "Start",
    keywords: ["terminator", "begin", "finish", "开始", "结束"],
    aliases: ["terminator", "start", "end"],
    defaultStyle: DEFAULT_STYLES.flowchart,
    preview: ellipse(),
    width: 110,
    height: 60,
  },
  flowchartShape(
    "flowchart-annotation-left",
    "Left annotation",
    preview({ kind: "path", d: "M55 7H10v34h45M10 24h45", fill: "none" }),
    140,
    96,
    "Annotation",
    ["annotation", "左注释"],
  ),
  flowchartShape(
    "flowchart-annotation-right",
    "Right annotation",
    preview({ kind: "path", d: "M9 7h45v34H9m45-17H9", fill: "none" }),
    140,
    96,
    "Annotation",
    ["annotation", "右注释"],
  ),
  flowchartShape(
    "flowchart-collate",
    "Collate",
    preview({ kind: "path", d: "M8 6h48L8 42h48Z" }),
    120,
    96,
    "Collate",
    ["collate", "归并"],
  ),
  flowchartShape(
    "flowchart-data",
    "Data",
    preview({ kind: "path", d: "M15 7h44L49 41H5Z" }),
    150,
    88,
    "Data",
    ["input output", "数据", "输入输出"],
  ),
  flowchartShape(
    "flowchart-database",
    "Database",
    preview(
      { kind: "path", d: "M8 13c0-8 48-8 48 0v23c0 8-48 8-48 0Z" },
      { kind: "ellipse", cx: 32, cy: 13, rx: 24, ry: 7 },
    ),
    140,
    96,
    "Database",
    ["storage", "数据库"],
  ),
  flowchartShape(
    "flowchart-delay",
    "Delay",
    preview({ kind: "path", d: "M7 7h24c34 0 34 34 0 34H7Z" }),
    140,
    88,
    "Delay",
    ["wait", "延迟"],
  ),
  flowchartShape(
    "flowchart-direct-access-storage",
    "Direct storage",
    preview(
      { kind: "path", d: "M14 7h36c12 0 12 34 0 34H14Z" },
      { kind: "ellipse", cx: 14, cy: 24, rx: 8, ry: 17 },
    ),
    150,
    88,
    "Storage",
    ["direct access", "直接存储"],
  ),
  flowchartShape(
    "flowchart-terminator",
    "Terminator",
    preview({ kind: "rect", x: 6, y: 10, width: 52, height: 28, rx: 14 }),
    150,
    72,
    "Start / End",
    ["start end", "终止符", "开始结束"],
  ),
  flowchartShape(
    "flowchart-document",
    "Document",
    preview({
      kind: "path",
      d: "M6 7h52v28c-9 10-17-8-27 0S15 27 6 35Z",
    }),
    150,
    96,
    "Document",
    ["file", "文档"],
  ),
  flowchartShape(
    "flowchart-manual-input",
    "Manual input",
    preview({ kind: "path", d: "M6 16 58 7v34H6Z" }),
    150,
    88,
    "Manual input",
    ["manual", "手动输入"],
  ),
  flowchartShape(
    "flowchart-predefined-process",
    "Predefined process",
    preview(
      { kind: "rect", x: 6, y: 7, width: 52, height: 34, rx: 1 },
      { kind: "line", x1: 15, y1: 7, x2: 15, y2: 41 },
      { kind: "line", x1: 49, y1: 7, x2: 49, y2: 41 },
    ),
    160,
    88,
    "Process",
    ["subroutine", "预定义流程", "子流程"],
  ),
  flowchartShape(
    "flowchart-preparation",
    "Preparation",
    preview({ kind: "path", d: "M14 7h36l10 17-10 17H14L4 24Z" }),
    150,
    88,
    "Preparation",
    ["setup", "准备"],
  ),
  flowchartShape(
    "flowchart-display",
    "Display",
    preview({
      kind: "path",
      d: "M15 7h35c13 0 13 34 0 34H15L4 24Z",
    }),
    150,
    88,
    "Display",
    ["screen", "显示"],
  ),
  flowchartShape(
    "flowchart-manual-operation",
    "Manual operation",
    preview({ kind: "path", d: "M5 7h54L49 41H15Z" }),
    150,
    88,
    "Manual",
    ["operation", "手工操作"],
  ),
  flowchartShape(
    "flowchart-merge",
    "Merge",
    preview({ kind: "path", d: "M5 7h54L32 42Z" }),
    110,
    96,
    "Merge",
    ["combine", "合并"],
  ),
  flowchartShape(
    "flowchart-extract",
    "Extract",
    preview({ kind: "path", d: "M32 6 59 42H5Z" }),
    110,
    96,
    "Extract",
    ["extract", "提取"],
  ),
  flowchartShape(
    "flowchart-multiple-documents",
    "Multiple documents",
    preview(
      {
        kind: "path",
        d: "M13 3h45v29c-8 8-15-6-23 0s-15-6-22 0Z",
        strokeWidth: 1,
      },
      {
        kind: "path",
        d: "M9 7h45v29c-8 8-15-6-23 0s-15-6-22 0Z",
        strokeWidth: 1.4,
      },
      { kind: "path", d: "M5 11h45v29c-8 8-15-6-23 0s-15-6-22 0Z" },
    ),
    150,
    100,
    "Documents",
    ["multiple", "多文档"],
  ),
  flowchartShape(
    "flowchart-off-page-connector",
    "Off-page connector",
    preview({ kind: "path", d: "M9 5h46v27L32 44 9 32Z" }),
    110,
    110,
    "",
    ["off page", "跨页连接"],
  ),
  flowchartShape(
    "flowchart-connector",
    "Connector",
    preview({ kind: "circle", cx: 32, cy: 24, r: 18 }),
    90,
    90,
    "",
    ["on page", "页内连接"],
  ),
  flowchartShape(
    "flowchart-summing-junction",
    "Summing junction",
    preview(
      { kind: "circle", cx: 32, cy: 24, r: 19 },
      { kind: "line", x1: 13, y1: 24, x2: 51, y2: 24 },
      { kind: "line", x1: 32, y1: 5, x2: 32, y2: 43 },
    ),
    96,
    96,
    "",
    ["sum", "汇总连接"],
  ),
  flowchartShape(
    "flowchart-paper-tape",
    "Paper tape",
    preview({
      kind: "path",
      d: "M5 11c12-10 20 10 32 0s16 8 22 0v26c-12 10-20-10-32 0S11 29 5 37Z",
    }),
    150,
    88,
    "Tape",
    ["paper tape", "纸带"],
  ),
  flowchartShape(
    "flowchart-sort",
    "Sort",
    preview(
      { kind: "path", d: "M32 5 59 24 32 43 5 24Z" },
      { kind: "line", x1: 5, y1: 24, x2: 59, y2: 24 },
    ),
    110,
    96,
    "Sort",
    ["sort", "排序"],
  ),
  flowchartShape(
    "flowchart-internal-storage",
    "Internal storage",
    preview(
      { kind: "rect", x: 6, y: 5, width: 52, height: 38, rx: 1 },
      { kind: "line", x1: 17, y1: 5, x2: 17, y2: 43 },
      { kind: "line", x1: 6, y1: 16, x2: 58, y2: 16 },
    ),
    150,
    100,
    "Storage",
    ["memory", "内部存储"],
  ),
  flowchartShape(
    "flowchart-alternate-process",
    "Alternate process",
    preview({ kind: "rect", x: 7, y: 7, width: 50, height: 34, rx: 8 }),
    150,
    88,
    "Process",
    ["alternate", "备用流程"],
  ),
  flowchartShape(
    "flowchart-stored-data",
    "Stored data",
    preview({
      kind: "path",
      d: "M14 7h36c13 0 13 34 0 34H14C1 41 1 7 14 7Z",
    }),
    150,
    88,
    "Stored data",
    ["stored", "已存储数据"],
  ),
  flowchartShape(
    "flowchart-or-junction",
    "OR junction",
    preview(
      { kind: "circle", cx: 32, cy: 24, r: 19 },
      { kind: "line", x1: 19, y1: 11, x2: 45, y2: 37 },
      { kind: "line", x1: 45, y1: 11, x2: 19, y2: 37 },
    ),
    96,
    96,
    "",
    ["or", "或连接"],
  ),
  flowchartShape(
    "flowchart-sequential-data",
    "Sequential data",
    preview({ kind: "rect", x: 6, y: 11, width: 52, height: 26, rx: 13 }),
    150,
    72,
    "Data",
    ["sequential", "顺序数据"],
  ),
  flowchartShape(
    "flowchart-card",
    "Card",
    preview({ kind: "path", d: "M15 6h43v36H6V15Z" }),
    140,
    92,
    "Card",
    ["punched card", "卡片"],
  ),
  {
    type: "er-entity",
    category: "er",
    label: "Entity",
    icon: RectangleHorizontal,
    defaultText: "Entity",
    keywords: ["table", "record", "database", "实体", "数据表"],
    aliases: ["entity", "table"],
    defaultStyle: DEFAULT_STYLES.er,
    preview: preview(
      { kind: "rect", x: 7, y: 7, width: 50, height: 34, rx: 2 },
      { kind: "line", x1: 7, y1: 19, x2: 57, y2: 19 },
      {
        kind: "text",
        x: 32,
        y: 16,
        text: "ENTITY",
        size: 7,
        weight: 700,
        anchor: "middle",
      },
    ),
    width: 170,
    height: 100,
  },
  {
    type: "er-relationship",
    category: "er",
    label: "Relationship",
    icon: Diamond,
    defaultText: "relates",
    keywords: ["relation", "association", "diamond", "关系", "关联"],
    aliases: ["relationship", "relation"],
    defaultStyle: DEFAULT_STYLES.er,
    preview: diamond(),
    width: 130,
    height: 88,
  },
  {
    type: "uml-class-group",
    category: "uml",
    label: "Class",
    icon: Square,
    defaultText: "Class\n────────\n+ property\n+ method()",
    keywords: ["object", "attribute", "method", "类", "属性", "方法"],
    aliases: ["class diagram", "object class"],
    containerId: "uml-class",
    defaultStyle: DEFAULT_STYLES.uml,
    preview: preview(
      { kind: "rect", x: 9, y: 4, width: 46, height: 40, rx: 1 },
      { kind: "line", x1: 9, y1: 16, x2: 55, y2: 16 },
      { kind: "line", x1: 9, y1: 29, x2: 55, y2: 29 },
      {
        kind: "text",
        x: 32,
        y: 13,
        text: "Class",
        size: 7,
        weight: 700,
        anchor: "middle",
      },
    ),
    width: 240,
    height: 200,
  },
  {
    type: "uml-interface",
    category: "uml",
    label: "Interface",
    icon: Workflow,
    defaultText: "«interface»\nInterface",
    keywords: ["contract", "protocol", "接口", "协议"],
    aliases: ["interface", "contract"],
    defaultStyle: DEFAULT_STYLES.uml,
    preview: preview(
      {
        kind: "rect",
        x: 9,
        y: 7,
        width: 46,
        height: 34,
        rx: 1,
        strokeDasharray: "3 2",
      },
      {
        kind: "text",
        x: 32,
        y: 19,
        text: "«interface»",
        size: 6,
        anchor: "middle",
      },
      {
        kind: "text",
        x: 32,
        y: 31,
        text: "Name",
        size: 8,
        weight: 700,
        anchor: "middle",
      },
    ),
    width: 150,
    height: 82,
  },
  {
    type: "uml-actor",
    category: "uml",
    label: "UML actor",
    icon: User,
    defaultText: "Actor",
    keywords: ["use case", "person", "participant", "参与者", "角色"],
    aliases: ["use case actor", "participant"],
    defaultStyle: DEFAULT_STYLES.uml,
    preview: preview(
      { kind: "circle", cx: 32, cy: 9, r: 5, fill: "none" },
      { kind: "line", x1: 32, y1: 14, x2: 32, y2: 29 },
      { kind: "line", x1: 20, y1: 20, x2: 44, y2: 20 },
      { kind: "line", x1: 32, y1: 29, x2: 23, y2: 40 },
      { kind: "line", x1: 32, y1: 29, x2: 41, y2: 40 },
    ),
    width: 84,
    height: 100,
  },
  {
    type: "uml-component",
    category: "uml",
    label: "Component",
    icon: Component,
    defaultText: "Component",
    keywords: ["module", "package", "模块", "组件"],
    aliases: ["component", "module"],
    defaultStyle: DEFAULT_STYLES.uml,
    preview: preview(
      { kind: "rect", x: 12, y: 8, width: 44, height: 32, rx: 2 },
      { kind: "rect", x: 7, y: 15, width: 12, height: 7, rx: 1, fill: "fill" },
      { kind: "rect", x: 7, y: 27, width: 12, height: 7, rx: 1, fill: "fill" },
    ),
    width: 150,
    height: 76,
  },
  {
    type: "bpmn:startEvent",
    category: "bpmn",
    label: "Start event",
    icon: PlayCircle,
    defaultText: "",
    keywords: ["begin", "event", "开始事件"],
    aliases: ["start event"],
    defaultStyle: DEFAULT_STYLES.bpmn,
    preview: preview({ kind: "circle", cx: 32, cy: 24, r: 16, fill: "none" }),
  },
  {
    type: "bpmn:endEvent",
    category: "bpmn",
    label: "End event",
    icon: StopCircle,
    defaultText: "",
    keywords: ["finish", "event", "结束事件"],
    aliases: ["end event"],
    defaultStyle: DEFAULT_STYLES.bpmn,
    preview: preview({
      kind: "circle",
      cx: 32,
      cy: 24,
      r: 16,
      fill: "none",
      strokeWidth: 4,
    }),
  },
  {
    type: "bpmn:userTask",
    category: "bpmn",
    label: "User task",
    icon: User,
    defaultText: "User task",
    keywords: ["activity", "human", "用户任务"],
    aliases: ["user task", "human task"],
    defaultStyle: DEFAULT_STYLES.bpmn,
    preview: rect(7),
  },
  {
    type: "bpmn:exclusiveGateway",
    category: "bpmn",
    label: "Exclusive gateway",
    icon: GitBranch,
    defaultText: "",
    keywords: ["xor", "decision", "排他网关"],
    aliases: ["exclusive gateway", "xor gateway"],
    defaultStyle: DEFAULT_STYLES.bpmn,
    preview: preview(
      { kind: "path", d: "M32 5 58 24 32 43 6 24Z" },
      { kind: "line", x1: 24, y1: 16, x2: 40, y2: 32, strokeWidth: 3 },
      { kind: "line", x1: 40, y1: 16, x2: 24, y2: 32, strokeWidth: 3 },
    ),
  },
  {
    type: "pool",
    category: "bpmn",
    label: "Pool",
    icon: Rows3,
    defaultText: "Pool",
    keywords: ["swimlane", "participant", "泳道池"],
    aliases: ["pool", "swimlane pool"],
    defaultStyle: DEFAULT_STYLES.bpmn,
    preview: preview(
      { kind: "rect", x: 4, y: 7, width: 56, height: 34, rx: 1 },
      { kind: "line", x1: 15, y1: 7, x2: 15, y2: 41 },
      { kind: "line", x1: 15, y1: 24, x2: 60, y2: 24 },
    ),
    width: 520,
    height: 280,
  },
  {
    type: "lane",
    category: "bpmn",
    label: "Lane",
    icon: PanelTop,
    defaultText: "Lane",
    keywords: ["swimlane", "role", "泳道"],
    aliases: ["lane", "swimlane"],
    defaultStyle: DEFAULT_STYLES.bpmn,
    preview: preview(
      { kind: "rect", x: 4, y: 12, width: 56, height: 24, rx: 1 },
      { kind: "line", x1: 15, y1: 12, x2: 15, y2: 36 },
    ),
    width: 480,
    height: 120,
  },
  {
    type: "network-server",
    category: "network",
    label: "Server",
    icon: Server,
    defaultText: "Server",
    keywords: ["rack", "host", "machine", "服务器", "主机"],
    aliases: ["server", "host"],
    defaultStyle: DEFAULT_STYLES.network,
    preview: preview(
      { kind: "rect", x: 8, y: 6, width: 48, height: 36, rx: 3 },
      { kind: "line", x1: 8, y1: 18, x2: 56, y2: 18 },
      { kind: "line", x1: 8, y1: 30, x2: 56, y2: 30 },
      { kind: "circle", cx: 48, cy: 12, r: 2, fill: "accent", stroke: "none" },
      { kind: "circle", cx: 48, cy: 24, r: 2, fill: "accent", stroke: "none" },
      { kind: "circle", cx: 48, cy: 36, r: 2, fill: "accent", stroke: "none" },
    ),
    width: 140,
    height: 84,
  },
  {
    type: "network-database",
    category: "network",
    label: "Network database",
    icon: Database,
    defaultText: "Database",
    keywords: ["storage", "data store", "数据库", "存储"],
    aliases: ["network database", "data store"],
    defaultStyle: DEFAULT_STYLES.network,
    preview: preview(
      { kind: "path", d: "M10 14C10 8 54 8 54 14v21c0 7-44 7-44 0Z" },
      { kind: "ellipse", cx: 32, cy: 14, rx: 22, ry: 6 },
      { kind: "path", d: "M10 24c0 7 44 7 44 0", fill: "none" },
    ),
    width: 120,
    height: 82,
  },
  {
    type: "network-cloud",
    category: "network",
    label: "Cloud service",
    icon: Cloud,
    defaultText: "Cloud",
    keywords: ["internet", "provider", "云服务", "云端"],
    aliases: ["network cloud", "cloud service"],
    defaultStyle: DEFAULT_STYLES.network,
    preview: preview({
      kind: "path",
      d: "M17 38C9 38 6 33 7 28c1-5 5-8 10-8 2-8 9-12 16-9 4 1 7 4 8 8 8-2 15 3 16 10 1 6-4 10-10 10Z",
    }),
    width: 140,
    height: 82,
  },
  {
    type: "network-service",
    category: "network",
    label: "Service",
    icon: Box,
    defaultText: "Service",
    keywords: ["api", "microservice", "application", "服务", "微服务"],
    aliases: ["service", "microservice", "api"],
    defaultStyle: DEFAULT_STYLES.network,
    preview: preview({ kind: "path", d: "M14 7h36l9 17-9 17H14L5 24Z" }),
    width: 140,
    height: 76,
  },
  {
    type: "network-queue",
    category: "network",
    label: "Queue",
    icon: MessageSquare,
    defaultText: "Queue",
    keywords: ["message", "broker", "stream", "消息队列", "队列"],
    aliases: ["message queue", "broker"],
    defaultStyle: DEFAULT_STYLES.network,
    preview: preview(
      { kind: "rect", x: 11, y: 9, width: 42, height: 30, rx: 3 },
      { kind: "circle", cx: 20, cy: 24, r: 4, fill: "none" },
      { kind: "circle", cx: 32, cy: 24, r: 4, fill: "none" },
      { kind: "circle", cx: 44, cy: 24, r: 4, fill: "none" },
    ),
    width: 140,
    height: 72,
  },
];

export type ShapeThemeColorKey = keyof ShapeThemeStyle;

export function getShapeDefinition(type: string): ShapeDefinition | undefined {
  return SHAPE_DEFINITIONS.find((shape) => shape.type === type);
}

export function resolveShapeThemeColor(
  type: string,
  key: ShapeThemeColorKey,
  value: unknown,
  dark: boolean,
): string | undefined {
  const definition = getShapeDefinition(type);
  const current = typeof value === "string" && value.trim() ? value : undefined;
  if (!definition) return current;
  const { light, dark: darkStyle } = definition.defaultStyle;
  if (!current || current === light[key] || current === darkStyle[key]) {
    return (dark ? darkStyle : light)[key];
  }
  return current;
}

export function canonicalizeShapeThemeColor(
  type: string,
  key: ShapeThemeColorKey,
  value: unknown,
): string | undefined {
  const definition = getShapeDefinition(type);
  const current = typeof value === "string" && value.trim() ? value : undefined;
  if (!definition || !current) return current;
  const { light, dark } = definition.defaultStyle;
  return current === light[key] || current === dark[key] ? light[key] : current;
}

export function searchShapes(query: string): ShapeDefinition[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return SHAPE_DEFINITIONS;
  return SHAPE_DEFINITIONS.filter((shape) =>
    [shape.label, shape.type, ...shape.keywords, ...shape.aliases]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalized),
  );
}
