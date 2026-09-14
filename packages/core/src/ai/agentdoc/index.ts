/**
 * Per-agent private documents: forked hidden editors plus the bridge that the
 * chat surface uses to fork/commit them.
 */

import { setAgentDocumentBridge } from "@kn/common"
import { agentDocumentBridge, agentDocumentManager } from "./agent-document-manager"

export { AgentDocumentHost } from "./AgentDocumentHost"
export { agentDocumentManager, agentDocumentBridge } from "./agent-document-manager"
export { applyMergeOps } from "./merge-apply"

/**
 * Register the engine into the global bridge. Called once at application
 * startup, alongside `registerOffscreenEditorBridge`.
 */
export function registerAgentDocumentBridge(): void {
    setAgentDocumentBridge(agentDocumentBridge)
}
