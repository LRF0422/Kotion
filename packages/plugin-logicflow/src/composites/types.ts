import type { JsonValue, LogicFlowNodeData } from "../model/types";

export type ContainerOperation =
  | "delete"
  | "copy"
  | "duplicate"
  | "translate"
  | "resize"
  | "rotate"
  | "flip"
  | "lock"
  | "move-layer"
  | "z-order"
  | "export"
  | "user-group";

export type ContainerRootPolicy = "root-only" | "root-and-descendants" | "deny";

export interface ContainerBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ContainerZone extends ContainerBounds {
  id: string;
}

export interface ContainerSeed {
  idHint: string;
  type: string;
  zoneId: string;
  text?: string;
  properties?: Record<string, JsonValue>;
  width?: number;
  height?: number;
}

export interface ContainerLegacyMigration {
  id: string;
  matches(node: LogicFlowNodeData): boolean;
  migrate(
    node: LogicFlowNodeData,
    nodes: ReadonlyMap<string, LogicFlowNodeData>,
  ): { seeds: ContainerSeed[]; consumeIds?: string[] };
}

export interface ContainerVersionMigration {
  from: number;
  to: number;
  migrate(node: LogicFlowNodeData): LogicFlowNodeData;
}

export interface ContainerDefinition {
  id: string;
  version: number;
  rootType: string;
  defaultSize: { width: number; height: number };
  minSize: { width: number; height: number };
  zones(bounds: ContainerBounds): ContainerZone[];
  accepts(node: LogicFlowNodeData, zone: ContainerZone): boolean;
  capabilities: {
    resizable: boolean;
    rotatable: boolean;
    flippable: boolean;
    edgeTarget: "root" | "none";
    scaleChildren: boolean;
    scaleText: boolean;
  };
  operations: Partial<Record<ContainerOperation, ContainerRootPolicy>>;
  initialSeeds?: ContainerSeed[];
  legacyMigrations?: ContainerLegacyMigration[];
  versionMigrations?: ContainerVersionMigration[];
}

export interface ContainerMetadata {
  definitionId: string;
  version: number;
  scaleChildren?: boolean;
}

export interface ContainerFactoryInput {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  properties?: Record<string, JsonValue>;
  extras?: Record<string, JsonValue>;
  seeds?: ContainerSeed[];
  usedIds?: Set<string>;
}

export interface ContainerMaterialization {
  root: LogicFlowNodeData;
  children: LogicFlowNodeData[];
}
