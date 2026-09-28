/**
 * Discovery Module Export
 *
 * Only tool metadata remains here — it is used by ToolProvider to seed the
 * built-in tool catalog and by the UI to group tools. Every discovery mechanism
 * was removed: the skill router, the discovery/activation tools, and the
 * deferred-tool policy. The frontend ships the complete catalog — every callable
 * tool with its schema — and performs no discovery of its own. (The one thing
 * still withheld is the surplus past the provider's tool ceiling; that is a
 * capacity valve in `buildAgentRunInputs`, not capability discovery.)
 */

export {
    ESSENTIAL_TOOLS,
    CATEGORY_DESCRIPTIONS,
    BUILTIN_TOOL_METADATA,
    getCategoryInfo,
    isEssentialTool,
} from './tool-metadata'
