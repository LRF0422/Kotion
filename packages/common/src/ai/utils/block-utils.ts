import type { Editor } from "@tiptap/core"
import { Node as PmNode, type NodeType } from "@tiptap/pm/model"
import type { BlockInfo } from "../types"

/**
 * Discover all blocks in the document
 */
export const discoverBlocks = (editor: Editor): BlockInfo[] => {
    const blocks: BlockInfo[] = []
    editor.state.doc.descendants((node, pos) => {
        if (node.isBlock && node.type.name !== 'doc') {
            const fullText = node.textContent
            const blockInfo: BlockInfo = {
                pos,
                size: node.nodeSize,
                type: node.type.name,
                text: fullText.slice(0, 80) + (fullText.length > 80 ? '...' : ''),
                fullText,
                contentStart: pos,
                contentEnd: pos + node.nodeSize
            }

            if (node.isTextblock) {
                const $pos = editor.state.doc.resolve(pos + 1)
                blockInfo.contentStart = $pos.start()
                blockInfo.contentEnd = $pos.end()
            }

            if (node.type.name === 'heading') {
                blockInfo.level = node.attrs.level || 1
            }

            blocks.push(blockInfo)
        }
        return true
    })
    return blocks
}

/**
 * Find a block by text content.
 * Matches against the full block text (not the truncated preview) so long
 * blocks can still be located by a phrase that appears past the preview limit.
 */
export const findBlockByText = (
    blocks: BlockInfo[],
    searchText: string,
    occurrence: number = 1
): BlockInfo | null => {
    const searchLower = searchText.toLowerCase()
    let count = 0
    for (const block of blocks) {
        const haystack = (block.fullText ?? block.text).toLowerCase()
        if (haystack.includes(searchLower)) {
            count++
            if (count === occurrence) {
                return block
            }
        }
    }
    return null
}

/**
 * Find a block by heading text
 */
export const findBlockByHeading = (
    blocks: BlockInfo[],
    headingText: string,
    level?: number
): BlockInfo | null => {
    const searchLower = headingText.toLowerCase()
    for (const block of blocks) {
        if (block.type === 'heading') {
            if (level && block.level !== level) continue
            const haystack = (block.fullText ?? block.text).toLowerCase()
            if (haystack.includes(searchLower)) {
                return block
            }
        }
    }
    return null
}

/**
 * Find all textblocks in the document
 */
export const findTextBlocks = (editor: Editor): Array<{
    pos: number
    contentStart: number
    contentEnd: number
    type: string
    text: string
}> => {
    const textBlocks: Array<{
        pos: number
        contentStart: number
        contentEnd: number
        type: string
        text: string
    }> = []

    editor.state.doc.descendants((node, pos) => {
        if (node.isTextblock) {
            const $pos = editor.state.doc.resolve(pos + 1)
            textBlocks.push({
                pos,
                contentStart: $pos.start(),
                contentEnd: $pos.end(),
                type: node.type.name,
                text: node.textContent.slice(0, 50) + (node.textContent.length > 50 ? '...' : '')
            })
        }
        return true
    })

    return textBlocks
}

/**
 * Get text position information for a search match
 */
export const findTextPosition = (
    editor: Editor,
    searchText: string,
    occurrence: number = 1,
    caseSensitive: boolean = false
): { from: number; to: number; text: string } | null => {
    const doc = editor.state.doc
    const searchLower = caseSensitive ? searchText : searchText.toLowerCase()

    let matchCount = 0
    let result: { from: number; to: number; text: string } | null = null

    doc.descendants((node, pos) => {
        if (result) return false

        if (node.isTextblock) {
            const blockText = node.textContent
            const compareText = caseSensitive ? blockText : blockText.toLowerCase()
            let searchIdx = 0

            while ((searchIdx = compareText.indexOf(searchLower, searchIdx)) !== -1) {
                matchCount++

                if (matchCount === occurrence) {
                    // Calculate exact position
                    let charCount = 0
                    let textFrom = -1

                    node.forEach((child, offset) => {
                        if (textFrom !== -1) return

                        if (child.isText && child.text) {
                            const childStart = charCount
                            const childEnd = charCount + child.text.length

                            if (searchIdx >= childStart && searchIdx < childEnd) {
                                textFrom = pos + 1 + offset + (searchIdx - childStart)
                            }
                            charCount = childEnd
                        } else if (child.isLeaf) {
                            charCount += 1
                        }
                    })

                    if (textFrom !== -1) {
                        result = {
                            from: textFrom,
                            to: textFrom + searchText.length,
                            text: blockText.substring(searchIdx, searchIdx + searchText.length)
                        }
                        return false
                    }
                }

                searchIdx += 1
            }
        }
        return true
    })

    return result
}

/**
 * Snap an arbitrary ProseMirror position to a valid block-boundary
 * position for inserting a block-level node (e.g. chart, mermaid,
 * drawnix, excalidraw).
 *
 * The algorithm walks up the depth chain from the given position to
 * find the shallowest depth whose parent can accept the given node
 * type as a child, then snaps to the specified boundary of that level.
 *
 * @param editor   The TipTap editor instance
 * @param position The raw position (e.g. from searchInDocument)
 * @param nodeTypeName The schema node type name (e.g. 'chart', 'mermaid')
 * @param placement Optional override: 'before' snaps to blockStart,
 *                  'after' snaps to blockEnd. When omitted the old
 *                  midpoint heuristic is used (kept for backward compat).
 * @returns The snapped position suitable for insertContentAt
 */
export const snapToBlockBoundary = (
    editor: Editor,
    position: number,
    nodeTypeName: string,
    placement?: 'before' | 'after'
): number => {
    try {
        const $pos = editor.state.doc.resolve(position);
        const nodeType: NodeType | undefined = (editor.state.schema.nodes as Record<string, NodeType>)[nodeTypeName];

        // Walk from deepest to shallowest to find a depth where the
        // parent can accept the target node type as a child.
        let targetDepth = -1;
        for (let d = $pos.depth; d > 0; d--) {
            const parent = $pos.node(d);
            const index = $pos.index(d) + ($pos.pos > ($pos.start(d + 1) + $pos.end(d + 1)) / 2 ? 1 : 0);
            if (nodeType && parent.canReplaceWith(index, index, nodeType)) {
                targetDepth = d;
                break;
            }
        }

        if (targetDepth > 0) {
            const blockStart = $pos.before(targetDepth);
            const blockEnd = $pos.after(targetDepth);

            if (position === blockStart || position === blockEnd) {
                // Already at a boundary – keep as-is.
                return position;
            }

            // If an explicit placement is given, honour it.
            if (placement === 'before') return blockStart;
            if (placement === 'after') return blockEnd;

            // Fallback: snap toward whichever boundary is closer.
            // This gives intuitive results: if the agent's search hit
            // is near the start of a paragraph the chart lands *before*
            // it; if near the end it lands *after* it.
            const mid = (blockStart + blockEnd) / 2;
            return position <= mid ? blockStart : blockEnd;
        }

        // Fallback: insert at doc start or end.
        return $pos.pos <= $pos.start(0) / 2
            ? 0
            : editor.state.doc.content.size;
    } catch {
        // If resolve fails, return the raw position.
        return position;
    }
}

/**
 * Ensure a position is at a valid block boundary for inserting a block-level
 * node. If the position falls inside a block (e.g. within a paragraph), the
 * position is snapped to the boundary of that block so the new node is
 * inserted *after* the block rather than replacing or splitting it.
 *
 * @param editor       The TipTap editor instance
 * @param position     The candidate position
 * @param nodeTypeName The schema node type name being inserted
 * @returns A position that is guaranteed to be at a block boundary
 */
export const ensureBlockBoundary = (
    editor: Editor,
    position: number,
    nodeTypeName: string
): number => {
    try {
        const doc = editor.state.doc;
        // Clamp to valid range
        const pos = Math.max(0, Math.min(position, doc.content.size));

        // Fast path: if there's no node at pos, it's already a boundary
        const nodeAtPos = doc.nodeAt(pos);
        if (!nodeAtPos) return pos;

        // If the node at this position is the same type as the one we're
        // inserting, we're already at a block boundary.
        if (nodeAtPos.type.name === nodeTypeName) return pos;

        // If the position is right before a block-level node whose parent
        // can accept the target node type, it's already a valid boundary.
        const nodeType: NodeType | undefined = (editor.state.schema.nodes as Record<string, NodeType>)[nodeTypeName];
        const $pos = doc.resolve(pos);
        if ($pos.depth > 0) {
            const parent = $pos.parent;
            const index = $pos.index();
            if (nodeType && parent.canReplaceWith(index, index, nodeType)) {
                return pos;
            }
            // Position is inside a block — snap to after the parent block
            // so the new node is inserted as a sibling, not a replacement.
            return $pos.after();
        }

        return pos;
    } catch {
        return position;
    }
};

/**
 * Resolve the insertion position for a block-level node using one of
 * several strategies (nearText > blockIndex > raw position > default).
 *
 * This is the shared logic used by insertChart, insertMermaidDiagram,
 * insertDrawnix*, etc. so that every block-level plugin has the same
 * positioning API.
 *
 * IMPORTANT: The returned position is guaranteed to be at a valid block
 * boundary so that `insertContentAt` will insert alongside existing blocks
 * rather than replacing them.
 *
 * @returns The resolved ProseMirror position, or null if the caller
 *          should fall back to the editor command (cursor / doc end).
 */
export const resolveBlockInsertPosition = (
    editor: Editor,
    nodeTypeName: string,
    options: {
        nearText?: string;
        placement?: 'before' | 'after';
        blockIndex?: number;
        position?: number;
    }
): { pos: number; strategy: string } | null => {
    const { nearText, placement = 'after', blockIndex, position } = options;

    // Strategy 1: nearText — find the block containing the text
    if (nearText) {
        const blocks = discoverBlocks(editor);
        const foundBlock = findBlockByText(blocks, nearText);

        if (!foundBlock) {
            // Return a special marker so the caller can give a good error
            return { pos: -1, strategy: 'nearText-not-found' };
        }

        const insertPos = placement === 'before'
            ? foundBlock.pos
            : foundBlock.pos + foundBlock.size;

        // Verify the position is a valid block boundary
        const safePos = ensureBlockBoundary(editor, insertPos, nodeTypeName);
        return { pos: safePos, strategy: `nearText(${placement})` };
    }

    // Strategy 2: blockIndex — insert after the specified block
    if (blockIndex !== undefined) {
        const blocks = discoverBlocks(editor);
        if (blockIndex < 0 || blockIndex >= blocks.length) {
            return { pos: -1, strategy: 'blockIndex-out-of-range' };
        }
        const targetBlock = blocks[blockIndex];
        const insertPos = targetBlock.pos + targetBlock.size;
        // Verify the position is a valid block boundary
        const safePos = ensureBlockBoundary(editor, insertPos, nodeTypeName);
        return { pos: safePos, strategy: 'blockIndex' };
    }

    // Strategy 3: raw position with snapToBlockBoundary
    if (position !== undefined) {
        const docSize = editor.state.doc.nodeSize;
        if (position < 0 || position > docSize - 2) {
            return { pos: -1, strategy: 'position-out-of-range' };
        }
        const insertPos = snapToBlockBoundary(editor, position, nodeTypeName, placement);
        // Verify the position is a valid block boundary
        const safePos = ensureBlockBoundary(editor, insertPos, nodeTypeName);
        return { pos: safePos, strategy: 'position' };
    }

    // No positioning info — caller should use default (cursor / doc end)
    return null;
};

/**
 * Find all table nodes in the document
 */
export const findTablesInDocument = (editor: Editor): Array<{
    pos: number
    node: PmNode
    index: number
    rows: number
    cols: number
}> => {
    const results: Array<{
        pos: number
        node: PmNode
        index: number
        rows: number
        cols: number
    }> = []

    let index = 0
    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'table') {
            let rows = 0
            let cols = 0
            node.forEach((row) => {
                rows++
                if (rows === 1) {
                    cols = row.childCount
                }
            })
            results.push({ pos, node, index: index++, rows, cols })
            return false
        }
    })

    return results
}

/**
 * Find the position of a specific cell in a table
 */
export const findTableCellPosition = (
    tableNode: PmNode,
    tablePos: number,
    rowIndex: number,
    colIndex: number
): { pos: number; node: PmNode } | null => {
    let currentRow = 0
    let result: { pos: number; node: PmNode } | null = null

    // pos after the table opening tag
    let offset = tablePos + 1

    tableNode.forEach((row) => {
        if (result) return
        if (currentRow === rowIndex) {
            let currentCol = 0
            let colOffset = offset + 1 // +1 for row opening tag
            row.forEach((cell) => {
                if (result) return
                if (currentCol === colIndex) {
                    result = { pos: colOffset, node: cell }
                }
                colOffset += cell.nodeSize
                currentCol++
            })
        }
        offset += row.nodeSize
        currentRow++
    })

    return result
}
