/**
 * Agent runtime registration — the host side of the SDK's transport seam.
 *
 * The agent SDK lives in @kn/common and must not hard-code the product gateway
 * path or the auth/session policy (docs/PACKAGE_BOUNDARIES.md: common owns
 * contracts, not product policy). This module owns both and registers them on
 * startup via {@link registerAgentRuntime}; the SDK then resolves the transport
 * lazily on first request.
 *
 * Kept deliberately tiny: any additional concrete runtime policy (persistence,
 * tab lock) belongs here too as the SDK is inverted further.
 */

import {
    authorizedFetch,
    configureAgentPersistence,
    configureAgentStreamBudget,
    configureAgentTransport,
    type AgentPersistence,
} from '@kn/common'
import { RunLock, RunStore } from './browser-persistence'

/** Gateway route that fronts the knowledge-agent service. */
export const AGENT_API_BASE = '/api/knowledge-agent/api/agent/v1'

/** Register the concrete transport once, at application startup. */
export function registerAgentRuntime(): void {
    configureAgentTransport({
        // JWT-aware fetch: adds the auth header and handles session expiry.
        fetch: (input, init) => authorizedFetch(input, init),
        apiBase: AGENT_API_BASE,
    })
    // Browser persistence (localStorage + Web Locks), owned by core. The return
    // annotation is a compile-time assertion that the local implementation still
    // satisfies the @kn/common AgentPersistence contract.
    configureAgentPersistence((): AgentPersistence => ({
        store: new RunStore(),
        lock: new RunLock(),
    }))
    // Cap concurrent live run streams per client. Every open run costs a
    // permanently-open HTTP connection, so an unbounded fan-out of delegated
    // agents starves ordinary API calls (the browser caps ~6 per HTTP/1.1
    // origin). One slot stays reserved for the conversation; children attach
    // later from their durable event log via afterSeq, losing nothing.
    configureAgentStreamBudget({ maxConcurrentStreams: 4, reservedForRootStreams: 1 })
}
