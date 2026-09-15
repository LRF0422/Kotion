/**
 * AgentTransport — the fetch seam between the Agent SDK and the host.
 *
 * The SDK must not hard-code the product gateway path or the auth/session
 * policy (see docs/PACKAGE_BOUNDARIES.md: common owns contracts, not product
 * policy). The host (@kn/core) registers a transport at application startup;
 * the SDK only knows how to call it.
 *
 * Kept here because it is a stable contract that both the SDK (which calls it)
 * and the host (which implements it) depend on.
 */

/** Authenticated fetch. The host adds auth headers / refresh policy. */
export type AgentFetch = (input: string, init?: RequestInit) => Promise<Response>

export interface AgentTransport {
    fetch: AgentFetch
    /** Agent API base path (no trailing slash), e.g. the gateway route. */
    apiBase: string
}

let current: AgentTransport | null = null

/** Register the host transport. Called once at application startup. */
export function configureAgentTransport(transport: AgentTransport): void {
    current = transport
}

/** The registered transport, or null when the host has not configured one. */
export function getAgentTransport(): AgentTransport | null {
    return current
}

/** Thrown when the SDK is used before the host registered a transport. */
export class AgentTransportNotConfiguredError extends Error {
    constructor() {
        super('AgentTransport is not configured: the host (@kn/core) must call '
            + 'registerAgentRuntime() at application startup before using the agent SDK')
        this.name = 'AgentTransportNotConfiguredError'
    }
}
