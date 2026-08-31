/**
 * Register core AI tool factories into the global registry
 *
 * Called at application startup so that plugins (which depend on @kn/common only)
 * can use editor-specific tools through the registry without referencing @kn/core.
 */

import { registerToolFactories } from '@kn/common'
import { createReadTools } from './read-tools'
import { createInsertTools } from './insert-tools'
import { createDeleteTools } from './delete-tools'
import { createMiscTools } from './misc-tools'
import { createColumnsTools } from './columns-tools'
import { createStructureTools } from './structure-tools'
import { createFormatTools } from './format-tools'
import { createCalloutTools } from './callout-tools'
import { createLinkTools } from './link-tools'
import { createRichContentTools } from './richcontent-tools'
import { createHistoryTools } from './history-tools'
import { createSelectionTools } from './selection-tools'
import { createRangeTools } from './range-tools'
import { createBlockIdTools } from './blockid-tools'
import { createPageTools } from './page-tools'
import { createReferenceTools } from './reference-tools'

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
        createLinkTools,
        createRichContentTools,
        createHistoryTools,
        createSelectionTools,
        createRangeTools,
        createBlockIdTools,
        createPageTools,
        createReferenceTools,
    ])
}
