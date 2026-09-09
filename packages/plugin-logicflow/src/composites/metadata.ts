import type { JsonValue, LogicFlowNodeData } from "../model/types";
import type { ContainerMetadata } from "./types";

function record(value: unknown): Record<string, JsonValue> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : undefined;
}

export function getContainerMetadata(
  node: LogicFlowNodeData,
): ContainerMetadata | undefined {
  const metadata = record(node.properties?.container);
  if (
    !metadata ||
    typeof metadata.definitionId !== "string" ||
    typeof metadata.version !== "number"
  ) {
    return undefined;
  }
  return {
    definitionId: metadata.definitionId,
    version: metadata.version,
    ...(typeof metadata.scaleChildren === "boolean"
      ? { scaleChildren: metadata.scaleChildren }
      : {}),
  };
}

export function getContainerChildren(node: LogicFlowNodeData): string[] {
  const value = node.properties?.children;
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string")
    : [];
}

export function getContainerParent(
  node: LogicFlowNodeData,
): string | undefined {
  return typeof node.properties?.parent === "string"
    ? node.properties.parent
    : undefined;
}

export function getContainerZone(node: LogicFlowNodeData): string | undefined {
  return typeof node.properties?.containerZone === "string"
    ? node.properties.containerZone
    : undefined;
}

export function withContainerMetadata(
  properties: Record<string, JsonValue> | undefined,
  metadata: ContainerMetadata,
  children: readonly string[],
): Record<string, JsonValue> {
  return {
    ...(properties ?? {}),
    container: {
      definitionId: metadata.definitionId,
      version: metadata.version,
      ...(metadata.scaleChildren !== undefined
        ? { scaleChildren: metadata.scaleChildren }
        : {}),
    },
    children: [...new Set(children)],
  };
}

export function withContainerParent(
  properties: Record<string, JsonValue> | undefined,
  parentId: string,
  zoneId?: string,
): Record<string, JsonValue> {
  return {
    ...(properties ?? {}),
    parent: parentId,
    ...(zoneId ? { containerZone: zoneId } : {}),
  };
}

export function withoutContainerParent(
  properties: Record<string, JsonValue> | undefined,
): Record<string, JsonValue> {
  const next = { ...(properties ?? {}) };
  delete next.parent;
  delete next.containerZone;
  return next;
}
