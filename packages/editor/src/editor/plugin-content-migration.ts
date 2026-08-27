import type { JSONContent } from '@tiptap/core'
import { Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model'
import {
    prosemirrorToYXmlFragment,
    yXmlFragmentToProsemirrorJSON,
} from 'y-prosemirror'
import * as Y from 'yjs'
import { rewriteUnknownContent } from './rewriteUnknowContent'

export const PLUGIN_CONTENT_MIGRATION_ORIGIN = Symbol('plugin-content-migration')

export type PluginContentMigrationResult = {
    changed: boolean
    rewrittenCount: number
}

/**
 * Rewrite plugin-backed nodes in an existing collaborative document for the
 * supplied schema. The original fragment is updated in place so Yjs can retain
 * matching structures instead of merging a second document into the room.
 */
export function migratePluginContentInYDoc(
    doc: Y.Doc,
    schema: Schema,
    fieldName = 'default',
): PluginContentMigrationResult {
    const fragment = doc.getXmlFragment(fieldName)

    if (fragment.length === 0) {
        return { changed: false, rewrittenCount: 0 }
    }

    const current = yXmlFragmentToProsemirrorJSON(fragment) as JSONContent
    const rewritten = rewriteUnknownContent(current, schema, {
        fallbackToParagraph: true,
    })

    if (!rewritten.changed || !rewritten.json) {
        return {
            changed: false,
            rewrittenCount: rewritten.rewrittenContent.length,
        }
    }

    const nextDocument = ProseMirrorNode.fromJSON(schema, rewritten.json)
    nextDocument.check()

    doc.transact(() => {
        prosemirrorToYXmlFragment(nextDocument, fragment)
    }, PLUGIN_CONTENT_MIGRATION_ORIGIN)

    return {
        changed: true,
        rewrittenCount: rewritten.rewrittenContent.length,
    }
}
