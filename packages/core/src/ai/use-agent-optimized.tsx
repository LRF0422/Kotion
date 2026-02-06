import { AppContext } from "@kn/common"
import { Editor } from "@kn/editor"
import { stepCountIs, ToolLoopAgent } from "ai"
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { deepseek } from "./ai-utils"

// Types
import type { OnToolExecution, OnUserChoiceRequest, ToolsRecord } from "./types"
export type {
    ToolExecutionEvent,
    OnToolExecution,
    UserChoiceOption,
    UserChoiceRequest,
    OnUserChoiceRequest
} from "./types"

// Providers
import { ToolProvider } from "./providers/ToolProvider"
import { SkillProvider } from "./providers/SkillProvider"

// Discovery Tools
import { createToolDiscoveryTools } from "./discovery/tool-discovery-tools"
import { createSkillDiscoveryTools } from "./discovery/skill-discovery-tools"
import { createSkillManagementTools } from "./discovery/skill-management-tools"

// Skills
import { builtinSkills, getSkillRegistry } from "./skills"

// Utils
import { wrapToolsWithCallback } from "./utils/tool-wrapper"

// Base agent instructions (minimal, focused on discovery)
const BASE_AGENT_INSTRUCTIONS = `You are an intelligent document editing assistant. Help users edit, organize, and improve their documents.

# CRITICAL RULES

1. **ALWAYS read the document first** before making any changes
2. **NEVER delete content** without calling askUserChoice first
3. **Use search-based tools** (searchText) instead of position-based when possible
4. **Confirm with user** when the request is ambiguous
5. **For title changes, ALWAYS use updateTitle** - never insert a new heading for title updates
6. **markdown数据不能含有换行符,不要一次性插入大量的markdown内容**

# DOCUMENT STRUCTURE

The document has a special structure:
- The FIRST block (index 0) is always the **document title** (a special "title" node)
- Regular content blocks start from index 1
- To modify the title, use \`updateTitle\` tool, NOT insert tools

# WORKFLOW

1. Understand the user's intent
2. Read relevant document sections (getDocumentStructure, searchInDocument)
3. If modifying title → use updateTitle
4. If destructive action → askUserChoice to confirm
5. Execute the operation
6. Verify the result

# TOOL DISCOVERY

You start with a minimal set of essential tools. When you need additional capabilities:

1. **Discover tools**: Use \`discoverTools\` to see all tool categories
2. **Explore categories**: Use \`exploreCategory\` to see tools in a category
3. **Search tools**: Use \`searchAvailableTools\` to find specific tools
4. **Load tools**: Use \`loadTool\` to load tools you need

## Pre-loaded Essential Tools
### Reading
- getDocumentStructure: Get document overview
- searchInDocument: Search for text
- readChunk: Read document content

### Writing (支持 Markdown 自动解析)
- updateTitle: Update document title
- write: Insert content after a block (recommended, supports markdown)
- insertNear: Insert content near matching text (supports markdown)
- insertAtEnd: Append content to document end (supports markdown)
- replaceContent: Find and replace content

**Markdown Support**: write/insertNear/insertAtEnd/insertAfterBlock 工具默认解析 Markdown 格式：
- 标题: ## Heading
- 列表: - item 或 1. item
- 代码块: \`\`\`language
- 粗体/斜体: **bold** *italic*
- 链接: [text](url)

### Interaction
- askUserChoice: Confirm with user

## Tool Categories
- document-read: Reading and analyzing document content
- document-write: Inserting and updating content
- document-delete: Deleting content (requires confirmation)
- layout: Multi-column layouts
- interaction: User interaction
- web: Web search and fetch
- plugin: Tools from installed plugins

# SKILLS

Skills are high-level capabilities that combine multiple tools with specialized instructions.

## Built-in Skills
Use \`listSkills\` to see available skills and \`activateSkill\` to enable them.

## User-Installed Skills
Users can install custom skills from the web or create their own. Use these tools:
- \`listInstalledSkills\`: List user-installed skills
- \`installSkillFromUrl\`: Install a skill from a URL
- \`installSkill\`: Install a skill from JSON
- \`createCustomSkill\`: Create a new custom skill
- \`uninstallSkill\`: Uninstall a skill
- \`exportSkill\`: Export a skill to share with others

Installed skills are automatically loaded and available for activation.

# EXAMPLES

**Discover what tools are available:**
discoverTools()

**Find tools for a specific task:**
searchAvailableTools({ query: "insert" })

**Load a tool you need:**
loadTool({ toolName: "insertNear" })

**Update document title:**
updateTitle({ newTitle: "New Document Title" })

**Search and read content:**
1. getDocumentStructure() // Get overview
2. searchInDocument({ query: "target text" })
3. readChunk({ startPos: 0 })

# LANGUAGE
Respond in the same language the user uses.`

/**
 * Optimized editor agent hook with progressive tool discovery and skills
 */
export const useEditorAgentOptimized = (
    editor: Editor,
    onToolExecution?: OnToolExecution,
    onUserChoiceRequest?: OnUserChoiceRequest
) => {
    const { pluginManager } = useContext(AppContext)

    // AbortController ref for stopping generation
    const abortControllerRef = useRef<AbortController | null>(null)

    // Version state for reactive updates when tools/skills change
    const [version, setVersion] = useState(0)

    // Reload callback to trigger re-creation of agent
    const handleReload = useCallback(() => {
        setVersion(v => v + 1)
    }, [])

    // Create ToolProvider instance
    const toolProvider = useMemo(() => {
        return new ToolProvider({
            editor,
            onUserChoiceRequest,
            onReload: handleReload
        })
    }, [editor, onUserChoiceRequest, handleReload])

    // Get skill registry (singleton)
    const skillRegistry = useMemo(() => getSkillRegistry(), [])

    // Create SkillProvider instance
    const skillProvider = useMemo(() => {
        const provider = new SkillProvider({
            toolProvider,
            onReload: handleReload
        })
        // Register built-in skills
        provider.registerSkills(builtinSkills)
        return provider
    }, [toolProvider, handleReload])

    // Initialize skill registry and load installed skills
    useEffect(() => {
        let mounted = true

        const loadInstalledSkills = async () => {
            try {
                await skillRegistry.initialize()
                if (mounted) {
                    // Register user-installed skills
                    const installedSkills = skillRegistry.toSkillFormat()
                    if (installedSkills.length > 0) {
                        skillProvider.registerSkills(installedSkills)
                        handleReload()
                    }
                }
            } catch (error) {
                console.error('Failed to load installed skills:', error)
            }
        }

        loadInstalledSkills()

        // Subscribe to skill registry changes
        const unsubscribe = skillRegistry.subscribe(() => {
            if (mounted) {
                // Re-register skills when registry changes
                const installedSkills = skillRegistry.toSkillFormat()
                skillProvider.registerSkills(installedSkills)
                handleReload()
            }
        })

        return () => {
            mounted = false
            unsubscribe()
        }
    }, [skillRegistry, skillProvider, handleReload])

    // Register plugin tools
    useMemo(() => {
        const pluginTools = pluginManager?.resloveTools(editor) || {}
        if (Object.keys(pluginTools).length > 0) {
            toolProvider.registerPluginTools(pluginTools, 'plugins')
        }

        // Register plugin skills if available
        const pluginSkills = pluginManager?.resolveSkills?.() || []
        if (pluginSkills.length > 0) {
            skillProvider.registerSkills(pluginSkills)
        }
    }, [pluginManager, editor, toolProvider, skillProvider])

    // Create discovery tools
    const discoveryTools = useMemo(() => {
        const toolDiscovery = createToolDiscoveryTools({
            toolProvider,
            onReload: handleReload
        })
        const skillDiscovery = createSkillDiscoveryTools({
            skillProvider,
            onReload: handleReload
        })
        const skillManagement = createSkillManagementTools({
            skillRegistry,
            onReload: handleReload
        })
        return { ...toolDiscovery, ...skillDiscovery, ...skillManagement }
    }, [toolProvider, skillProvider, skillRegistry, handleReload])

    // Combine all tools: loaded tools + discovery tools
    const allTools = useMemo(() => {
        const loadedTools = toolProvider.getLoadedTools()
        return { ...loadedTools, ...discoveryTools }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toolProvider, discoveryTools, version])

    // Wrap tools with callback
    const wrappedTools = useMemo(() => {
        return wrapToolsWithCallback(allTools, onToolExecution)
    }, [allTools, onToolExecution])

    // Build dynamic instructions with skill prompts
    const instructions = useMemo(() => {
        const skillAddition = skillProvider.getSystemPromptAddition()
        return BASE_AGENT_INSTRUCTIONS + skillAddition
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [skillProvider, version])

    // Create agent (recreated when tools or skills change)
    const agent = useMemo(() => new ToolLoopAgent({
        model: deepseek("deepseek-chat"),
        stopWhen: stepCountIs(100),
        instructions,
        tools: wrappedTools,
    }), [wrappedTools, instructions])

    // Stream with abort support and history messages
    const stream = useCallback(async (options: {
        prompt: string
        messages?: Array<{ role: 'user' | 'assistant'; content: string }>
    }) => {
        // Abort any previous stream
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }

        // Create new AbortController
        abortControllerRef.current = new AbortController()

        // Build initial messages array for conversation context
        const initialMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []

        // Add history messages if provided
        if (options.messages && options.messages.length > 0) {
            initialMessages.push(...options.messages)
        }

        // Add current prompt as the latest user message
        initialMessages.push({
            role: 'user',
            content: options.prompt
        })

        return agent.stream({
            prompt: options.prompt,
            initialMessages,
            abortSignal: abortControllerRef.current.signal
        })
    }, [agent])

    // Stop current generation
    const stop = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
        }
    }, [])

    // Check if currently generating
    const isGenerating = useCallback(() => {
        return abortControllerRef.current !== null && !abortControllerRef.current.signal.aborted
    }, [])

    return {
        agent,
        stream,
        stop,
        isGenerating,
        // New exports for progressive discovery
        toolProvider,
        skillProvider,
        skillRegistry,
        version
    }
}
