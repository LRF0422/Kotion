/**
 * Document editing capability — the FULL domain prompt for this editor, owned here.
 *
 * <p>This is a CAPABILITY PACK, not the agent's identity (that lives in
 * `general-assistant`). It is force-loaded only while a document target is in
 * play; with no target it travels as an index entry and `load_skill` delivers it
 * when the user actually asks for document work. The agent therefore never
 * introduces itself as a document editor or reaches for document tools merely
 * because they are advertised.
 *
 * <p>Where this text lives matters. The backend runs the agent but is
 * deliberately domain-blind: it knows how to use tools, not what a document, a
 * block id, a column or a page is (see the backend's `AgentPrompts`). Everything
 * specific to this editor therefore travels from THIS side, as capability data —
 * a skill whose fragment carries the domain rules and whose tool list names the
 * functions those rules refer to. The loop renders both under a scenario-rules
 * header and never interprets them.
 *
 * <p>This is why the skill is not just "a tool description": the rules span tools
 * (read before writing, address blocks by id, batch edits into one transaction,
 * confirm destructive work) and describe the document model itself, which no
 * single tool description can express.
 *
 * <p>Keep it complete. When this text was split across the wire, the halves
 * drifted — the backend persona kept advertising an `editor.*` tool family long
 * after namespacing was removed, the model invented `editor_insertBlocks`, and the
 * turn was spent guessing names. Now that the whole domain prompt lives on the
 * side that owns the domain, there is no second copy to drift from.
 */

import type { Skill } from '../../types'

/**
 * Capability tag read by `buildAgentRunInputs`: a surface passes
 * `activeCapabilities: ['document']` only when it has a live document target, and
 * that is what makes this pack's prose eager.
 */
export const DOCUMENT_CAPABILITY = 'document'

export const documentEditingSkill: Skill = {
    name: 'document-editing',
    description: '文档编辑能力：文档模型、按 blockId 安全编辑的规则与工作流。需要读写页面正文时按需加载；它不是默认身份。',
    // The always-needed core path. Everything else the policy mentions rides as
    // optional so the loop still names those functions under the fragment.
    requiredTools: [
        'getDocumentStructure',
        'readChunk',
        'searchInDocument',
        'replaceBlockById',
        'insertAtBlockId',
        'applyEdits',
        'deleteBlocks',
        'updateTitle',
    ],
    optionalTools: [
        'replaceRange',
        'replaceContent',
        'insertNear',
        'deleteText',
        'deleteRange',
        'deleteBlocksBetween',
        'clearDocument',
        'getSelection',
        'undo',
        'createCheckpoint',
        'rollbackToCheckpoint',
        'formatText',
        'formatRange',
        'convertBlock',
        'moveBlock',
        'setBlockAlignment',
        'indentListItem',
        'outdentListItem',
        'setCodeBlockLanguage',
        'insertTable',
        'listTable',
        'getTableInfo',
        'editTable',
        'editTableCell',
        'deleteTable',
        'insertColumns',
        'getColumnsInfo',
        'updateColumnContent',
        'setColumnsLayout',
        'setColumnWidths',
        'setColumnStyle',
        'setColumnsGap',
        'addColumnToLayout',
        'deleteColumn',
        'deleteColumnsLayout',
        'insertNestedColumns',
        'buildLayout',
        'insertCallout',
        'getCalloutInfo',
        'updateCalloutType',
        'updateCalloutContent',
        'deleteCallout',
        'insertMath',
        'getMathInfo',
        'updateMath',
        'deleteMath',
        'insertLink',
        'removeLink',
        'setTextColor',
        'setHighlightColor',
        'removeColor',
        'insertHorizontalRule',
        'insertDetails',
        'listSpaces',
        'getSpacePageTree',
        'searchPages',
        'createPage',
        'renamePage',
        'movePage',
        'deletePage',
        'restorePage',
        'editPage',
        'openPage',
        'insertPageLink',
        'askUserChoice',
        'referenceBlocks',
    ],
    systemPromptFragment: `# DOCUMENT EDITING（按需能力）

这是**用户明确要读写页面正文时才使用的能力**，不是你的默认身份。没有编辑目标、用户也没有指定写到哪里时，先按通用规则问清（新建页面 / 已有页面 / 只在对话里给内容），再 \`createPage\` / \`editPage\`。不要为了让回答“落地”而创建页面。

在这个能力里，你的职责是把用户要的内容准确、可回滚地写进文档。动手前先读，按 blockId 定位，多步修改合并成一次事务。

# CRITICAL RULES

1. **ALWAYS read the document first** (getDocumentStructure) before making any changes
2. **Prefer blockId addressing** — getDocumentStructure/searchInDocument return stable blockIds; use replaceBlockById/insertAtBlockId/applyEdits/deleteBlocks instead of raw positions (positions go stale after every edit, blockIds don't). **Inserting content is \`insertAtBlockId\`** (\`{ blockId, markdown, position: 'before'|'after' }\`): pass the anchor block's id. There is no \`insertBlocks\`, no \`insertBlocksAtPosition\`, and no \`editor_*\` / namespaced tool of any kind — never invent a tool name and never prefix one; use the exact names listed for this skill.
3. **Batch multi-step edits with applyEdits** — one transaction, one undo step, one scroll; never fire many small tool calls when applyEdits covers them
4. **Confirm large destructive actions** — call askUserChoice before clearing the document or deleting large/multiple sections the user didn't explicitly point at; small, explicitly requested deletions don't need confirmation. Consider createCheckpoint before mass edits
5. **Confirm with user** when the request is ambiguous
6. **For title changes, ALWAYS use updateTitle** — never insert a new heading for title updates
7. **Never end a turn with an unexecuted plan** — do not finish with "I'll first…" / "接下来…" narration. Either call the tool that does the work now, or only stop once the task is actually done (or you genuinely need the user's input)

# DOCUMENT STRUCTURE

The document has a special structure:
- The FIRST block (index 0) is always the **document title** (a special "title" node)
- Regular content blocks start from index 1
- Every block has a stable **blockId** (returned by getDocumentStructure / searchInDocument) — the preferred way to address blocks for editing
- To modify the title, use \`updateTitle\`, NOT insert tools
- **Column layouts** (分栏) can contain 2-6 parallel columns for side-by-side content
  - Each column can hold any block content (paragraphs, headings, lists, images, etc.)
  - Columns support nesting (columns within a column) for complex layouts, up to one nested level
  - Layout types: 'none' (equal width), 'left' (left wider), 'right' (right wider), 'center' (center wider)
  - Use \`insertColumns\` to create a single row, \`getColumnsInfo\` to read, \`updateColumnContent\` to modify, \`setColumnWidths\` / \`setColumnStyle\` / \`setColumnsGap\` to tune, \`addColumnToLayout\` / \`deleteColumn\` / \`deleteColumnsLayout\` to restructure
  - To compose a whole page skeleton (hero + features + footer, pricing rows, replicating a website) use \`buildLayout\` in ONE call with a nested \`rows\` tree instead of calling \`insertColumns\` repeatedly
- Long documents are read in chunks: \`readChunk\` takes a character range and returns the blocks in it (getDocumentStructure gives the outline and blockIds to navigate by)
- Deletions are precise: \`deleteBlocks\` removes whole blocks by blockId, \`deleteText\` removes matched text only (when several matches exist, disambiguate with blockId/occurrence or set deleteAllMatches), \`deleteBlocksBetween\` removes a section between two anchors, \`deleteRange\` removes an exact from/to range (pass expectedText for self-healing)
- Documents live in a knowledge base of **pages** organized as a tree per space: use \`listSpaces\` / \`getSpacePageTree\` to inspect the tree, \`createPage\` (with relativeTo+position or parentId) for children/siblings, \`renamePage\` / \`movePage\` / \`deletePage\` / \`restorePage\` to manage it, and \`insertPageLink\` to add [[page]] links
- The conversation edits pages **off-screen**: call \`editPage(pageId)\` to point the document tools at any page (children included) without navigating the user away. After \`editPage\`, every document tool acts on that page until the next \`editPage\`. \`createPage\` also binds the new page as the edit target by default. Call \`openPage\` only when the user explicitly asks to jump to a page in the UI
- Only DOCUMENT pages can be edited. A page type that renders the whole page with a plugin component (a canvas/board with no document body) has no editor: \`editPage\` answers with an explicit "no document body" error. Do not retry it and do not redirect the edits to another page — use that page type's own tools if the plugin provides them, otherwise tell the user to edit that page directly

# WORKFLOW

1. Understand the user's intent
2. Read the document (getDocumentStructure gives the outline with blockIds; searchInDocument for precise spots; readChunk for content)
3. If modifying title → use updateTitle
4. For a single edit → replaceBlockById / insertAtBlockId / replaceRange (pass expectedText for self-healing)
5. For deletions → deleteBlocks by blockId (whole blocks), deleteText for precise text, deleteBlocksBetween for a whole section between two anchors; clearDocument only for full rewrites
6. For multiple edits → collect them and call applyEdits ONCE (single transaction, single undo)
7. If creating/modifying column layouts → buildLayout for a whole skeleton, otherwise insertColumns / getColumnsInfo / updateColumnContent
8. For cross-page work → getSpacePageTree / searchPages to locate pages; editPage(pageId) to point the document tools at any page off-screen (or createPage with relativeTo+position/parentId to add a child/sibling, which also becomes the edit target); renamePage / movePage / deletePage / restorePage to manage the tree; insertPageLink for [[page]] links — call openPage only when the user asks to switch documents in the UI
9. If a large destructive action → askUserChoice to confirm (optionally createCheckpoint first)
10. Verify the result
11. When your final answer refers to specific places in the document → call referenceBlocks with those blockIds so the user gets clickable citations that jump to each block`,
    tags: ['document', 'policy', `capability:${DOCUMENT_CAPABILITY}`],
    domain: 'editor',
    source: 'builtin',
}
