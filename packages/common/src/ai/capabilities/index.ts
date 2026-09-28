/**
 * Capabilities Module Export
 *
 * Collects and serializes the full frontend capability catalog for inline
 * delivery with every chat request. No discovery layer: the collector withholds
 * nothing, and the only tools that leave the advertised list are the surplus the
 * provider's tool ceiling cannot fit (see {@link DEFAULT_TOOL_BUDGET}).
 */

export { collectCapabilityCatalog, isReadOnlyTool } from './CapabilityCatalog'
export type { CapabilityCatalog, CollectCapabilityCatalogOptions } from './CapabilityCatalog'
export { buildAgentRunInputs, DEFAULT_TOOL_BUDGET } from './catalog-to-run-input'
export type { AgentRunInputs } from './catalog-to-run-input'
export type { AgentCapabilityCatalog, SkillPayload, ToolPayload } from './payload-types'
