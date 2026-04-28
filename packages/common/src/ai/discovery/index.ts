/**
 * Discovery Module Export
 */

export { createToolDiscoveryTools, getDiscoveryToolsMetadata } from './tool-discovery-tools'
export { createSkillDiscoveryTools, getSkillDiscoveryToolsMetadata } from './skill-discovery-tools'
export { createSkillManagementTools, getSkillManagementToolsMetadata } from './skill-management-tools'
export {
    ESSENTIAL_TOOLS,
    CATEGORY_DESCRIPTIONS,
    BUILTIN_TOOL_METADATA,
    getCategoryInfo,
    isEssentialTool
} from './tool-metadata'

// Skill Router
export type {
    SkillRouterInput,
    SkillDescriptor,
    SkillRouterResult,
    SkillRouterConfig,
} from './skill-router-types'
export { DEFAULT_SKILL_ROUTER_CONFIG } from './skill-router-types'
export {
    buildRouterSystemPrompt,
    buildRouterMessages,
    formatSkillCatalog,
    SKILL_ROUTER_FUNCTION_SCHEMA,
} from './skill-router-prompt'
export type { RouterMessage } from './skill-router-prompt'
export { SkillRouter } from './skill-router'
