import { AppContext } from "@kn/common"
import { Editor } from "@kn/editor"
import { stepCountIs, ToolLoopAgent } from "ai"
import { useCallback, useContext, useMemo, useRef } from "react"
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

// Tools
import { createReadTools } from "./tools/read-tools"
import { createInsertTools } from "./tools/insert-tools"
import { createDeleteTools } from "./tools/delete-tools"
import { createMiscTools } from "./tools/misc-tools"
import { createColumnsTools } from "./tools/columns-tools"

// Utils
import { wrapToolsWithCallback } from "./utils/tool-wrapper"

// Agent instructions
const AGENT_INSTRUCTIONS = `You are an intelligent document editing assistant. Help users edit, organize, and improve their documents.

# CRITICAL RULES

1. **ALWAYS read the document first** before making any changes
2. **NEVER delete content** without calling askUserChoice first
3. **Use search-based tools** (searchText) instead of position-based when possible
4. **Confirm with user** when the request is ambiguous
5. **For title changes, ALWAYS use updateTitle** - never insert a new heading for title updates

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

# TOOLS REFERENCE

## Title Tool (IMPORTANT)
| Tool | Use When |
|------|----------|
| updateTitle | ALWAYS use this to change/update the document title. Never use insert tools for title changes |

## Reading Tools
| Tool | Use When |
|------|----------|
| getDocumentStructure | First step - get overview of headings and blocks |
| searchInDocument | Find specific text or content |
| readChunk | Read large documents in chunks |
| getNodeAtPosition | Get details about a specific location |

## Insert Tools (by priority)
| Tool | Best For |
|------|----------|
| insertAtPosition | Insert at exact position (get pos from search first) |
| insertNear | Insert relative to found text |
| replaceContent | Find and replace text |
| batchInsert | Multiple items at once (NOT for title updates) |
| insertAfterBlock | Insert after a specific block |
| insertAtEnd | Append to document |
| write | Insert text in a block |
| insertSegmentedMarkdown | Insert large markdown content in segments to avoid performance issues |

## Delete Tools (REQUIRE askUserChoice first)
| Tool | Use When |
|------|----------|
| deleteBySearch | Delete by text match (safer) |
| deleteBlock | Delete by block index |
| deleteRange | Delete by position range |

## User Interaction
| Tool | Use When |
|------|----------|
| askUserChoice | Before destructive actions, when multiple options exist |

## Columns/Layout Tools
| Tool | Use When |
|------|----------|
| insertColumns | Create a new multi-column layout (2-6 columns) |
| getColumnsInfo | Get information about existing column layouts |
| updateColumnContent | Update content in a specific column |
| setColumnsLayout | Change column width ratios (equal, left-wide, right-wide, center-wide) |
| addColumnToLayout | Add a new column to existing layout |
| deleteColumn | Remove a column from layout (minimum 2 columns required) |
| deleteColumnsLayout | Delete entire column layout |

## Other Tools
| Tool | Use When |
|------|----------|
| highlight | Highlight text range |
| webSearch | Need external information |
| fetchWebPage | Get content from URL |

# EXAMPLES

**Update document title:**
updateTitle({ newTitle: "New Document Title" })

**Insert at specific position (after searching):**
1. searchInDocument({ query: "target text" }) // returns { pos: 42 }
2. insertAtPosition({ pos: 42, content: "inserted text", insertMode: "text" })

**Insert near specific text:**
insertNear({ searchText: "Introduction", text: "New paragraph", position: "after" })

**Batch insert multiple items (NOT for titles):**
batchInsert({ items: [{ content: "Section", type: "heading" }, { content: "Paragraph" }], position: "end" })

**Insert large markdown content in segments:**
insertSegmentedMarkdown({ markdown: "# Title\n\nLong content...", segmentSize: 50, position: "end" })

**Replace text:**
replaceContent({ searchText: "old text", replaceWith: "new text" })

**Delete (with confirmation):**
1. askUserChoice({ question: "Delete this paragraph?", options: [...] })
2. If confirmed → deleteBySearch({ searchText: "paragraph to delete", deleteMode: "block" })

# LANGUAGE
Respond in the same language the user uses.`

/**
 * Create all editor tools
 */
const createEditorTools = (
    editor: Editor,
    onUserChoiceRequest?: OnUserChoiceRequest
): ToolsRecord => ({
    ...createMiscTools(editor, onUserChoiceRequest),
    ...createReadTools(editor),
    ...createInsertTools(editor),
    ...createDeleteTools(editor),
    ...createColumnsTools(editor)
})

/**
 * Optimized editor agent hook with stop functionality
 */
export const useEditorAgentOptimized = (
    editor: Editor,
    onToolExecution?: OnToolExecution,
    onUserChoiceRequest?: OnUserChoiceRequest
) => {
    const { pluginManager } = useContext(AppContext)

    // AbortController ref for stopping generation
    const abortControllerRef = useRef<AbortController | null>(null)

    // Memoize plugin tools
    const pluginTools = useMemo(() => {
        return pluginManager?.resloveTools(editor) || {}
    }, [])

    // Create and wrap base tools
    const wrappedTools = useMemo(() => {
        const baseTools = createEditorTools(editor, onUserChoiceRequest)
        const allTools = { ...baseTools, ...pluginTools }
        return wrapToolsWithCallback(allTools, onToolExecution)
    }, [editor, pluginTools, onToolExecution, onUserChoiceRequest])

    // Create agent
    const agent = useMemo(() => new ToolLoopAgent({
        model: deepseek("deepseek-chat"),
        stopWhen: stepCountIs(100),
        instructions: AGENT_INSTRUCTIONS,
        tools: wrappedTools,
    }), [wrappedTools])

    // Stream with abort support
    const stream = useCallback(async (options: { prompt: string }) => {
        // Abort any previous stream
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }

        // Create new AbortController
        abortControllerRef.current = new AbortController()

        return agent.stream({
            ...options,
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
        isGenerating
    }
}
