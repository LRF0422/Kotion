import { strict as assert } from 'node:assert'
import { resolveDockPin } from './dock-pinning'

const running = (...ids: string[]) => new Set(ids)
const ids = (...list: string[]) => list

// Nothing running: the user's own preference decides, and a preference for a
// panel this dock no longer hosts collapses instead of rendering nothing.
assert.deepEqual(
    resolveDockPin({ panelIds: ids('agent', 'graph'), runningIds: running() }, 'graph'),
    { pinnedId: null, activeId: 'graph' },
)
assert.deepEqual(
    resolveDockPin({ panelIds: ids('agent', 'graph'), runningIds: running() }, 'gone'),
    { pinnedId: null, activeId: null },
)
assert.deepEqual(
    resolveDockPin({ panelIds: ids('agent', 'graph'), runningIds: running() }, null),
    { pinnedId: null, activeId: null },
)

// The agent runs: it is forced open even though the user collapsed the dock.
assert.deepEqual(
    resolveDockPin({ panelIds: ids('agent', 'graph'), runningIds: running('agent') }, null),
    { pinnedId: 'agent', activeId: 'agent' },
)

// The agent runs while another panel was selected: the running conversation
// wins, and clicking another rail icon cannot switch away from it.
assert.deepEqual(
    resolveDockPin({ panelIds: ids('agent', 'graph'), runningIds: running('agent') }, 'graph'),
    { pinnedId: 'agent', activeId: 'agent' },
)

// A non-agent panel running still pins itself (generic mechanism).
assert.deepEqual(
    resolveDockPin({ panelIds: ids('agent', 'graph'), runningIds: running('graph') }, 'agent'),
    { pinnedId: 'graph', activeId: 'graph' },
)

// Several panels running at once: the assistant wins.
assert.deepEqual(
    resolveDockPin({ panelIds: ids('agent', 'graph'), runningIds: running('graph', 'agent') }, 'graph'),
    { pinnedId: 'agent', activeId: 'agent' },
)

// A panel running in the OTHER dock (or a panel this dock does not host) must
// not pin anything here.
assert.deepEqual(
    resolveDockPin({ panelIds: ids('agent', 'graph'), runningIds: running('outline') }, 'graph'),
    { pinnedId: null, activeId: 'graph' },
)

// A panel that opted out of this context (e.g. no open page) cannot be pinned.
assert.deepEqual(
    resolveDockPin({ panelIds: ids('graph'), runningIds: running('agent') }, null),
    { pinnedId: null, activeId: null },
)

console.log('dock-pinning.check: ok')
