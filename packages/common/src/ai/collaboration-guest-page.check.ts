/**
 * Executable checks for the collaboration guest page registry.
 *
 * The registry is the only way the agent's *other* page surfaces (hidden
 * off-screen editor, floating page window, page tools) can reach a
 * cross-tenant collaboration page. Its contract is small but load-bearing:
 * lookups normalize the id (the page id stringifies across the API boundary),
 * a re-registration replaces the previous capability, and a stale unregister
 * must never remove a newer one. `pnpm --filter @kn/common check:collab-guest`
 * compiles and runs this.
 */
import {
    getCollaborationGuestPage,
    registerCollaborationGuestPage,
    subscribeCollaborationGuestPage,
    type CollaborationGuestPageCapability,
} from './collaboration-guest-page'

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

const capability = (pageId: number, canEdit = true, title = 'doc'): CollaborationGuestPageCapability => ({
    pageId: String(pageId),
    canEdit,
    documents: {} as CollaborationGuestPageCapability['documents'],
    getCollabToken: () => JSON.stringify({ accessToken: 'a', invitationToken: 't' }),
    getPage: async () => ({ id: String(pageId), title } as any),
    title,
})

console.log('\ncollaboration guest page registry')

check('an unknown page has no capability', getCollaborationGuestPage('42') === undefined)
check('a null/undefined page id has no capability',
    getCollaborationGuestPage(null) === undefined && getCollaborationGuestPage(undefined) === undefined)

const unregisterFirst = registerCollaborationGuestPage(capability(42))
check('a registered capability is found by string id', getCollaborationGuestPage('42')?.pageId === '42')
check('lookup normalizes numeric ids', getCollaborationGuestPage(42)?.pageId === '42')
check('the capability keeps its fields', getCollaborationGuestPage('42')?.canEdit === true)

let notified = 0
const unsubscribe = subscribeCollaborationGuestPage(() => { notified++ })
registerCollaborationGuestPage(capability(42, false, 'renamed'))
check('re-registering replaces the capability', getCollaborationGuestPage('42')?.canEdit === false &&
    getCollaborationGuestPage('42')?.title === 'renamed')
check('subscribers are notified on registration', notified === 1, notified)

// The workspace deliberately does not unregister on route exit (an agent run may
// outlive the route). The unregister path still has to be safe when it is used:
// a stale cleanup must not delete a newer capability for the same page.
unregisterFirst()
check('a stale unregister does not remove the newer capability',
    getCollaborationGuestPage('42')?.title === 'renamed')

const unregisterSecond = registerCollaborationGuestPage(capability(43))
check('a second page is tracked independently', getCollaborationGuestPage('43')?.pageId === '43' &&
    getCollaborationGuestPage('42')?.pageId === '42')
unregisterSecond()
check('the current unregister removes its own capability',
    getCollaborationGuestPage('43') === undefined && getCollaborationGuestPage('42') !== undefined)
check('removal notifies subscribers', notified >= 3, notified)

unsubscribe()
const before = notified
registerCollaborationGuestPage(capability(44))
check('unsubscribed listeners stop firing', notified === before, notified)

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
