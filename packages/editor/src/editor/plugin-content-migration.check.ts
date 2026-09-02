import type { JSONContent } from '@tiptap/core'
import { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model'
import {
  prosemirrorJSONToYXmlFragment,
  yXmlFragmentToProsemirrorJSON,
} from 'y-prosemirror'
import * as Y from 'yjs'
import {
  migratePluginContentInYDoc,
  PLUGIN_CONTENT_MIGRATION_ORIGIN,
} from './plugin-content-migration'
import { rewriteUnknownContent } from './rewriteUnknowContent'

let pass = 0
let fail = 0

function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) {
    pass++
    console.log('  ok   ' + name)
  } else {
    fail++
    console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''))
  }
}

function schemaError(schema: Schema, json: JSONContent | null | undefined): string | null {
  if (!json) return 'Missing JSON content'

  try {
    ProseMirrorNode.fromJSON(schema, json).check()
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

const commonNodes = {
  doc: { content: 'block+' },
  paragraph: {
    group: 'block',
    content: 'inline*',
    attrs: { id: { default: null } },
  },
  text: { group: 'inline' },
  unknownNode: {
    group: 'block',
    attrs: {
      nodeType: { default: null },
      data: { default: null },
      originalContent: { default: null },
    },
  },
  unknownInlineNode: {
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    attrs: {
      nodeType: { default: null },
      data: { default: null },
      originalContent: { default: null },
    },
  },
}

const withoutPlugin = new Schema({ nodes: commonNodes })
const withPlugin = new Schema({
  nodes: {
    ...commonNodes,
    pluginWidget: {
      group: 'block',
      content: 'paragraph*',
      attrs: {
        id: { default: null },
        data: { default: null },
        settings: { default: null },
      },
    },
  },
})

const withInlinePlugin = new Schema({
  nodes: {
    ...commonNodes,
    pluginInlineAtom: {
      group: 'inline',
      inline: true,
      atom: true,
      selectable: true,
      attrs: {
        id: { default: null },
        data: { default: null },
        settings: { default: null },
      },
    },
  },
})

const original: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { id: 'before' },
      content: [{ type: 'text', text: 'before' }],
    },
    {
      type: 'pluginWidget',
      attrs: {
        id: 'plugin-1',
        data: { source: 'demo' },
        settings: { color: 'blue', nested: { enabled: true } },
      },
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'inside' },
          content: [{ type: 'text', text: 'plugin content' }],
        },
      ],
    },
    {
      type: 'paragraph',
      attrs: { id: 'after' },
      content: [{ type: 'text', text: 'after' }],
    },
  ],
}

const inlineOriginal: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { id: 'inline-container' },
      content: [
        { type: 'text', text: 'before ' },
        {
          type: 'pluginInlineAtom',
          attrs: {
            id: 'inline-plugin-1',
            data: { source: 'inline-demo', nested: { count: 2 } },
            settings: { color: 'green', enabled: true },
          },
        },
        { type: 'text', text: ' after' },
      ],
    },
  ],
}

console.log('\nJSON conversion')

{
  const sourceSnapshot = JSON.stringify(original)
  const result = rewriteUnknownContent(original, withoutPlugin)
  const placeholder = result.json?.content?.[1]

  check('unsupported plugin node is rewritten', result.changed && placeholder?.type === 'unknownNode', result)
  check('source JSON is not mutated', JSON.stringify(original) === sourceSnapshot)
  check('placeholder keeps the runtime node type', placeholder?.attrs?.nodeType === 'pluginWidget', placeholder)
  check(
    'placeholder stores the complete original node',
    JSON.stringify(placeholder?.attrs?.originalContent) === JSON.stringify(original.content?.[1]),
    placeholder?.attrs?.originalContent,
  )

  const restored = result.json
    ? rewriteUnknownContent(result.json, withPlugin)
    : { json: null, changed: false }

  check('installing the plugin restores the node type', restored.changed && restored.json?.content?.[1]?.type === 'pluginWidget', restored)
  check(
    'restored plugin node exactly matches its original JSON',
    JSON.stringify(restored.json?.content?.[1]) === JSON.stringify(original.content?.[1]),
    restored.json?.content?.[1],
  )
}

{
  const legacy: JSONContent = {
    type: 'doc',
    content: [{
      type: 'unknownNode',
      attrs: {
        nodeType: 'pluginWidget',
        data: { source: 'legacy' },
      },
    }],
  }
  const restored = rewriteUnknownContent(legacy, withPlugin)
  const node = restored.json?.content?.[0]

  check('legacy placeholder still restores', node?.type === 'pluginWidget', node)
  check('legacy data attribute is preserved', node?.attrs?.data?.source === 'legacy', node)
  check('placeholder-only nodeType is removed on restore', node?.attrs?.nodeType === undefined, node)
}

console.log('\nInline JSON conversion')

{
  const sourceSnapshot = JSON.stringify(inlineOriginal)
  const result = rewriteUnknownContent(inlineOriginal, withoutPlugin)
  const inlineContent = result.json?.content?.[0]?.content
  const placeholder = inlineContent?.[1]
  const validationError = schemaError(withoutPlugin, result.json)

  check('inline migration produces valid schema content', validationError === null, validationError)
  check('inline migration preserves leading text', inlineContent?.[0]?.text === 'before ', inlineContent)
  check('unsupported inline atom uses the inline placeholder', placeholder?.type === 'unknownInlineNode', placeholder)
  check('inline migration preserves trailing text', inlineContent?.[2]?.text === ' after', inlineContent)
  check(
    'inline placeholder stores the complete original atom',
    JSON.stringify(placeholder?.attrs?.originalContent) === JSON.stringify(inlineOriginal.content?.[0]?.content?.[1]),
    placeholder?.attrs?.originalContent,
  )
  check('inline source JSON is not mutated', JSON.stringify(inlineOriginal) === sourceSnapshot)

  const repeated = result.json
    ? rewriteUnknownContent(result.json, withoutPlugin)
    : { json: null, changed: false }

  check('repeating inline JSON migration is a no-op', !repeated.changed, repeated)
  check(
    'repeated inline JSON migration leaves content unchanged',
    JSON.stringify(repeated.json) === JSON.stringify(result.json),
    repeated.json,
  )

  const restored = result.json
    ? rewriteUnknownContent(result.json, withInlinePlugin)
    : { json: null, changed: false }

  check('installing the inline plugin reports a restoration', restored.changed, restored)
  check(
    'installing the inline plugin restores the exact document JSON',
    JSON.stringify(restored.json) === JSON.stringify(inlineOriginal),
    restored.json,
  )
}

console.log('\nY.Doc migration')

{
  const doc = new Y.Doc()
  const fragment = doc.getXmlFragment('default')
  prosemirrorJSONToYXmlFragment(withPlugin, original, fragment)

  const migrationOrigins: unknown[] = []
  doc.on('afterTransaction', transaction => {
    if (transaction.changed.size > 0) migrationOrigins.push(transaction.origin)
  })

  const uninstalled = migratePluginContentInYDoc(doc, withoutPlugin)
  const afterUninstall = yXmlFragmentToProsemirrorJSON(fragment) as JSONContent
  const placeholder = afterUninstall.content?.[1]

  check('Y.Doc uninstall migration reports a change', uninstalled.changed, uninstalled)
  check('Y.Doc keeps all sibling blocks', afterUninstall.content?.length === 3, afterUninstall)
  check('Y.Doc replaces only the plugin node', placeholder?.type === 'unknownNode', placeholder)
  check('Y.Doc preserves the original plugin payload', placeholder?.attrs?.originalContent?.attrs?.id === 'plugin-1', placeholder)
  check('migration uses the dedicated system origin', migrationOrigins[0] === PLUGIN_CONTENT_MIGRATION_ORIGIN, migrationOrigins)

  const updatesAfterUninstall = migrationOrigins.length
  const repeatedUninstall = migratePluginContentInYDoc(doc, withoutPlugin)
  check('repeating the same migration is a no-op', !repeatedUninstall.changed, repeatedUninstall)
  check('no-op migration emits no Yjs update', migrationOrigins.length === updatesAfterUninstall, migrationOrigins)

  const installed = migratePluginContentInYDoc(doc, withPlugin)
  const afterInstall = yXmlFragmentToProsemirrorJSON(fragment) as JSONContent
  const restored = afterInstall.content?.[1]

  check('Y.Doc install migration reports a change', installed.changed, installed)
  check('Y.Doc restores the plugin node', restored?.type === 'pluginWidget', restored)
  check('Y.Doc restores plugin attributes', restored?.attrs?.settings?.nested?.enabled === true, restored)
  check('Y.Doc restores plugin child content', restored?.content?.[0]?.content?.[0]?.text === 'plugin content', restored)
  check('Y.Doc still has no duplicated siblings', afterInstall.content?.length === 3, afterInstall)

  const updatesAfterInstall = migrationOrigins.length
  const repeatedInstall = migratePluginContentInYDoc(doc, withPlugin)
  check('repeating install migration is a no-op', !repeatedInstall.changed, repeatedInstall)
  check('second install migration emits no Yjs update', migrationOrigins.length === updatesAfterInstall, migrationOrigins)
}

console.log('\nInline Y.Doc migration')

{
  const doc = new Y.Doc()
  const fragment = doc.getXmlFragment('default')
  prosemirrorJSONToYXmlFragment(withInlinePlugin, inlineOriginal, fragment)

  let updateCount = 0
  doc.on('afterTransaction', transaction => {
    if (transaction.changed.size > 0) updateCount++
  })

  const uninstalled = migratePluginContentInYDoc(doc, withoutPlugin)
  const afterUninstall = yXmlFragmentToProsemirrorJSON(fragment) as JSONContent
  const inlineContent = afterUninstall.content?.[0]?.content
  const placeholder = inlineContent?.[1]
  const uninstallValidationError = schemaError(withoutPlugin, afterUninstall)

  check('inline Y.Doc uninstall reports a change', uninstalled.changed, uninstalled)
  check('inline Y.Doc migration produces valid schema content', uninstallValidationError === null, uninstallValidationError)
  check(
    'inline Y.Doc keeps text around the placeholder',
    inlineContent?.length === 3
      && inlineContent[0]?.text === 'before '
      && inlineContent[2]?.text === ' after',
    inlineContent,
  )
  check('inline Y.Doc uses the inline placeholder', placeholder?.type === 'unknownInlineNode', placeholder)
  check(
    'inline Y.Doc preserves the complete original atom',
    JSON.stringify(placeholder?.attrs?.originalContent) === JSON.stringify(inlineOriginal.content?.[0]?.content?.[1]),
    placeholder?.attrs?.originalContent,
  )

  const updatesAfterUninstall = updateCount
  const repeatedUninstall = migratePluginContentInYDoc(doc, withoutPlugin)
  check('repeating inline Y.Doc uninstall is a no-op', !repeatedUninstall.changed, repeatedUninstall)
  check('inline Y.Doc uninstall no-op emits no update', updateCount === updatesAfterUninstall, updateCount)

  const installed = migratePluginContentInYDoc(doc, withInlinePlugin)
  const afterInstall = yXmlFragmentToProsemirrorJSON(fragment) as JSONContent
  const installValidationError = schemaError(withInlinePlugin, afterInstall)

  check('inline Y.Doc install reports a restoration', installed.changed, installed)
  check('restored inline Y.Doc is valid for the plugin schema', installValidationError === null, installValidationError)
  check(
    'inline Y.Doc reinstall restores the exact document JSON',
    JSON.stringify(afterInstall) === JSON.stringify(inlineOriginal),
    afterInstall,
  )

  const updatesAfterInstall = updateCount
  const repeatedInstall = migratePluginContentInYDoc(doc, withInlinePlugin)
  check('repeating inline Y.Doc install is a no-op', !repeatedInstall.changed, repeatedInstall)
  check('inline Y.Doc install no-op emits no update', updateCount === updatesAfterInstall, updateCount)
}

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
