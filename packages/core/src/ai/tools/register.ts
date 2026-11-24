/**
 * Register core AI tool factories into the global registry
 *
 * Called at application startup so that plugins (which depend on @kn/common only)
 * can use editor-specific tools through the registry without referencing @kn/core.
 */

import {
    registerAgentToolImplementations,
    registerToolFactories,
    createSkillTools,
    createBackgroundTaskTools,
    createLongTaskTools,
    createFormTools,
    createCustomAgentTools,
    createCurrentTargetTools,
} from '@kn/common'
import { createWorkspaceToolImplementations } from './workspace-tools'
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
import { createMathTools } from './math-tools'
import { createHistoryTools } from './history-tools'
import { createSelectionTools } from './selection-tools'
import { createRangeTools } from './range-tools'
import { createBlockIdTools } from './blockid-tools'
import { createPageTools } from './page-tools'
import { createReferenceTools } from './reference-tools'
import { createImageTools } from './image-tools'

/**
 * Register all core tool factories into the global registry.
 * Must be called once at application startup (before any AI agent is created).
 */
/**
 * Register the editor-free workspace tool implementations (M3). Declaration
 * still belongs to a plugin (\`agent.include\`); this only makes them available.
 */
export function registerCoreAgentTools(): void {
    registerAgentToolImplementations(createWorkspaceToolImplementations())
}

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
        createMathTools,
        createHistoryTools,
        createSelectionTools,
        createRangeTools,
        createBlockIdTools,
        createPageTools,
        createReferenceTools,
        createImageTools,
        // Progressive discovery: hands out a skill's tool schemas on demand.
        createSkillTools,
        // The agent's side of long tasks: list/wait/cancel `background: true`
        // tool calls. Editor-free and valid in every scope.
        createBackgroundTaskTools,
        // The same for PLUGIN-declared long tasks (`desktop.tasks`): list / wait
        // with a bounded timeout / incremental logs / cooperative cancel.
        createLongTaskTools,
        // Dynamic forms: ask the user for structured data (request/get/list/
        // cancel). Also editor-free and valid in every scope.
        createFormTools,
        // Custom agents: list / inspect the capability directory / create or
        // update an agent. The same config the settings dialog edits, so "帮我
        // 建一个审稿 Agent" lands in the picker instead of in a paragraph of
        // instructions the user has to retype.
        createCustomAgentTools,
        // Generic "what is the current operation object?" — page, file, table,
        // plugin-defined objects. Editor-free, valid in every scope.
        createCurrentTargetTools,
    ])
}
