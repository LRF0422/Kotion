/**
 * ToolFactoryRegistry - Global registry for AI tool factories
 *
 * Decouples tool consumers (common/hooks) from tool implementations (core).
 * Core registers its editor-specific tool factories here at startup.
 * Plugins use tools through common without needing to depend on core.
 */

import type { ToolsRecord, OnUserChoiceRequest } from '../types'

/** Tool factory function: receives an editor, returns tool definitions */
export type ToolFactory = (editor: any, onUserChoiceRequest?: OnUserChoiceRequest) => ToolsRecord

const registry: ToolFactory[] = []

/**
 * Register tool factories (called by core at startup)
 */
export function registerToolFactories(factories: ToolFactory[]): void {
    registry.push(...factories)
}

/**
 * Get all registered tool factories
 */
export function getToolFactories(): ToolFactory[] {
    return registry
}

/**
 * Clear all registered factories (for testing)
 */
export function clearToolFactories(): void {
    registry.length = 0
}
