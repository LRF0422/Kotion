import type { Editor } from "@kn/editor"
import type { BlockInfo } from "../types"

/**
 * Discover all blocks in the document
 */
export const discoverBlocks = (editor: Editor): BlockInfo[] => {
    const blocks: BlockInfo[] = []
    editor.state.doc.descendants((node, pos) => {
        if (node.isBlock && node.type.name !== 'doc') {
            const blockInfo: BlockInfo = {
                pos,
                size: node.nodeSize,
                type: node.type.name,
                text: node.textContent.slice(0, 80) + (node.textContent.length > 80 ? '...' : ''),
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
 * Find a block by text content
 */
export const findBlockByText = (
    blocks: BlockInfo[],
    searchText: string,
    occurrence: number = 1
): BlockInfo | null => {
    const searchLower = searchText.toLowerCase()
    let count = 0
    for (const block of blocks) {
        if (block.text.toLowerCase().includes(searchLower)) {
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
            if (block.text.toLowerCase().includes(searchLower)) {
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
