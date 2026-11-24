/**
 * Document-target invariants (no DOM / no React):
 *
 *  - the page-scoped claim registry hands out exactly the claimed editor,
 *    notifies on changes, and ignores destroyed instances;
 *  - a workspace run advertises document tools even before it has a document
 *    (the run's tool list is frozen at creation, but the agent can acquire a
 *    page mid-turn);
 *  - page-management tools are editor-free, so a lost target can always be
 *    recovered with editPage/createPage instead of being gated behind it.
 */
import {
    clearAgentEditors,
    findAgentEditor,
    getAgentEditor,
    listAgentEditors,
    registerAgentEditor,
    subscribeAgentEditors,
    unregisterAgentEditor,
} from './agent-editor-registry'
import { isSamePage, noDocumentTargetMessage, documentTargetUnavailableMessage } from './document-target'
import { agentToolAvailableAtScope, isDocumentToolCategory } from './kernel/filter-catalog'
import { getBuiltinToolMetadata, metadataNeedsEditor } from './discovery/tool-metadata'
import { isLiveEditor } from './plugin-agent/live-editor'
import {
    operationTargetFromArtifact,
    registerAgentOperationTargetProvider,
    resetAgentOperationTargetProviders,
    resolveAgentOperationTargets,
    unregisterAgentOperationTargetProvider,
} from './agent-operation-target'
import {
    clearPageNavigationBridge,
    setPageNavigationBridge,
} from './page-navigation-bridge'
import { createCurrentTargetTools } from './tools/target-tools'
import { clearActiveEditor, setActiveEditor } from '../core/active-editor'

function check(name: string, ok: boolean, extra?: unknown): void {
    if (!ok) {
        console.error(`✗ ${name}`, extra ?? '')
        throw new Error(`check failed: ${name}`)
    }
    console.log(`✓ ${name}`)
}

// ── Claim registry ──────────────────────────────────────────────────
clearAgentEditors()
const editorA = { isDestroyed: false, name: 'A' }
const editorB = { isDestroyed: false, name: 'B' }

let notifications = 0
const off = subscribeAgentEditors(() => { notifications += 1 })

const releaseA = registerAgentEditor({
    pageId: 'p1', editor: editorA, role: 'pane', title: 'One', spaceId: 's1',
})
check('register makes the claim visible', getAgentEditor('p1')?.editor === editorA)
check('numeric ids resolve too', getAgentEditor(1 as any) === undefined)
check('reverse lookup finds the page', findAgentEditor(editorA)?.pageId === 'p1')
check('claim metadata is preserved', getAgentEditor('p1')?.title === 'One')
check('registration notifies', notifications === 1)

// Re-registering the same editor/metadata is a no-op for subscribers.
releaseA()
check('unregister clears the claim', getAgentEditor('p1') === undefined)
check('unregister notifies', notifications === 2)
const releaseA2 = registerAgentEditor({ pageId: 'p1', editor: editorA, role: 'pane', title: 'One', spaceId: 's1' })
check('re-register notifies', notifications === 3)

// The newest editor for a page wins; a stale cleanup cannot drop it.
const releaseB = registerAgentEditor({ pageId: 'p1', editor: editorB, role: 'window', title: 'One' })
check('latest claim wins', getAgentEditor('p1')?.editor === editorB)
unregisterAgentEditor('p1', editorA)
check('stale identity cannot drop the current claim', getAgentEditor('p1')?.editor === editorB)
// A route tab and a side pane can show one page; closing the pane must reveal
// the tab's still-live claim instead of leaving the page unowned.
const releaseRoute = registerAgentEditor({ pageId: 'p3', editor: editorA, role: 'visible', title: 'Route' })
const releasePane = registerAgentEditor({ pageId: 'p3', editor: editorB, role: 'pane', title: 'Pane' })
check('newest visible claim is active', getAgentEditor('p3')?.editor === editorB)
releasePane()
check('closing the newest claim falls back to the older live one',
    getAgentEditor('p3')?.editor === editorA)
releaseRoute()
check('closing every claim releases the page', getAgentEditor('p3') === undefined)
releaseB()
check('current claim release works', getAgentEditor('p1') === undefined)

// A destroyed editor is not handed out (and is pruned).
registerAgentEditor({ pageId: 'p2', editor: { isDestroyed: true } })
check('destroyed editors are not claims', getAgentEditor('p2') === undefined)
check('destroyed claims are pruned', listAgentEditors().every(claim => claim.pageId !== 'p2'))

// The reverse lookup also refuses destroyed instances.
check('reverse lookup ignores destroyed editors', findAgentEditor({ isDestroyed: true }) === undefined)
check('isLiveEditor is the single liveness probe', isLiveEditor(editorA) && !isLiveEditor({ isDestroyed: true }))

off()
releaseA2()
clearAgentEditors()

// ── Page identity / messages ───────────────────────────────────────
check('same page by string/number', isSamePage('42', 42) && !isSamePage('42', '43'))
check('empty ids are never the same page', !isSamePage(undefined, undefined) && !isSamePage(null, '1'))
check('missing-target error names the recovery tools',
    noDocumentTargetMessage().includes('createPage') && noDocumentTargetMessage().includes('editPage'))
const unavailable = documentTargetUnavailableMessage({ pageId: 'p9', title: 'Report' }, new Error('not synced'))
check('unavailable error names the page', unavailable.includes('Report') && unavailable.includes('not synced'))
check('unavailable error refuses a silent fallback', unavailable.includes('不要改用当前页面'))

// ── Workspace scope advertises document tools before a target exists ─
const applyEdits = getBuiltinToolMetadata('applyEdits')
const write = getBuiltinToolMetadata('write')
const createPage = getBuiltinToolMetadata('createPage')
const editPage = getBuiltinToolMetadata('editPage')
const insertPageLink = getBuiltinToolMetadata('insertPageLink')

check('applyEdits is a document tool', isDocumentToolCategory(applyEdits?.category))
check('write is advertised without a document', agentToolAvailableAtScope(write, false))
check('applyEdits is advertised without a document', agentToolAvailableAtScope(applyEdits, false))
check('restorePage (page management) stays available', agentToolAvailableAtScope(getBuiltinToolMetadata('restorePage'), false))
check('unknown tools are unavailable', !agentToolAvailableAtScope(undefined, false))

// ── Editor-dependency classification ───────────────────────────────
check('applyEdits needs an editor', metadataNeedsEditor(applyEdits))
check('createPage is editor-free', metadataNeedsEditor(createPage) === false)
check('editPage is editor-free (the recovery path)', metadataNeedsEditor(editPage) === false)
check('insertPageLink needs an editor', metadataNeedsEditor(insertPageLink))
check('workspace page tools are editor-free',
    metadataNeedsEditor(getBuiltinToolMetadata('searchPages')) === false)
const currentTarget = getBuiltinToolMetadata('getCurrentTarget')
check('getCurrentTarget is available in every scope',
    currentTarget?.scope === 'any' && metadataNeedsEditor(currentTarget) === false)
check('getCurrentTarget survives the workspace scope filter',
    agentToolAvailableAtScope(currentTarget, false) === true)

// ── The route tab's visible editor claims its page ────────────────
setActiveEditor(editorA as any, { pageId: 'p-route', spaceId: 's1' })
check('the active route editor claims its page', getAgentEditor('p-route')?.editor === editorA)
clearActiveEditor('p-route', editorA as any)
check('clearing the active editor releases the claim', getAgentEditor('p-route') === undefined)

// ── Generic operation targets (page is just one provider) ─────────
setPageNavigationBridge({
    getCurrentPage: () => ({ pageId: 'p1', spaceId: 's1', title: 'Visible page' }),
    openPage: async () => { /* no navigation in checks */ },
})
const selectionEditor = {
    isDestroyed: false,
    state: {
        selection: { from: 1, to: 4, empty: false },
        doc: { textBetween: () => 'abc' },
    },
}
const binding = {
    bindPage: () => {},
    getBoundPage: () => ({ pageId: 'p2', title: 'Conversation page', spaceId: 's2' }),
    openPageWindow: () => {},
    getEditor: () => selectionEditor,
} as any

resetAgentOperationTargetProviders()
const pages = resolveAgentOperationTargets({ conversationId: 'c1', sessionBinding: binding })
check('page provider reports the conversation target first',
    pages[0]?.kind === 'page' && pages[0]?.id === 'p2' && pages[0]?.primary === true)
check('page provider also reports the visible page',
    pages.some(target => target.kind === 'page' && target.id === 'p1'))
check('page target exposes document operations',
    pages[0]?.operations?.some(operation => operation.tool === 'applyEdits') === true)
check('page target carries the live selection',
    pages[0]?.selection?.kind === 'text' && pages[0]?.selection?.text === 'abc')

// A plugin object is a first-class target, not a page fallback.
const unregisterFile = registerAgentOperationTargetProvider({
    id: 'test.file',
    priority: 120,
    getTargets: () => ({
        kind: 'file',
        id: 'f1',
        title: 'Budget.xlsx',
        summary: 'selected file',
        capabilities: ['file.read'],
        operations: [{ tool: 'readFile', description: 'read it' }],
    }),
})
const withFile = resolveAgentOperationTargets({ conversationId: 'c1', sessionBinding: binding })
check('a plugin target can outrank the page', withFile[0]?.kind === 'file' && withFile[0]?.primary === true)
check('the page remains available as a candidate', withFile.some(target => target.kind === 'page'))

// Same kind:id from two providers merges capabilities/operations.
registerAgentOperationTargetProvider({
    id: 'test.file.extra',
    priority: 10,
    getTargets: () => ({
        kind: 'file',
        id: 'f1',
        capabilities: ['file.preview'],
        operations: [{ tool: 'previewFile', description: 'preview it' }],
    }),
})
const merged = resolveAgentOperationTargets({ conversationId: 'c1', sessionBinding: binding })
const file = merged.find(target => target.kind === 'file' && target.id === 'f1')
check('same object is deduped', merged.filter(target => target.kind === 'file' && target.id === 'f1').length === 1)
check('merged file keeps both operations',
    !!file?.operations?.some(operation => operation.tool === 'readFile')
    && !!file?.operations?.some(operation => operation.tool === 'previewFile'))
check('merged file keeps both capabilities',
    !!file?.capabilities?.includes('file.read') && !!file?.capabilities?.includes('file.preview'))

// Conversation scoping: another conversation must not see c1's file.
const scopedProvider = registerAgentOperationTargetProvider({
    id: 'test.scoped',
    getTargets: context => context.conversationId === 'c1'
        ? { kind: 'row', id: 'r1', summary: 'only in c1' }
        : null,
})
check('providers can scope by conversation',
    resolveAgentOperationTargets({ conversationId: 'c1' }).some(target => target.kind === 'row'))
check('another conversation is not polluted',
    !resolveAgentOperationTargets({ conversationId: 'c2' }).some(target => target.kind === 'row'))
scopedProvider()

// A broken provider must not hide the page.
registerAgentOperationTargetProvider({
    id: 'test.broken',
    getTargets: () => { throw new Error('boom') },
})
const originalWarn = console.warn
const warned: unknown[][] = []
console.warn = (...args: unknown[]) => { warned.push(args) }
const afterBroken = resolveAgentOperationTargets({ conversationId: 'c1', sessionBinding: binding })
console.warn = originalWarn
check('a broken provider is isolated', afterBroken.some(target => target.kind === 'page'))
check('a broken provider is reported', warned.length > 0)
unregisterAgentOperationTargetProvider('test.broken')

// Artifact → generic target, including non-page kinds.
const artifactTarget = operationTargetFromArtifact({ kind: 'chart', id: 'ch1', title: 'Revenue' })
check('artifact target keeps its kind', artifactTarget.kind === 'chart' && artifactTarget.id === 'ch1')
check('non-page artifact is not treated as a document',
    !artifactTarget.capabilities?.includes('document.write'))
const pageArtifact = operationTargetFromArtifact({ kind: 'page', id: 'p2', title: 'Conversation page' })
check('page artifact exposes document operations',
    !!pageArtifact.operations?.some(operation => operation.tool === 'getDocumentStructure'))

// The agent-facing tool: cyclic attributes must not break serialization, and
// operations this run cannot call must be dropped.
const cyclic: Record<string, unknown> = { label: 'cycle' }
cyclic.self = cyclic
registerAgentOperationTargetProvider({
    id: 'test.cyclic',
    priority: 200,
    getTargets: () => ({
        kind: 'thing',
        id: 'x1',
        title: 'Cyclic',
        attributes: { cyclic },
        operations: [{ tool: 'someTool', description: 'does something' }],
    }),
})

const runToolChecks = async (): Promise<void> => {
    const tools = createCurrentTargetTools() as any
    const result = await tools.getCurrentTarget.execute(
        { includeAll: true },
        'check-call',
        {
            conversationId: 'c1',
            sessionBinding: binding,
            isToolAvailable: (name: string) => name !== 'applyEdits',
        },
    )
    check('tool returns a primary target', result.primary?.kind === 'thing')
    check('tool sanitizes cyclic attributes', result.primary?.attributes?.cyclic?.label === 'cycle')
    const pageView = result.targets.find((target: any) => target.kind === 'page' && target.id === 'p2')
    check('tool drops operations the run cannot call',
        !!pageView && !pageView.operations.some((operation: any) => operation.tool === 'applyEdits'))
    check('tool keeps callable operations',
        !!pageView?.operations?.some((operation: any) => operation.tool === 'getDocumentStructure'))
}

runToolChecks()
    .then(() => {
        unregisterFile()
        unregisterAgentOperationTargetProvider('test.file.extra')
        unregisterAgentOperationTargetProvider('test.broken')
        unregisterAgentOperationTargetProvider('test.cyclic')
        resetAgentOperationTargetProviders()
        clearPageNavigationBridge()
        console.log('document-target check: OK')
    })
    .catch(error => {
        console.error(error)
        process.exitCode = 1
    })