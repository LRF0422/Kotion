import type { JsonValue, LogicFlowNodeData } from "../model/types";
import { allocateContainerId } from "./ids";
import { withContainerMetadata, withContainerParent } from "./metadata";
import type {
  ContainerDefinition,
  ContainerFactoryInput,
  ContainerMaterialization,
} from "./types";

function finiteDimension(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export function createContainer(
  definition: ContainerDefinition,
  input: ContainerFactoryInput,
): ContainerMaterialization {
  const width = Math.max(
    definition.minSize.width,
    finiteDimension(input.width, definition.defaultSize.width),
  );
  const height = Math.max(
    definition.minSize.height,
    finiteDimension(input.height, definition.defaultSize.height),
  );
  const used = input.usedIds ?? new Set<string>();
  used.add(input.id);
  const sourceProperties = { ...(input.properties ?? {}) };
  delete sourceProperties.children;
  delete sourceProperties.container;
  delete sourceProperties.composite;
  const seeds = input.seeds ?? definition.initialSeeds ?? [];
  const zones = new Map(
    definition
      .zones({ x: input.x, y: input.y, width, height })
      .map((zone) => [zone.id, zone]),
  );
  const inheritedTextColor = sourceProperties.textColor;
  const children = seeds.flatMap((seed) => {
    const zone = zones.get(seed.zoneId);
    if (!zone) return [];
    const id = allocateContainerId(`${input.id}:${seed.idHint}`, used);
    const childWidth = Math.max(
      24,
      Math.min(seed.width ?? zone.width - 16, Math.max(24, zone.width - 8)),
    );
    const childHeight = Math.max(
      20,
      Math.min(seed.height ?? zone.height - 12, Math.max(20, zone.height - 6)),
    );
    const properties = withContainerParent(
      {
        ...(seed.properties ?? {}),
        width: childWidth,
        height: childHeight,
        ...(typeof inheritedTextColor === "string"
          ? { textColor: inheritedTextColor }
          : {}),
      },
      input.id,
      zone.id,
    );
    return [
      {
        id,
        type: seed.type,
        x: zone.x,
        y: zone.y,
        width: childWidth,
        height: childHeight,
        ...(seed.text !== undefined ? { text: seed.text } : {}),
        properties,
      } satisfies LogicFlowNodeData,
    ];
  });
  const root: LogicFlowNodeData = {
    ...(input.extras ?? {}),
    id: input.id,
    type: definition.rootType,
    x: input.x,
    y: input.y,
    width,
    height,
    properties: withContainerMetadata(
      {
        ...sourceProperties,
        width,
        height,
        collapsible: false,
        isCollapsed: false,
        isRestrict: false,
        autoResize: false,
        transformWithContainer: false,
        autoToFront: false,
        allowEdgeConnect: definition.capabilities.edgeTarget === "root",
      } as Record<string, JsonValue>,
      {
        definitionId: definition.id,
        version: definition.version,
        scaleChildren: definition.capabilities.scaleChildren,
      },
      children.map((child) => child.id),
    ),
  };
  return { root, children };
}
