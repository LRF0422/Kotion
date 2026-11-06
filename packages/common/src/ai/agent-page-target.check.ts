/**
 * Executable checks for the unified agent page model.
 *
 * `resolveAgentPageTarget` is the single place that decides which authority
 * (tenant-scoped service vs invitation-token guest capability) the agent's page
 * operations use, and what the page's access is. These checks pin the merge
 * rules: the guest capability wins for its page, the visible page is resolved
 * when no id is passed, explicit ids fall back to the workspace authority, and
 * `open` uses the surface-provided navigation. `pnpm --filter @kn/common
 * check:agent-page` compiles and runs this.
 */
import {
    clearPageNavigationBridge,
    setPageNavigationBridge,
    type PageNavigationBridge,
} from './page-navigation-bridge'
import {
    registerCollaborationGuestPage,
    type CollaborationGuestPageCapability,
} from './collaboration-guest-page'
import { resolveAgentPageTarget, subscribeAgentPageTargets } from './agent-page-target'

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

const bridge = (pageId: string | undefined, opened: string[] = []): PageNavigationBridge => ({
    getCurrentPage: () => (pageId == null ? {} : { pageId, spaceId: 's1', title: 'T' }),
    openPage: (id) => { opened.push(String(id)) },
})

const guestCapability = (
    pageId: string,
    canEdit: boolean,
    title: string,
    open?: () => void,
): CollaborationGuestPageCapability => ({
    pageId,
    spaceId: 'host-space',
    title,
    canEdit,
    documents: { marker: pageId } as unknown as CollaborationGuestPageCapability['documents'],
    getCollabToken: () => '{"accessToken":"a","invitationToken":"t"}',
    getPage: async () => ({ id: pageId, title } as any),
    open,
})

console.log('\nagent page target')

check('with no visible page and no id there is no target',
    resolveAgentPageTarget() === undefined && resolveAgentPageTarget(null) === undefined)

setPageNavigationBridge(bridge('p1'))
const visible = resolveAgentPageTarget()
check('the visible page resolves as the implicit target', visible?.pageId === 'p1', visible)
check('a normal page uses the workspace authority',
    visible?.source === 'workspace' && visible.isGuest === false && visible.canEdit === true, visible)
check('the visible page carries its context', visible?.spaceId === 's1' && visible?.title === 'T', visible)
check('resolving the same page again reuses the same target object',
    resolveAgentPageTarget() === visible && resolveAgentPageTarget('p1') === visible)

const explicitTenant = resolveAgentPageTarget(42)
check('an explicit id resolves too (normalized to string)',
    explicitTenant?.pageId === '42' && explicitTenant.source === 'workspace', explicitTenant)
check('an explicit page has no visible-page context',
    explicitTenant?.spaceId === undefined && explicitTenant?.title === undefined, explicitTenant)

let notified = 0
const unsubscribe = subscribeAgentPageTargets(() => { notified++ })

let guestOpened = 0
const guest = guestCapability('p1', false, 'shared', () => { guestOpened++ })
const unregisterGuest = registerCollaborationGuestPage(guest)
const guestTarget = resolveAgentPageTarget()
check('a guest capability wins over the workspace authority for its page',
    guestTarget?.source === 'collaboration-guest' && guestTarget.isGuest === true, guestTarget)
check('the guest target carries invitation access',
    guestTarget?.canEdit === false && guestTarget?.title === 'shared' && guestTarget?.spaceId === 'host-space',
    guestTarget)
check('the guest target exposes the invitation document capability',
    guestTarget?.documents === guest.documents, guestTarget?.documents)
check('the guest target rebuilds the room auth envelope',
    guestTarget != null && guestTarget.getCollabToken().includes('invitationToken'),
    guestTarget?.getCollabToken())

const opened: string[] = []
setPageNavigationBridge(bridge('p1', opened))
resolveAgentPageTarget()?.open()
check('a guest target navigates through its own open() when provided', guestOpened === 1 && opened.length === 0,
    { guestOpened, opened })

// A guest target without an explicit open() falls back to the visible bridge
// only when that bridge is already showing the page (the guest route is not
// reachable from a workspace bridge).
const plainGuest = guestCapability('p9', true, 'no-open')
const unregisterPlain = registerCollaborationGuestPage(plainGuest)
opened.length = 0
setPageNavigationBridge(bridge('p9', opened))
resolveAgentPageTarget()?.open()
check('a guest without open() falls back to the bridge showing that page', opened.join(',') === 'p9', opened)
unregisterPlain()

check('subscribers are notified when a capability appears', notified >= 1, notified)

unregisterGuest()
const backToWorkspace = resolveAgentPageTarget()
check('removing the capability restores the workspace authority',
    backToWorkspace?.source === 'workspace' && backToWorkspace.isGuest === false, backToWorkspace)

unsubscribe()
clearPageNavigationBridge()
check('clearing the visible page leaves no implicit target', resolveAgentPageTarget() === undefined)

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
