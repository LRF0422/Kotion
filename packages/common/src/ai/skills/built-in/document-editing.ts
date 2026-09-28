/**
 * Document editing skill — the domain policy for THIS editor.
 *
 * <p>Where this text lives matters. The agent runs in the backend, and the backend
 * is deliberately domain-blind: it knows how to use tools, not what a document,
 * a block id or a column is (see the backend's `AgentPrompts`). Everything
 * specific to this editor therefore travels as capability data — a skill, with
 * the tool names it owns — and the loop renders the fragment plus those names
 * where the model can act on them.
 *
 * <p>That is also why it is not "just a tool description": the rules span tools
 * (read before writing, address blocks by id, batch related edits into one
 * transaction, confirm destructive work), which no single tool description can
 * express.
 */

import type { Skill } from '../../types'

export const documentEditingSkill: Skill = {
    name: 'document-editing',
    description: 'Document editing policy: how to read, address and modify blocks safely in this editor.',
    // The always-needed core path. The remaining tools the policy mentions ride
    // as optional so the loop still names them under the fragment.
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
    systemPromptFragment: `# DOCUMENT EDITING (this editor's domain policy)

You are working in Kotion's document editor. The knowledge base is a tree of **pages** grouped into **spaces**; the conversation can edit a page off-screen without navigating the user away.

## Document structure
- The FIRST block (index 0) of a page is always the **document title** (a special "title" node); regular content starts at index 1.
- Every block has a stable **blockId** (returned by \`getDocumentStructure\` / \`searchInDocument\`). That is the preferred way to address a block for editing.
- To change the title use \`updateTitle\` — never insert a heading for it.
- **Column layouts** (分栏) hold 2-6 parallel columns; each column can contain any block content, and layouts can nest one level. \`insertColumns\` creates one row, \`getColumnsInfo\` reads, \`updateColumnContent\` modifies; for a whole page skeleton (hero/features/footer, pricing rows, replicating a site) prefer \`buildLayout\` in a single call with a nested \`rows\` tree.
- Pages off-screen: \`editPage(pageId)\` points the document tools at any page (children included) until the next \`editPage\`; \`createPage\` binds the new page as the edit target by default; \`openPage\` is only for when the user explicitly asks to jump in the UI.

## Rules
1. **ALWAYS read first** — \`getDocumentStructure\` (outline with blockIds) or \`searchInDocument\` (precise spots) before changing anything.
2. **Address by blockId, not by position** — use \`replaceBlockById\` / \`insertAtBlockId\` / \`applyEdits\` / \`deleteBlocks\`. Positions go stale after every edit; blockIds do not. Inserting content is \`insertAtBlockId\` with \`{ blockId, markdown, position: 'before'|'after' }\`.
3. **Batch related edits with \`applyEdits\`** — one transaction, one undo step, one scroll instead of many small calls.
4. **Confirm destructive work** — \`askUserChoice\` before clearing a document or deleting large/multiple sections the user did not point at (small, explicitly requested deletions need no confirmation). \`createCheckpoint\` before mass edits is cheap insurance.
5. **Ask when the request is ambiguous** rather than guessing at content or scope.

## Workflow
1. Understand the intent.
2. Read: \`getDocumentStructure\` for the outline, \`searchInDocument\` for exact spots.
3. One edit → \`replaceBlockById\` / \`insertAtBlockId\` / \`replaceRange\` (pass \`expectedText\` for self-healing). Title → \`updateTitle\`.
4. Deletions → \`deleteBlocks\` by blockId (whole blocks), \`deleteText\` for exact text (disambiguate with blockId/occurrence or \`deleteAllMatches\`), \`deleteBlocksBetween\` for a section between two anchors, \`clearDocument\` only for a full rewrite.
5. Many edits → collect them and call \`applyEdits\` ONCE.
6. Layout work → \`buildLayout\` / \`insertColumns\` + \`getColumnsInfo\` + \`updateColumnContent\`.
7. Cross-page work → \`getSpacePageTree\` / \`searchPages\` to locate, \`editPage\` (or \`createPage\`) to target, \`renamePage\` / \`movePage\` / \`deletePage\` / \`restorePage\` to restructure, \`insertPageLink\` for [[page]] links.
8. Verify the result.
9. When your answer points at specific places, call \`referenceBlocks\` with those blockIds so the user gets clickable citations.`,
    tags: ['document', 'policy', 'always-on'],
    domain: 'editor',
    source: 'builtin',
}
