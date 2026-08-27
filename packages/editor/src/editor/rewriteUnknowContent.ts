import type { JSONContent } from '@tiptap/core'
import type { Schema } from '@tiptap/pm/model'

type RewriteUnknownContentOptions = {
    /**
     * If true, unknown nodes will be treated as paragraphs
     * @default true
     */
    fallbackToParagraph?: boolean
}

type RewrittenContent = {
    /**
     * The original JSON content that was rewritten
     */
    original: JSONContent
    /**
     * The name of the node or mark that was unsupported
     */
    unsupported: string
}[]

type RewriteResult = {
    /**
     * The cleaned JSON content
     */
    json: JSONContent | null
    /**
     * The array of nodes and marks that were rewritten
     */
    rewrittenContent: RewrittenContent
    /**
     * Whether the returned JSON differs from the input
     */
    changed: boolean
}

const UNKNOWN_NODE_TYPE = 'unknownNode'
const ORIGINAL_CONTENT_ATTR = 'originalContent'

function cloneValue<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map(item => cloneValue(item)) as T
    }

    if (value && typeof value === 'object') {
        const clone: Record<string, unknown> = {}
        Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
            clone[key] = cloneValue(item)
        })
        return clone as T
    }

    return value
}

function isJSONContent(value: unknown): value is JSONContent {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function restoreUnknownNode(json: JSONContent, nodeType: string): JSONContent {
    const originalContent = json.attrs?.[ORIGINAL_CONTENT_ATTR]

    if (isJSONContent(originalContent) && originalContent.type === nodeType) {
        return cloneValue(originalContent)
    }

    const attrs = cloneValue(json.attrs ?? {})
    delete attrs.nodeType
    delete attrs[ORIGINAL_CONTENT_ATTR]

    return {
        ...cloneValue(json),
        type: nodeType,
        attrs: Object.keys(attrs).length > 0 ? attrs : undefined,
    }
}

/**
 * The actual implementation of the rewriteUnknownContent function.
 * The traversal is non-mutating so callers can safely retain their source JSON.
 */
function rewriteUnknownContentInner({
    json,
    validMarks,
    validNodes,
    options,
    rewrittenContent = [],
}: {
    json: JSONContent
    validMarks: Set<string>
    validNodes: Set<string>
    options?: RewriteUnknownContentOptions
    rewrittenContent?: RewrittenContent
}): RewriteResult {
    const nodeType = json.attrs?.nodeType

    if (
        json.type === UNKNOWN_NODE_TYPE
        && typeof nodeType === 'string'
        && validNodes.has(nodeType)
    ) {
        if (options?.fallbackToParagraph === false) {
            return {
                json: null,
                rewrittenContent,
                changed: true,
            }
        }

        const restored = restoreUnknownNode(json, nodeType)
        const result = rewriteUnknownContentInner({
            json: restored,
            validMarks,
            validNodes,
            options,
            rewrittenContent,
        })

        return {
            ...result,
            changed: true,
        }
    }

    if (json.type && !validNodes.has(json.type)) {
        const original = cloneValue(json)
        rewrittenContent.push({
            original,
            unsupported: json.type,
        })

        if (options?.fallbackToParagraph === false) {
            return {
                json: null,
                rewrittenContent,
                changed: true,
            }
        }

        return {
            json: {
                type: UNKNOWN_NODE_TYPE,
                attrs: {
                    nodeType: json.type,
                    data: cloneValue(json.attrs?.data ?? null),
                    [ORIGINAL_CONTENT_ATTR]: original,
                },
            },
            rewrittenContent,
            changed: true,
        }
    }

    const result = cloneValue(json)
    let changed = false

    if (Array.isArray(json.marks)) {
        const marks = json.marks
            .filter(mark => {
                const name = typeof mark === 'string' ? mark : mark.type

                if (validMarks.has(name)) {
                    return true
                }

                rewrittenContent.push({
                    original: cloneValue(mark as JSONContent),
                    unsupported: name,
                })
                changed = true
                return false
            })
            .map(mark => cloneValue(mark))

        result.marks = marks
    }

    if (Array.isArray(json.content)) {
        const content: JSONContent[] = []

        json.content.forEach(value => {
            const childResult = rewriteUnknownContentInner({
                json: value,
                validMarks,
                validNodes,
                options,
                rewrittenContent,
            })
            changed = changed || childResult.changed
            if (childResult.json) {
                content.push(childResult.json)
            }
        })

        result.content = content
    }

    return {
        json: result,
        rewrittenContent,
        changed,
    }
}

/**
 * Rewrite unknown nodes and marks within JSON content so it can be loaded by the
 * supplied schema. Unsupported nodes retain their complete source JSON and can
 * therefore be restored when their plugin becomes available again.
 */
export function rewriteUnknownContent(
    /**
     * The JSON content to clean of unknown nodes and marks
     */
    json: JSONContent,
    /**
     * The schema to use for validation
     */
    schema: Schema,
    /**
     * Options for the cleaning process
     */
    options?: RewriteUnknownContentOptions,
): RewriteResult {
    return rewriteUnknownContentInner({
        json,
        validNodes: new Set(Object.keys(schema.nodes)),
        validMarks: new Set(Object.keys(schema.marks)),
        options,
    })
}
