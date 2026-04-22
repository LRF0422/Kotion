/**
 * Register core AI tool factories into the global registry
 *
 * Called at application startup so that plugins (which depend on @kn/common only)
 * can use editor-specific tools through the registry without referencing @kn/core.
 */

import { registerToolFactories } from '@kn/common'
import {
    createReadTools,
    createInsertTools,
    createDeleteTools,
    createMiscTools,
    createColumnsTools,
    createStructureTools,
    createFormatTools,
    createCalloutTools,
} from './index'

/**
 * Register all core tool factories into the global registry.
 * Must be called once at application startup (before any AI agent is created).
 */
export function registerCoreToolFactories(): void {
    registerToolFactories([
        createReadTools,
        createInsertTools,
        createDeleteTools,
        createMiscTools,
        createColumnsTools,
        createStructureTools,
        createFormatTools,
        createCalloutTools,
    ])
}
