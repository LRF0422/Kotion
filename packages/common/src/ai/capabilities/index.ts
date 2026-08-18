/**
 * Capabilities Module Export
 *
 * Collects and serializes the full frontend capability catalog for inline
 * delivery with every chat request. Replaces the previous progressive-discovery
 * approach.
 */

export { collectCapabilityCatalog } from './CapabilityCatalog'
export type { CapabilityCatalog } from './CapabilityCatalog'
export { buildAgentRunInputs } from './catalog-to-run-input'
export type { AgentRunInputs } from './catalog-to-run-input'
export type { SkillPayload, ToolPayload } from './payload-types'
