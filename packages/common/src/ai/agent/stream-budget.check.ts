import { strict as assert } from 'node:assert'
import {
    acquireAgentStreamSlot,
    agentStreamBudgetSnapshot,
    configureAgentStreamBudget,
    resetAgentStreamBudget,
} from './stream-budget'

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

async function checkQueuesBeyondLimit(): Promise<void> {
    resetAgentStreamBudget()
    configureAgentStreamBudget({ maxConcurrentStreams: 2, reservedForRootStreams: 1 })
    const first = await acquireAgentStreamSlot('root')
    const second = await acquireAgentStreamSlot('child')
    assert.equal(agentStreamBudgetSnapshot().active, 2)

    let thirdGranted = false
    const third = acquireAgentStreamSlot('child').then(release => {
        thirdGranted = true
        return release
    })
    await tick()
    assert.equal(thirdGranted, false, 'a stream beyond the cap must queue')
    assert.equal(agentStreamBudgetSnapshot().queuedChild, 1)

    first()
    await tick()
    assert.equal(thirdGranted, false, 'freeing a root slot must not admit a child past its cap')
    second()
    const thirdRelease = await third
    assert.equal(thirdGranted, true, 'a freed child slot admits the queued child')
    assert.equal(agentStreamBudgetSnapshot().active, 1)
    thirdRelease()
    assert.equal(agentStreamBudgetSnapshot().active, 0)
}

async function checkRootReserve(): Promise<void> {
    resetAgentStreamBudget()
    // max 3, reserve 1 → children cap at 2.
    configureAgentStreamBudget({ maxConcurrentStreams: 3, reservedForRootStreams: 1 })
    assert.equal(agentStreamBudgetSnapshot().childLimit, 2)

    const childA = await acquireAgentStreamSlot('child')
    const childB = await acquireAgentStreamSlot('child')
    let childC: (() => void) | null = null
    const childCPromise = acquireAgentStreamSlot('child').then(release => { childC = release })

    // The reserved slot is still there for the conversation.
    const root = await acquireAgentStreamSlot('root')
    assert.equal(agentStreamBudgetSnapshot().active, 3, 'root takes the reserved slot immediately')

    childA()
    await childCPromise
    assert.notEqual(childC, null, 'a freed child slot admits the waiting child')
    ;(childC as unknown as () => void)()
    root()
    childB()
    assert.equal(agentStreamBudgetSnapshot().active, 0)
}

async function checkRootPriorityOverQueuedChild(): Promise<void> {
    resetAgentStreamBudget()
    // max 3, reserve 1 → childLimit 2, so a queued child CAN be admitted later.
    configureAgentStreamBudget({ maxConcurrentStreams: 3, reservedForRootStreams: 1 })
    const rootA = await acquireAgentStreamSlot('root')
    const childA = await acquireAgentStreamSlot('child')
    const childB = await acquireAgentStreamSlot('child')
    assert.equal(agentStreamBudgetSnapshot().active, 3)

    let childGranted = false
    let rootGranted = false
    // A child is queued first, then a root: the root must jump the queue.
    const childC = acquireAgentStreamSlot('child').then(release => { childGranted = true; return release })
    const rootB = acquireAgentStreamSlot('root').then(release => { rootGranted = true; return release })
    await tick()
    assert.equal(childGranted, false)
    assert.equal(rootGranted, false)

    childA()
    const rootBRelease = await rootB
    assert.equal(rootGranted, true, 'a freed slot goes to the root before an earlier-queued child')
    assert.equal(childGranted, false, 'the child stays queued while the root holds the slot')

    rootBRelease()
    const childCRelease = await childC
    assert.equal(childGranted, true)
    rootA()
    childB()
    childCRelease()
    assert.equal(agentStreamBudgetSnapshot().active, 0)
}

async function checkAbortRemovesWaiter(): Promise<void> {
    resetAgentStreamBudget()
    configureAgentStreamBudget({ maxConcurrentStreams: 1, reservedForRootStreams: 0 })
    const held = await acquireAgentStreamSlot('root')

    const controller = new AbortController()
    const waiting = acquireAgentStreamSlot('child', controller.signal).then(
        () => { throw new Error('aborted waiter must not be granted') },
        (error: Error) => error,
    )
    await tick()
    assert.equal(agentStreamBudgetSnapshot().queued, 1)

    controller.abort()
    const error = await waiting
    assert.equal(error.name, 'AbortError')
    assert.equal(agentStreamBudgetSnapshot().queued, 0)

    // An already-aborted signal never occupies a slot.
    const aborted = new AbortController()
    aborted.abort()
    const rejected = await acquireAgentStreamSlot('root', aborted.signal).then(
        () => { throw new Error('aborted acquire must reject') },
        (err: Error) => err,
    )
    assert.equal(rejected.name, 'AbortError')
    assert.equal(agentStreamBudgetSnapshot().active, 1)

    held()
}

async function checkReleaseIsIdempotentAndConfigClamps(): Promise<void> {
    resetAgentStreamBudget()
    const release = await acquireAgentStreamSlot('root')
    release()
    release()
    assert.equal(agentStreamBudgetSnapshot().active, 0, 'double release must not go negative')

    configureAgentStreamBudget({ maxConcurrentStreams: 1, reservedForRootStreams: 9 })
    assert.equal(agentStreamBudgetSnapshot().reservedForRootStreams, 0, 'reserve is clamped below max')
    assert.equal(agentStreamBudgetSnapshot().childLimit, 1)
    configureAgentStreamBudget({ maxConcurrentStreams: 0 })
    assert.equal(agentStreamBudgetSnapshot().maxConcurrentStreams, 1, 'max is clamped to at least 1')
}

async function main(): Promise<void> {
    await checkQueuesBeyondLimit()
    await checkRootReserve()
    await checkRootPriorityOverQueuedChild()
    await checkAbortRemovesWaiter()
    await checkReleaseIsIdempotentAndConfigClamps()
    console.log('agent stream budget checks passed')
}

// A hung await with no pending handle lets node exit 0 silently, which would
// report a broken budget as green. The watchdog turns that into a failure.
const watchdog = setTimeout(() => {
    console.error('agent stream budget checks timed out (a slot was never released)')
    process.exit(1)
}, 15_000)
main().then(
    () => clearTimeout(watchdog),
    error => {
        clearTimeout(watchdog)
        console.error(error)
        process.exit(1)
    },
)
