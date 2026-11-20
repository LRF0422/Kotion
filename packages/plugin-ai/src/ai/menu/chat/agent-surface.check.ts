import { strict as assert } from 'node:assert'
import {
    canYieldAgentSurface,
    claimAgentSurface,
    getAgentSurfaceOwner,
    isAgentSurfaceMounted,
    registerAgentSurfaceMount,
    releaseAgentSurface,
} from './agent-surface'

/**
 * The dock and the `/ai` page share conversations. These assertions pin the two
 * rules that keep them from mounting two agents at once:
 *  - exactly one surface owns a conversation, and only the owner can release it;
 *  - a run parked on a tool/approval/plan/budget never changes owner (the other
 *    surface shows a banner instead of attaching).
 */

// Ownership is exclusive and idempotent for its owner.
assert.equal(getAgentSurfaceOwner('c1'), null)
assert.equal(claimAgentSurface('c1', 'dock'), true)
assert.equal(claimAgentSurface('c1', 'dock'), true)
assert.equal(claimAgentSurface('c1', 'kernel'), false, 'the second surface must wait')
assert.equal(getAgentSurfaceOwner('c1'), 'dock')

// A late unmount from the non-owner must not steal the claim.
releaseAgentSurface('c1', 'kernel')
assert.equal(getAgentSurfaceOwner('c1'), 'dock')

// The owner can hand over; the other surface then claims.
releaseAgentSurface('c1', 'dock')
assert.equal(getAgentSurfaceOwner('c1'), null)
assert.equal(claimAgentSurface('c1', 'kernel'), true)
assert.equal(getAgentSurfaceOwner('c1'), 'kernel')
releaseAgentSurface('c1', 'kernel')

// Safe boundaries: the backend run keeps going without the stream.
for (const phase of ['idle', 'streaming', 'completed', 'failed', 'cancelled'] as const) {
    assert.equal(canYieldAgentSurface(phase, [], false), true, `phase ${phase} should be yieldable`)
}
// Unsafe: a promise/UI lives on this surface.
for (const phase of ['creating', 'waiting-tools', 'waiting-approval', 'suspended'] as const) {
    assert.equal(canYieldAgentSurface(phase, [], false), false, `phase ${phase} must keep the owner`)
}
assert.equal(canYieldAgentSurface('streaming', ['call-1'], false), false, 'a pending tool keeps the owner')
assert.equal(canYieldAgentSurface('streaming', [], true), false, 'an approval card keeps the owner')

// A surface only yields to a page that actually has the conversation mounted.
assert.equal(isAgentSurfaceMounted('c2', 'kernel'), false)
const releaseKernel = registerAgentSurfaceMount('c2', 'kernel')
assert.equal(isAgentSurfaceMounted('c2', 'kernel'), true)
assert.equal(isAgentSurfaceMounted('c2', 'dock'), false)
releaseKernel()
assert.equal(isAgentSurfaceMounted('c2', 'kernel'), false)
// Unregister is idempotent (React StrictMode runs cleanup twice in dev).
releaseKernel()
assert.equal(isAgentSurfaceMounted('c2', 'kernel'), false)

console.log('agent-surface.check: ok')