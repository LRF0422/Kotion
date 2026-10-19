import { strict as assert } from 'node:assert'
import {
    ROUTE_CACHE_MAX_DESKTOP,
    ROUTE_CACHE_MAX_MOBILE,
    RouteCacheStore,
    createRouteCacheHandle,
    resolveRouteCachePolicy,
    type LiveRouteView,
    type MatchedRouteView,
    type RoutePatternMatcher,
} from './route-cache'

// A tiny standalone matcher (the real one is react-router's `matchPath`, which
// the shell injects) so this check has no framework or DOM dependency.
const matcher: RoutePatternMatcher = (pattern, pathname, end) => {
    const normalized = pattern.replace(/\/+$/, '') || '/'
    const patternParts = normalized.split('/').filter(Boolean)
    const pathParts = pathname.replace(/\/+$/, '').split('/').filter(Boolean)
    if (normalized === '/') return pathname === '/'
    if (end ? patternParts.length !== pathParts.length : patternParts.length > pathParts.length) return false
    return patternParts.every((part, index) =>
        part.startsWith(':') ? Boolean(pathParts[index]) : part === pathParts[index])
}

// `matches[0]` is the shell layout route (no route-cache handle); `matches[1]`
// is the page route the shell keeps alive.
const handles = (...pageHandles: unknown[]): MatchedRouteView[] =>
    pageHandles.map(handle => ({ handle }))

// ---------------------------------------------------------------------------
// Slot retention (LRU)
// ---------------------------------------------------------------------------

const store = new RouteCacheStore<string, string>(2)
assert.equal(store.max, 2)

assert.deepEqual(store.enter('a', 'A1', 'ctxA'), [])
assert.deepEqual(store.enter('b', 'B1', 'ctxB'), [])
assert.equal(store.active, 'b')
assert.deepEqual(store.list().map(entry => entry.key), ['a', 'b'])

// A third slot evicts the least recently visible background slot, never the
// visible one.
assert.deepEqual(store.enter('c', 'C1', 'ctxC'), ['a'])
assert.deepEqual(store.list().map(entry => entry.key), ['b', 'c'])
assert.equal(store.active, 'c')

// Re-activating a background slot refreshes its element + context in place
// (this is what preserves the React subtree instead of remounting it) and
// protects it from the next eviction.
assert.deepEqual(store.enter('b', 'B2', 'ctxB2'), [])
const reactivated = store.list().find(entry => entry.key === 'b')
assert.equal(reactivated?.element, 'B2')
assert.equal(reactivated?.context, 'ctxB2')
assert.deepEqual(store.enter('d', 'D1', 'ctxD'), ['c'])
assert.deepEqual(store.list().map(entry => entry.key), ['b', 'd'])
assert.equal(store.active, 'd')

// A route that opts out of caching leaves no slot behind and backgrounds
// whatever was kept.
assert.deepEqual(store.leaveUncached('d'), ['d'])
assert.equal(store.active, null)
assert.deepEqual(store.list().map(entry => entry.key), ['b'])
assert.deepEqual(store.leaveUncached('never-cached'), [])

// The transient uncached layer already removed the visible slot, so clearing an
// unknown key changes nothing.
assert.equal(store.size, 1)

store.clear()
assert.equal(store.size, 0)
assert.equal(store.active, null)

// Shrinking the limit evicts down to the new size but keeps the visible slot.
const shrink = new RouteCacheStore<string, string>(5)
shrink.enter('a', 'A', 'ctxA')
shrink.enter('b', 'B', 'ctxB')
shrink.enter('c', 'C', 'ctxC')
assert.deepEqual(shrink.setMax(2), ['a'])
assert.deepEqual(shrink.list().map(entry => entry.key), ['b', 'c'])
assert.equal(shrink.active, 'c')

// A limit of zero keeps only the route on screen: keep-alive is effectively off
// behind the kill switch, and navigation still never evicts the visible slot.
const noSlots = new RouteCacheStore<string, string>(0)
assert.deepEqual(noSlots.enter('a', 'A', 'ctxA'), [])
assert.equal(noSlots.size, 1)
assert.deepEqual(noSlots.enter('b', 'B', 'ctxB'), ['a'])
assert.deepEqual(noSlots.list().map(entry => entry.key), ['b'])

// Defaults stay in the region the shell documents (mobile keeps fewer trees).
assert.ok(ROUTE_CACHE_MAX_MOBILE < ROUTE_CACHE_MAX_DESKTOP)
assert.ok(ROUTE_CACHE_MAX_MOBILE >= 1)

// ---------------------------------------------------------------------------
// Slot policy: route pattern, live plugin routes, opt-outs
// ---------------------------------------------------------------------------

const policy = (input: {
    matches: MatchedRouteView[]
    pathname: string
    liveRoutes?: LiveRouteView[]
    excludedPaths?: string[]
}) => resolveRouteCachePolicy({ ...input, matcher })

// Baked route: the slot is keyed by its *pattern*, so params (two spaces, two
// pages of one space) reuse one kept tree.
assert.deepEqual(
    policy({
        matches: handles(undefined, createRouteCacheHandle('/space-detail/:id')),
        pathname: '/space-detail/42/page/edit/7',
    }),
    { key: 'route:/space-detail/:id', cacheable: true },
)

// Per-route opt-out via `RouteConfig.keepAlive = false`.
assert.deepEqual(
    policy({
        matches: handles(undefined, createRouteCacheHandle('/invite/:token', false)),
        pathname: '/invite/abc',
    }),
    { key: 'route:/invite/:token', cacheable: false },
)

// Default is opt-in: a route whose handle says nothing about keep-alive is
// cached; an unrelated handle does not confuse the policy.
assert.deepEqual(
    policy({
        matches: handles(undefined, createRouteCacheHandle('/home')),
        pathname: '/home',
    }),
    { key: 'route:/home', cacheable: true },
)
assert.deepEqual(
    policy({
        matches: handles(undefined, { somethingElse: true }),
        pathname: '/home',
        liveRoutes: [{ path: '/home' }],
    }),
    { key: 'plugin:/home', cacheable: true },
)

// Public share / one-shot invite routes never keep a slot, even though their
// route config did not opt out.
assert.deepEqual(
    policy({
        matches: handles(undefined, createRouteCacheHandle('/share/:shortCode')),
        pathname: '/share/xyz',
        excludedPaths: ['/share/:shortCode', '/collaborate/:token'],
    }),
    { key: 'route:/share/:shortCode', cacheable: false },
)

// Live plugin routes come through the splat route: the registry supplies the
// pattern, and the slot is keyed by the top-level plugin route.
const aiLive: LiveRouteView[] = [
    { path: '/ai' },
    { path: '/fileManager' },
]
assert.deepEqual(
    policy({
        matches: handles(undefined, undefined),
        pathname: '/ai',
        liveRoutes: aiLive,
    }),
    { key: 'plugin:/ai', cacheable: true },
)

// Longest top-level pattern wins, so two plugin routes do not share a slot.
assert.deepEqual(
    policy({
        matches: handles(undefined, undefined),
        pathname: '/notes/archive',
        liveRoutes: [{ path: '/notes' }, { path: '/notes/archive' }],
    }),
    { key: 'plugin:/notes/archive', cacheable: true },
)

// A parent route (it has children) stays matched while a child URL is open.
assert.deepEqual(
    policy({
        matches: handles(undefined, undefined),
        pathname: '/notes/archive/2024',
        liveRoutes: [{ path: '/notes', children: [{ path: '/notes/archive' }] }],
    }),
    { key: 'plugin:/notes', cacheable: true },
)

// A live plugin page can opt out like a baked one.
assert.deepEqual(
    policy({
        matches: handles(undefined, undefined),
        pathname: '/studio',
        liveRoutes: [{ path: '/studio', keepAlive: false }],
    }),
    { key: 'plugin:/studio', cacheable: false },
)

// Nothing matched (404 / loading fallback): render live, never cache.
assert.deepEqual(
    policy({
        matches: handles(undefined, undefined),
        pathname: '/does-not-exist',
        liveRoutes: aiLive,
    }),
    { key: 'unmatched:/does-not-exist', cacheable: false },
)

console.log('route-cache.check.ts: all assertions passed')
