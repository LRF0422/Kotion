import type { Node as PmNode } from '@tiptap/pm/model'

/**
 * Precise text search over a ProseMirror document.
 *
 * Legacy helpers (findTextPosition, the old deleteBySearch) mapped
 * `textContent` indices onto doc positions with `pos + 1 + index`. That
 * breaks as soon as a textblock contains inline atoms (images, mentions,
 * hard breaks occupy a doc position but contribute no searchable text) or
 * the match spans a mark boundary across sibling text nodes.
 *
 * This implementation flattens each textblock's inline content while keeping
 * an exact per-character → doc-position map, so every returned range points
 * at the exact characters matched, regardless of marks or atoms in between.
 */

export interface TextMatch {
    /** Absolute doc position of the first matched character. */
    from: number
    /** Absolute doc position after the last matched character. */
    to: number
    /** The matched text, original case. */
    text: string
    /** Surrounding text (~40 chars each side) for disambiguation. */
    context: string
    /** Position of the containing textblock. */
    blockPos: number
    /** End position of the containing textblock. */
    blockTo: number
    blockType: string
    /** Stable id of the containing textblock, when it has one. */
    blockId?: string
}

export interface FindTextOptions {
    caseSensitive?: boolean
    /** Restrict matches to textblocks inside [scopeFrom, scopeTo). */
    scopeFrom?: number
    scopeTo?: number
    /** Stop after this many matches. */
    limit?: number
}

/**
 * Placeholder for non-text inline content (images, mentions, hard breaks...).
 * User-supplied search text never contains it, so matches can never span
 * an inline atom whose characters have no deletable text representation.
 */
const INLINE_ATOM_CHAR = '\uFFFC'

const CONTEXT_CHARS = 40

/**
 * Lowercase per character while keeping the string length identical, so
 * match indices stay aligned with the un-lowercased flat text (a few chars
 * like 'İ' expand under toLowerCase() and would shift every later position).
 */
const toLowerAligned = (s: string): string => {
    let out = ''
    for (const ch of s) {
        const lower = ch.toLowerCase()
        out += lower.length === ch.length ? lower : ch
    }
    return out
}

/**
 * Find every occurrence of `searchText` in the document.
 *
 * Matches never cross textblock boundaries (each block is flattened
 * separately) and never overlap (scanning resumes at the end of a match).
 */
export const findTextMatchesInDoc = (
    doc: PmNode,
    searchText: string,
    options: FindTextOptions = {}
): TextMatch[] => {
    const { caseSensitive = false, scopeFrom, scopeTo, limit = Number.POSITIVE_INFINITY } = options

    if (!searchText) return []

    const needle = caseSensitive ? searchText : toLowerAligned(searchText)
    const matches: TextMatch[] = []

    doc.descendants((node, pos) => {
        if (matches.length >= limit) return false

        // Prune subtrees that don't intersect the requested scope.
        if (
            scopeFrom !== undefined &&
            scopeTo !== undefined &&
            (pos + node.nodeSize <= scopeFrom || pos >= scopeTo)
        ) {
            return false
        }

        if (!node.isTextblock) return true

        // Flatten inline content with an exact char → position map: text
        // children map 1:1, every other inline child becomes a placeholder
        // occupying its start position.
        let flat = ''
        const charPos: number[] = []
        node.forEach((child, offset) => {
            const base = pos + 1 + offset
            if (child.isText && child.text) {
                for (let i = 0; i < child.text.length; i++) {
                    charPos.push(base + i)
                }
                flat += child.text
            } else {
                charPos.push(base)
                flat += INLINE_ATOM_CHAR
            }
        })

        const hay = caseSensitive ? flat : toLowerAligned(flat)
        let index = 0
        while (matches.length < limit) {
            const found = hay.indexOf(needle, index)
            if (found === -1) break
            const end = found + needle.length

            matches.push({
                from: charPos[found],
                to: charPos[end - 1] + 1,
                text: flat.slice(found, end),
                context: flat
                    .slice(Math.max(0, found - CONTEXT_CHARS), Math.min(flat.length, end + CONTEXT_CHARS))
                    .split(INLINE_ATOM_CHAR)
                    .join(' '),
                blockPos: pos,
                blockTo: pos + node.nodeSize,
                blockType: node.type.name,
                blockId: (node.attrs?.id ?? node.attrs?.blockId) || undefined,
            })

            index = end // non-overlapping matches
        }

        return false // textblocks contain no nested textblocks
    })

    return matches
}
