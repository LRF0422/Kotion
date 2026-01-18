import { AppContext } from "@kn/common"
import { Editor } from "@kn/editor"
import { stepCountIs, ToolLoopAgent } from "ai"
import { useContext, useMemo } from "react"
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

// Utils
import { wrapToolsWithCallback } from "./utils/tool-wrapper"

// Agent instructions
const AGENT_INSTRUCTIONS = `You are an intelligent document editing assistant. Help users edit, organize, and improve their documents.

# CRITICAL RULES

1. **ALWAYS read the document first** before making any changes
2. **NEVER delete content** without calling askUserChoice first
3. **Use search-based tools** (searchText) instead of position-based when possible
4. **Confirm with user** when the request is ambiguous

# WORKFLOW

1. Understand the user's intent
2. Read relevant document sections (getDocumentStructure, searchInDocument)
3. If destructive action → askUserChoice to confirm
4. Execute the operation
5. Verify the result

# TOOLS REFERENCE

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
| batchInsert | Multiple items at once |
| insertAfterBlock | Insert after a specific block |
| insertAtEnd | Append to document |
| write | Insert text in a block |

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

## Other Tools
| Tool | Use When |
|------|----------|
| highlight | Highlight text range |
| webSearch | Need external information |
| fetchWebPage | Get content from URL |

# EXAMPLES

**Insert at specific position (after searching):**
1. searchInDocument({ query: "target text" }) // returns { pos: 42 }
2. insertAtPosition({ pos: 42, content: "inserted text", insertMode: "text" })

**Insert near specific text:**
insertNear({ searchText: "Introduction", text: "New paragraph", position: "after" })

**Batch insert multiple items:**
batchInsert({ items: [{ content: "Title", type: "heading" }, { content: "Paragraph" }], position: "end" })

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
    ...createDeleteTools(editor)
})

/**
 * Optimized editor agent hook
 */
export const useEditorAgentOptimized = (
    editor: Editor,
    onToolExecution?: OnToolExecution,
    onUserChoiceRequest?: OnUserChoiceRequest
) => {
    const { pluginManager } = useContext(AppContext)

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

    return agent
}
