import type { Editor, Node } from "@kn/editor"
import type { DocumentStructure, NodeInfo } from "../types"
import { MAX_CHUNK_SIZE } from "../types"

/**
 * Build node information
 */
export const buildNodeInfo = (node: Node, pos: number, includeFullText: boolean = false): NodeInfo => {
    const info: NodeInfo = {
        from: pos,
        to: pos + node.nodeSize,
        position: pos,
        type: node.type.name,
        attrs: node.attrs,
        marks: node.marks,
        textContent: includeFullText ? node.textContent : undefined,
        nodeSize: node.nodeSize
    }

    if (node.isTextblock) {
        info.textStartPos = pos + 1
        info.textEndPos = pos + node.nodeSize - 1
    }

    return info
}

/**
 * Extract document structure
 */
export const extractDocumentStructure = (editor: Editor): DocumentStructure => {
    const headings: DocumentStructure['headings'] = []
    const blocks: DocumentStructure['blocks'] = []

    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
            headings.push({
                level: node.attrs.level || 1,
                text: node.textContent,
                pos,
                textInsertPos: pos + 1
            })
        }

        if (node.isBlock) {
            const blockInfo: DocumentStructure['blocks'][0] = {
                type: node.type.name,
                pos,
                size: node.nodeSize
            }

            if (node.isTextblock) {
                blockInfo.textInsertPos = pos + 1
            }

            blocks.push(blockInfo)
        }

        return true
    })

    return {
        totalSize: editor.state.doc.nodeSize,
        headings,
        blocks
    }
}

/**
 * Validate document range
 */
export const validateRange = (
    from: number,
    to: number | undefined,
    docSize: number
): { valid: boolean; error?: string } => {
    const maxPos = docSize - 2
    if (from < 0 || from > maxPos) {
        return { valid: false, error: `Invalid from position: ${from}. Document size: ${docSize}` }
    }
    if (to !== undefined && (to > maxPos || from >= to)) {
        return { valid: false, error: `Invalid range: ${from}-${to}. Document size: ${docSize}` }
    }
    return { valid: true }
}

/**
 * Calculate safe chunk size
 */
export const calculateChunkSize = (from: number, docSize: number): number => {
    const remaining = docSize - 2 - from
    return Math.min(MAX_CHUNK_SIZE, remaining)
}

/**
 * Get document size info
 */
export const getDocumentSizeInfo = (editor: Editor) => {
    return {
        size: editor.state.doc.nodeSize,
        from: 0,
        to: editor.state.doc.nodeSize - 2,
        recommendedChunkSize: MAX_CHUNK_SIZE
    }
}
