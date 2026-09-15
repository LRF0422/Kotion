/**
 * Agent transport retry policy — shared by the run hook and the pending-tool
 * executor. Kept in its own module so neither has to own the other's internals.
 */

import { AgentControlError } from './events'

/** Bounded re-submits of a pending frontend-tool batch. */
export const MAX_TOOL_RESUME_RETRIES = 5

/**
 * True when retrying cannot help: a control error other than RUN_BUSY, or an
 * HTTP 4xx.
 */
export function isPermanentTransportError(error: unknown): boolean {
    if (error instanceof AgentControlError) {
        return error.code !== 'RUN_BUSY'
    }
    const message = error instanceof Error ? error.message : String(error)
    return /\((400|401|403|404)\)/.test(message)
}
