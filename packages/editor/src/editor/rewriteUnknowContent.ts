import type { Schema } from '@tiptap/pm/model'
import type { JSONContent } from '@tiptap/core'

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

/**
 * Shallow clone a JSONContent node (only copies own enumerable keys at one level).
 * Much faster than JSON.parse(JSON.stringify()) for large objects since it avoids
 * serialization/deserialization overhead.
 */
function shallowCloneJSON(obj: JSONContent): JSONContent {
    const clone: Record<string, unknown> = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            // For arrays and objects we keep the reference; rewriteUnknownContentInner
            // will recursively process nested content/marks arrays in place.
            clone[key] = (obj as Record<string, unknown>)[key];
        }
    }
    return clone as JSONContent;
}

/**
 * The actual implementation of the rewriteUnknownContent function
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
}): {
    /**
     * The cleaned JSON content
     */
    json: JSONContent | null
    /**
     * The array of nodes and marks that were rewritten
     */
    rewrittenContent: RewrittenContent
} {
    if (json && json.marks && Array.isArray(json.marks)) {
        json.marks = json.marks.filter(mark => {
            const name = typeof mark === 'string' ? mark : mark.type

            if (validMarks.has(name)) {
                return true
            }

            rewrittenContent.push({
                original: shallowCloneJSON(mark as JSONContent),
                unsupported: name,
            })
            // Just ignore any unknown marks
            return false
        })
    }

    if (json && json.content && Array.isArray(json.content)) {
        json.content = json.content
            .map(
                value =>
                    rewriteUnknownContentInner({
                        json: value,
                        validMarks,
                        validNodes,
                        options,
                        rewrittenContent,
                    }).json,
            )
            .filter(a => a !== null && a !== undefined) as JSONContent[]
    }

    if (json && json.type && !validNodes.has(json.type)) {
        rewrittenContent.push({
            original: shallowCloneJSON(json),
            unsupported: json.type,
        })
        // json.content && Array.isArray(json.content) &&
        if (options?.fallbackToParagraph !== false) {
            // Just treat it like a paragraph and hope for the best
            json.attrs = { ...json.attrs, nodeType: json.type }
            json.type = 'unknownNode'

            return {
                json,
                rewrittenContent,
            }
        }

        // or just omit it entirely
        return {
            json: null,
            rewrittenContent,
        }
    }

    if (json && json.type && json.type === "unknownNode" && validNodes.has(json.attrs?.nodeType)) {
        // json.content && Array.isArray(json.content) &&
        if (options?.fallbackToParagraph !== false) {
            // Just treat it like a paragraph and hope for the best
            // json.attrs = { name: json.type }
            json.type = json.attrs?.nodeType

            return {
                json,
                rewrittenContent,
            }
        }

        // or just omit it entirely
        return {
            json: null,
            rewrittenContent,
        }
    }

    return { json, rewrittenContent }
}

/**
 * Rewrite unknown nodes and marks within JSON content
 * Allowing for user within the editor
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
): {
    /**
     * The cleaned JSON content
     */
    json: JSONContent | null
    /**
     * The array of nodes and marks that were rewritten
     */
    rewrittenContent: {
        /**
         * The original JSON content that was rewritten
         */
        original: JSONContent
        /**
         * The name of the node or mark that was unsupported
         */
        unsupported: string
    }[]
} {
    return rewriteUnknownContentInner({
        json,
        validNodes: new Set(Object.keys(schema.nodes)),
        validMarks: new Set(Object.keys(schema.marks)),
        options,
    })
}