/**
 * Dev-session manager test (plain Node, no Electron).
 *
 * Guards the one-shot build contract around *failed* rebuilds: a failed
 * `dev.build` must resolve promptly and surface the error instead of waiting
 * out the 30s initial-build timeout. The session itself must survive.
 *
 * Run: node apps/desktop/src/main/plugin-dev/manager.test.mjs
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DevSessionManager } from './manager.mjs'

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const root = join(tmpdir(), 'kn-studio-manager-test-' + process.pid)
await rm(root, { recursive: true, force: true })
await mkdir(join(root, 'src'), { recursive: true })
await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'manager-dev-plugin', knPluginStudio: { pluginKey: 'manager-dev-plugin', entry: 'src/index.tsx' } }),
)
const GOOD = "import { KPlugin } from '@kn/common'\nexport const MARKER = 'GOOD'\nexport const p = new KPlugin({ name: 'Manager Test' })\n"
const BROKEN = "import { nope } from './missing'\nexport const p = nope\n"
await writeFile(join(root, 'src', 'index.tsx'), GOOD)

const manager = new DevSessionManager()
try {
    const started = await manager.start({ root, watch: false })
    check('start: first build succeeded', started.buildCount === 1 && Boolean(started.build?.code), `#${started.buildCount}`)

    /* Break the source, then issue a one-shot build as the studio would. */
    await writeFile(join(root, 'src', 'index.tsx'), BROKEN)
    const startedAt = Date.now()
    const failed = await manager.build({ root })
    const durationMs = Date.now() - startedAt
    check('failure: error is surfaced', Boolean(failed.error) && /missing/.test(failed.error), String(failed.error))
    check('failure: buildCount did not move', failed.buildCount === 1, `#${failed.buildCount}`)
    check('failure: session survived', manager.status({ root })[0]?.state === 'watching', manager.status({ root })[0]?.state)
    check('failure: stale build is retained but flagged', Boolean(failed.build?.code), String(failed.build?.bytes))
    // The regression was a 30s wait (INITIAL_BUILD_TIMEOUT_MS); anything near
    // that means the failed attempt never released the build waiter.
    check('failure: returned promptly', durationMs < 8000, durationMs + 'ms')

    /* Fix it: the next one-shot build must succeed again. */
    await writeFile(join(root, 'src', 'index.tsx'), GOOD)
    const fixed = await manager.build({ root })
    check('recovery: second build succeeded', fixed.buildCount === 2 && !fixed.error, `#${fixed.buildCount} error=${fixed.error}`)
} catch (error) {
    check('manager test run completed', false, String((error && error.stack) || error))
} finally {
    manager.dispose()
    await rm(root, { recursive: true, force: true })
}

const failedChecks = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`)
process.exit(failedChecks.length ? 1 : 0)
