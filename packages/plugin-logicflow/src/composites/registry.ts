import { umlClassContainer } from "./definitions/uml-class";
import type { ContainerDefinition } from "./types";

export class ContainerRegistry {
  private readonly byId = new Map<string, ContainerDefinition>();
  private readonly byRootType = new Map<string, ContainerDefinition>();

  register(definition: ContainerDefinition): void {
    if (this.byId.has(definition.id)) {
      throw new Error(`Duplicate container definition: ${definition.id}`);
    }
    if (this.byRootType.has(definition.rootType)) {
      throw new Error(`Duplicate container root type: ${definition.rootType}`);
    }
    if (definition.version < 1 || !Number.isInteger(definition.version)) {
      throw new Error(`Invalid container version: ${definition.id}`);
    }
    const zones = definition.zones({
      x: 0,
      y: 0,
      width: definition.defaultSize.width,
      height: definition.defaultSize.height,
    });
    const zoneIds = new Set<string>();
    for (const zone of zones) {
      if (!zone.id || zoneIds.has(zone.id)) {
        throw new Error(`Invalid container zone: ${definition.id}/${zone.id}`);
      }
      zoneIds.add(zone.id);
    }
    const migrations = [...(definition.versionMigrations ?? [])].sort(
      (a, b) => a.from - b.from,
    );
    for (const migration of migrations) {
      if (migration.to !== migration.from + 1) {
        throw new Error(`Non-sequential migration: ${definition.id}`);
      }
    }
    this.byId.set(definition.id, definition);
    this.byRootType.set(definition.rootType, definition);
  }

  getById(id: string): ContainerDefinition | undefined {
    return this.byId.get(id);
  }

  getByRootType(type: string): ContainerDefinition | undefined {
    return this.byRootType.get(type);
  }

  getAll(): ContainerDefinition[] {
    return [...this.byId.values()];
  }
}

export const containerRegistry = new ContainerRegistry();
containerRegistry.register(umlClassContainer);
