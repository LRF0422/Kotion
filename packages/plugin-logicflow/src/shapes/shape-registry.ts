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
    type: "uml-class",
    category: "uml",
    label: "Class",
    icon: Square,
    defaultText: "Class\n────────\n+ property\n+ method()",
    keywords: ["object", "attribute", "method", "类", "属性", "方法"],
    aliases: ["class diagram", "object class"],
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
    width: 160,
    height: 110,
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

export function getShapeDefinition(type: string): ShapeDefinition | undefined {
  return SHAPE_DEFINITIONS.find((shape) => shape.type === type);
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
