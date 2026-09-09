import type { JsonValue, LogicFlowNodeData } from "../../model/types";
import type {
  ContainerBounds,
  ContainerDefinition,
  ContainerSeed,
} from "../types";

export const UML_CLASS_CONTAINER_ID = "uml-class";
export const UML_CLASS_LEGACY_TYPE = "uml-class";
export const UML_CLASS_ROOT_TYPE = "uml-class-group";

function record(value: unknown): Record<string, JsonValue> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : undefined;
}

function nodeText(node: LogicFlowNodeData | undefined): string {
  if (!node) return "";
  return typeof node.text === "string" ? node.text : (node.text?.value ?? "");
}

export function parseLegacyUmlClassText(text: string): Record<string, string> {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const separator = (line: string) => /^\s*[-─━—_=]+\s*$/.test(line);
  const separators = lines.flatMap((line, index) =>
    separator(line) ? [index] : [],
  );
  if (separators.length >= 2) {
    const [first, second] = separators;
    return {
      title: lines.slice(0, first).join("\n").trim() || "Class",
      properties: lines
        .slice(first + 1, second)
        .join("\n")
        .trim(),
      methods: lines
        .slice(second + 1)
        .filter((line) => !separator(line))
        .join("\n")
        .trim(),
    };
  }
  const content = lines.filter((line) => !separator(line));
  const titleIndex = content.findIndex((line) => line.trim().length > 0);
  const title = titleIndex >= 0 ? content[titleIndex].trim() : "Class";
  const properties: string[] = [];
  const methods: string[] = [];
  for (const line of titleIndex >= 0 ? content.slice(titleIndex + 1) : []) {
    if (/[()]/.test(line)) methods.push(line);
    else properties.push(line);
  }
  return {
    title: title || "Class",
    properties: properties.join("\n").trim(),
    methods: methods.join("\n").trim(),
  };
}

export function umlClassZones({ x, y, width, height }: ContainerBounds) {
  const titleHeight = Math.min(40, Math.max(28, height * 0.24));
  const remaining = Math.max(40, height - titleHeight);
  const propertiesHeight = remaining * 0.5;
  const methodsHeight = remaining - propertiesHeight;
  const top = y - height / 2;
  return [
    {
      id: "title",
      x,
      y: top + titleHeight / 2,
      width,
      height: titleHeight,
    },
    {
      id: "properties",
      x,
      y: top + titleHeight + propertiesHeight / 2,
      width,
      height: propertiesHeight,
    },
    {
      id: "methods",
      x,
      y: top + titleHeight + propertiesHeight + methodsHeight / 2,
      width,
      height: methodsHeight,
    },
  ];
}

function seedsFromText(values: Record<string, string>): ContainerSeed[] {
  return [
    {
      idHint: "title",
      type: "text",
      zoneId: "title",
      text: values.title || "Class",
      properties: { fontSize: 14, bold: true },
      width: 140,
      height: 26,
    },
    {
      idHint: "properties",
      type: "text",
      zoneId: "properties",
      text: values.properties || "+ property",
      properties: { fontSize: 12, textAlign: "left" },
      width: 140,
      height: 32,
    },
    {
      idHint: "methods",
      type: "text",
      zoneId: "methods",
      text: values.methods || "+ method()",
      properties: { fontSize: 12, textAlign: "left" },
      width: 140,
      height: 32,
    },
  ];
}

export const umlClassContainer: ContainerDefinition = {
  id: UML_CLASS_CONTAINER_ID,
  version: 2,
  rootType: UML_CLASS_ROOT_TYPE,
  defaultSize: { width: 240, height: 200 },
  minSize: { width: 140, height: 100 },
  zones: umlClassZones,
  accepts(node, zone) {
    if (node.id === "") return false;
    if (zone.id === "title") return node.type === "text";
    return node.type !== UML_CLASS_ROOT_TYPE;
  },
  capabilities: {
    resizable: true,
    rotatable: false,
    flippable: false,
    edgeTarget: "root",
    scaleChildren: true,
    scaleText: true,
  },
  operations: {
    delete: "root-and-descendants",
    copy: "root-and-descendants",
    duplicate: "root-and-descendants",
    translate: "root-and-descendants",
    resize: "root-and-descendants",
    lock: "root-and-descendants",
    "move-layer": "root-and-descendants",
    "z-order": "root-and-descendants",
    export: "root-and-descendants",
    "user-group": "root-only",
    rotate: "deny",
    flip: "deny",
  },
  initialSeeds: seedsFromText({
    title: "Class",
    properties: "+ property",
    methods: "+ method()",
  }),
  legacyMigrations: [
    {
      id: "legacy-uml-class",
      matches: (node) => node.type === UML_CLASS_LEGACY_TYPE,
      migrate: (node) => ({
        seeds: seedsFromText(parseLegacyUmlClassText(nodeText(node))),
      }),
    },
    {
      id: "fixed-role-uml-class",
      matches(node) {
        const composite = record(node.properties?.composite);
        return (
          node.type === UML_CLASS_ROOT_TYPE && Boolean(record(composite?.roles))
        );
      },
      migrate(node, nodes) {
        const composite = record(node.properties?.composite);
        const roles = record(composite?.roles) ?? {};
        const consumeIds = Object.values(roles).filter(
          (id): id is string => typeof id === "string",
        );
        return {
          seeds: seedsFromText({
            title: nodeText(nodes.get(String(roles.title ?? ""))),
            properties: nodeText(nodes.get(String(roles.properties ?? ""))),
            methods: nodeText(nodes.get(String(roles.methods ?? ""))),
          }),
          consumeIds,
        };
      },
    },
  ],
};
