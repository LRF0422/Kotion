/**
 * Degraded boot: a plugin that failed to load must not stop the app, and the
 * report the shell shows has to be short, deduped and reason-carrying.
 *
 * This checks the pure half (`plugin-boot.ts`): the boot decision
 * (`resolvePluginBootOutcome` — plugin-level failures must never be fatal), merging
 * the registry's `failedPlugins` (names) with `PluginInitResult.failures` (reasons),
 * and the one-line summary used for logs/toasts. `PluginManager.init()` is covered
 * by `@kn/common check:plugin-reinit` / `check:plugins`; a final source guard pins
 * `Layout` to this policy so the old `throw` cannot quietly come back.
 *
 * Run with: pnpm --filter @kn/core check:plugin-boot
 */
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import {
    PLUGIN_BOOT_FAILURE_PREVIEW,
    PLUGIN_BOOT_FAILURE_REASON_MAX,
    PLUGIN_BOOT_SUMMARY_MAX,
    collectPluginBootFailures,
    resolvePluginBootOutcome,
    summarizePluginBootFailures,
    type PluginBootFailure,
} from './plugin-boot'

// ---------------------------------------------------------------------------
// The boot decision. Plugin-level failures degrade; only an unreadable installed
// list is fatal. This is the invariant the old `Layout` violated.
// ---------------------------------------------------------------------------

assert.equal(resolvePluginBootOutcome(), 'clean', 'no signals means a clean boot')
assert.equal(resolvePluginBootOutcome({}), 'clean')
assert.equal(resolvePluginBootOutcome({ failedPlugins: 0 }), 'clean')
assert.equal(
    resolvePluginBootOutcome({ failedPlugins: 3 }),
    'degraded',
    'any number of failed plugins must degrade, never block, the boot',
)
assert.equal(
    resolvePluginBootOutcome({ installedListUnavailable: false, failedPlugins: 1 }),
    'degraded',
    'a readable installed list plus a failed plugin is still a degraded boot',
)
assert.equal(
    resolvePluginBootOutcome({ installedListUnavailable: true }),
    'fatal',
    'an unreadable installed list is the only fatal case',
)
assert.equal(
    resolvePluginBootOutcome({ installedListUnavailable: true, failedPlugins: 12 }),
    'fatal',
    'the unreadable list wins: the shell cannot even name what is missing',
)


// ---------------------------------------------------------------------------
// Empty / no-argument cases: a healthy boot produces an empty report, and the
// call sites that only have names keep working.
// ---------------------------------------------------------------------------

const empty = summarizePluginBootFailures([], [])
assert.equal(empty.total, 0)
assert.deepEqual(empty.visible, [])
assert.equal(empty.hidden, 0)
assert.equal(empty.summary, '')

const noArgs = summarizePluginBootFailures()
assert.equal(noArgs.total, 0, 'missing arguments must behave like an empty failure list')

// ---------------------------------------------------------------------------
// Names and reasons are merged by key.
// ---------------------------------------------------------------------------

const one = summarizePluginBootFailures(['ai'], [])
assert.equal(one.total, 1)
assert.deepEqual(one.visible, [{ key: 'ai' }])
assert.equal(one.summary, 'ai', 'a failure without a reason still names the plugin')

const withReason = summarizePluginBootFailures(
    ['ai'],
    [{ key: 'ai', reason: 'Failed to fetch https://cdn.example/ai.js: 404' }],
)
assert.deepEqual(withReason.visible, [{
    key: 'ai',
    reason: 'Failed to fetch https://cdn.example/ai.js: 404',
}])
assert.equal(withReason.summary, 'ai: Failed to fetch https://cdn.example/ai.js: 404')

// The registry lists a plugin by display name; the reason may be filed under its
// registry key. They are the same plugin in practice only when identical — the
// helper never guesses, it just preserves what the caller gave it.
const namesWithoutReasons = summarizePluginBootFailures(['ai', 'bitable'], [])
assert.equal(
    namesWithoutReasons.summary,
    'ai; bitable',
    'multiple failures are joined in registry order',
)

// A reason whose key the caller omitted from `failedPlugins` is still reported:
// nothing the registry produced may be dropped by the formatter.
const orphanReason = collectPluginBootFailures([], [{ key: 'mermaid', reason: 'timeout' }])
assert.deepEqual(orphanReason, [{ key: 'mermaid', reason: 'timeout' }])

// ---------------------------------------------------------------------------
// Dedupe, trimming and ordering.
// ---------------------------------------------------------------------------

const duplicates = collectPluginBootFailures(
    [' ai ', 'ai', '', '   ', 'bitable', 'ai'],
    [{ key: 'ai', reason: 'load failed' }],
)
assert.deepEqual(
    duplicates,
    [{ key: 'ai', reason: 'load failed' }, { key: 'bitable' }],
    'names are trimmed and deduped, blank names dropped, first-seen order kept',
)

const reasonMerge = collectPluginBootFailures(
    ['ai'],
    [{ key: 'ai', reason: '' }, { key: 'ai', reason: 'script failed' }],
)
assert.equal(
    reasonMerge[0]?.reason,
    'script failed',
    'a later non-empty reason fills in for an earlier empty one',
)

const firstReasonWins = collectPluginBootFailures(
    ['ai'],
    [
        { key: 'ai', reason: 'script failed' },
        { key: 'ai', reason: 'conflict with an active plugin' },
    ],
)
assert.equal(
    firstReasonWins[0]?.reason,
    'script failed',
    'the first (root-cause) reason wins over a later consequence',
)

// ---------------------------------------------------------------------------
// Reasons are toast-safe: whitespace collapsed, overlong text truncated.
// ---------------------------------------------------------------------------

const messy = summarizePluginBootFailures(
    ['ai'],
    [{ key: 'ai', reason: '  Failed to load\n  the bundle\t(500)  ' }],
)
assert.equal(messy.summary, 'ai: Failed to load the bundle (500)')

const longReason = 'x'.repeat(PLUGIN_BOOT_FAILURE_REASON_MAX + 40)
const truncated = summarizePluginBootFailures(['ai'], [{ key: 'ai', reason: longReason }])
const shown = truncated.visible[0]?.reason ?? ''
assert.equal(shown.length, PLUGIN_BOOT_FAILURE_REASON_MAX, 'reason is capped for the toast')
assert.ok(shown.endsWith('…'), 'the capped reason ends in an ellipsis')

// ---------------------------------------------------------------------------
// Preview limit: the toast shows a few, the report counts the rest.
// ---------------------------------------------------------------------------

const many: PluginBootFailure[] = ['ai', 'bitable', 'mermaid', 'excalidraw', 'drawio'].map(key => ({
    key,
    reason: `${key} failed`,
}))
const limited = summarizePluginBootFailures(many.map(f => f.key), many)
assert.equal(limited.total, 5)
assert.equal(limited.visible.length, PLUGIN_BOOT_FAILURE_PREVIEW)
assert.equal(limited.hidden, 5 - PLUGIN_BOOT_FAILURE_PREVIEW)
assert.equal(
    limited.summary,
    'ai: ai failed; bitable: bitable failed; mermaid: mermaid failed',
    'the summary renders only the previewed failures',
)

const customLimit = summarizePluginBootFailures(['a', 'b', 'c'], [], { limit: 1 })
assert.equal(customLimit.visible.length, 1)
assert.equal(customLimit.hidden, 2)
assert.equal(customLimit.summary, 'a')

const zeroLimit = summarizePluginBootFailures(['a', 'b'], [], { limit: 0 })
assert.deepEqual(zeroLimit.visible, [])
assert.equal(zeroLimit.hidden, 2, 'a zero preview still reports how many failed')
assert.equal(zeroLimit.summary, '')

// A limit larger than the failure count hides nothing.
const oversizedLimit = summarizePluginBootFailures(['a'], [], { limit: 10 })
assert.equal(oversizedLimit.hidden, 0)
assert.equal(oversizedLimit.total, 1)

// ---------------------------------------------------------------------------
// Total-length budget: three 160-char reasons would make a toast taller than a
// phone. Entries that do not fit are counted as hidden, not silently dropped.
// ---------------------------------------------------------------------------

const longFailures: PluginBootFailure[] = ['ai', 'bitable', 'mermaid'].map(key => ({
    key,
    reason: 'y'.repeat(PLUGIN_BOOT_FAILURE_REASON_MAX),
}))
const budgeted = summarizePluginBootFailures(longFailures.map(f => f.key), longFailures)
assert.ok(
    budgeted.summary.length <= PLUGIN_BOOT_SUMMARY_MAX,
    `the toast summary must respect the character budget: ${budgeted.summary.length}`,
)
assert.ok(budgeted.visible.length < longFailures.length, 'not every long failure fits the toast')
assert.equal(
    budgeted.hidden,
    budgeted.total - budgeted.visible.length,
    'failures that do not fit are counted, not dropped silently',
)
assert.ok(budgeted.hidden > 0, 'the long-reason case must actually hit the budget')
assert.ok(
    budgeted.visible.length >= 1,
    'the first (root-cause) failure is always shown, even when it is long',
)

// A single long-but-within-budget failure still shows in full.
const singleLong = summarizePluginBootFailures(['ai'], [{
    key: 'ai',
    reason: 'z'.repeat(120),
}])
assert.equal(singleLong.visible.length, 1)
assert.equal(singleLong.hidden, 0)
assert.ok(singleLong.summary.length < PLUGIN_BOOT_SUMMARY_MAX)

// ---------------------------------------------------------------------------
// Source guard: the shell must route the decision through this policy and keep
// the degraded-boot report. A future `throw` after `pluginManager.init()` (the
// exact regression this fix removes) fails here.
// ---------------------------------------------------------------------------

const layoutSource = readFileSync(resolvePath(__dirname, '../../src/Layout.tsx'), 'utf8')
assert.ok(
    !layoutSource.includes('Failed to load required plugins'),
    'Layout must not throw the old "Failed to load required plugins" error',
)
assert.ok(
    /resolvePluginBootOutcome\(/.test(layoutSource),
    'Layout must decide boot fatality through resolvePluginBootOutcome()',
)
assert.ok(
    /reportPluginBootFailures\(allFailedPlugins/.test(layoutSource),
    'Layout must report per-plugin failures instead of blocking the boot',
)

console.log('plugin boot checks passed')
