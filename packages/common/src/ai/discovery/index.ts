/**
 * Discovery Module Export
 *
 * Only tool metadata remains here — it is still used by ToolProvider and the
 * foundation tool-registry to seed the built-in tool catalog. Skill router,
 * skill/tool discovery tools and skill management tools have been removed:
 * the frontend ships the full catalog to the backend which performs
 * progressive discovery internally.
 */

export {
    ESSENTIAL_TOOLS,
    CATEGORY_DESCRIPTIONS,
    BUILTIN_TOOL_METADATA,
    getCategoryInfo,
    isEssentialTool,
} from './tool-metadata'
