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
import { existsSync } from 'node:fs'
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

    /* ------------------------------------------------------------------ *
     * Removal is destructive, so it is guarded and it takes the session with it.
     * ------------------------------------------------------------------ */
    const projectsDir = join(tmpdir(), 'kn-studio-manager-remove-' + process.pid)
    await rm(projectsDir, { recursive: true, force: true })
    await mkdir(projectsDir, { recursive: true })

    /* 1) Anything that is not a plugin project is refused. */
    const notAProject = join(projectsDir, 'just-a-folder')
    await mkdir(notAProject, { recursive: true })
    await writeFile(join(notAProject, 'notes.txt'), 'hello')
    let refusedNotProject = ''
    try {
        await manager.removeProject({ root: notAProject })
    } catch (error) {
        refusedNotProject = error.message
    }
    check('remove: refuses a directory without package.json', /not a plugin project/.test(refusedNotProject), refusedNotProject)
    check('remove: the refused directory survives', existsSync(notAProject))

    /* 2) A standard user directory is refused even when it holds a manifest. */
    const protectedDir = join(projectsDir, 'Documents')
    await mkdir(protectedDir, { recursive: true })
    await writeFile(join(protectedDir, 'package.json'), JSON.stringify({ name: 'documents' }))
    let refusedProtected = ''
    try {
        await manager.removeProject({ root: protectedDir })
    } catch (error) {
        refusedProtected = error.message
    }
    check('remove: refuses a standard directory', /standard directory/.test(refusedProtected), refusedProtected)
    check('remove: the protected directory survives', existsSync(protectedDir))

    /* 3) A real project: session stopped, files deleted, descriptor reported. */
    const removable = join(projectsDir, 'gone-plugin')
    await mkdir(join(removable, 'src'), { recursive: true })
    await writeFile(
        join(removable, 'package.json'),
        JSON.stringify({
            name: 'gone-plugin',
            knPluginStudio: { pluginKey: 'gone-plugin', displayName: 'Gone Plugin', entry: 'src/index.tsx' },
        }),
    )
    await writeFile(join(removable, 'src', 'index.tsx'), GOOD)
    await manager.start({ root: removable, watch: true })
    const removed = await manager.removeProject({ root: removable })
    check(
        'remove: reports the deleted project',
        removed.removed === true && removed.pluginKey === 'gone-plugin' && removed.name === 'Gone Plugin',
        JSON.stringify(removed),
    )
    check('remove: the project directory is gone', !existsSync(removable))
    check('remove: the session is dropped', manager.status({ root: removable }).length === 0)

    /* ------------------------------------------------------------------ *
     * Deleting one file: confined to the project, and the manifest and entry
     * file are not deletable. The removed text comes back for undo.
     * ------------------------------------------------------------------ */
    const fileProject = join(projectsDir, 'file-plugin')
    await mkdir(join(fileProject, 'src'), { recursive: true })
    await writeFile(
        join(fileProject, 'package.json'),
        JSON.stringify({
            name: 'file-plugin',
            knPluginStudio: { pluginKey: 'file-plugin', entry: 'src/index.tsx' },
        }),
    )
    await writeFile(join(fileProject, 'src', 'index.tsx'), GOOD)
    await writeFile(join(fileProject, 'src', 'OldPanel.tsx'), 'export const OldPanel = () => null\n')
    const outsideFile = join(projectsDir, 'outside.ts')
    await writeFile(outsideFile, 'export const outside = 1\n')

    /** The refusal message, or null when the call unexpectedly succeeded. */
    const refusalMessage = async (options) => {
        try {
            await manager.deleteProjectFile(options)
            return null
        } catch (error) {
            return error.message
        }
    }

    const outsideMessage = await refusalMessage({ root: fileProject, path: outsideFile })
    check('deleteFile: refuses a path outside the project', /outside the project/.test(String(outsideMessage)), String(outsideMessage))
    check('deleteFile: the outside file survives', existsSync(outsideFile))

    const manifestMessage = await refusalMessage({ root: fileProject, path: join(fileProject, 'package.json') })
    check('deleteFile: refuses the manifest', /package\.json/.test(String(manifestMessage)), String(manifestMessage))
    check('deleteFile: the manifest survives', existsSync(join(fileProject, 'package.json')))

    const entryMessage = await refusalMessage({ root: fileProject, path: join(fileProject, 'src', 'index.tsx') })
    check('deleteFile: refuses the entry file', /entry file/.test(String(entryMessage)), String(entryMessage))
    check('deleteFile: the entry file survives', existsSync(join(fileProject, 'src', 'index.tsx')))

    const missingMessage = await refusalMessage({ root: fileProject, path: join(fileProject, 'src', 'Nope.tsx') })
    check('deleteFile: refuses a missing file', /file not found/.test(String(missingMessage)), String(missingMessage))

    const dirMessage = await refusalMessage({ root: fileProject, path: join(fileProject, 'src') })
    check('deleteFile: refuses a directory', /not a file/.test(String(dirMessage)), String(dirMessage))

    const nonProjectMessage = await refusalMessage({ root: projectsDir, path: join(projectsDir, 'anything.ts') })
    check('deleteFile: refuses a non-project root', /not a plugin project/.test(String(nonProjectMessage)), String(nonProjectMessage))

    const deleted = await manager.deleteProjectFile({ root: fileProject, path: join(fileProject, 'src', 'OldPanel.tsx') })
    check(
        'deleteFile: removes the file and reports it',
        deleted.removed === true &&
            deleted.relativePath === 'src/OldPanel.tsx' &&
            !existsSync(join(fileProject, 'src', 'OldPanel.tsx')),
        JSON.stringify({ relativePath: deleted.relativePath, bytes: deleted.bytes }),
    )
    check(
        'deleteFile: echoes the content back for undo',
        typeof deleted.content === 'string' && deleted.content.includes('OldPanel') && deleted.truncated === false,
        JSON.stringify(deleted.content),
    )
    check('deleteFile: the rest of the project survives', existsSync(join(fileProject, 'src', 'index.tsx')))

    /* ------------------------------------------------------------------ *
     * Externals: the child process's host-global map is fixed at spawn time,
     * so an omitted list must inherit and an explicit change must restart.
     * ------------------------------------------------------------------ */
    const externalsRoot = join(projectsDir, 'externals-plugin')
    await mkdir(join(externalsRoot, 'src'), { recursive: true })
    await writeFile(
        join(externalsRoot, 'package.json'),
        JSON.stringify({
            name: 'externals-plugin',
            knPluginStudio: { pluginKey: 'externals-plugin', entry: 'src/index.tsx' },
        }),
    )
    await writeFile(
        join(externalsRoot, 'src', 'index.tsx'),
        "import { KPlugin } from '@kn/common'\nimport SomeLib from 'SomeLib'\nexport const p = new KPlugin({ name: 'Externals' })\nexport const tag = SomeLib.tag\n",
    )

    const declared = await manager.start({ root: externalsRoot, watch: false, externals: ['SomeLib'] })
    check(
        'externals: declared on start',
        declared.buildCount === 1 && !declared.error,
        declared.error ?? `${declared.build?.bytes} bytes`,
    )

    const kept = await manager.build({ root: externalsRoot })
    check(
        'externals: a build that omits them keeps them',
        kept.buildCount === 2 && !kept.error,
        kept.error ?? `#${kept.buildCount}`,
    )

    const inherited = await manager.start({ root: externalsRoot, watch: false })
    check(
        'externals: a restart that omits them inherits them',
        inherited.buildCount === 1 && !inherited.error,
        inherited.error ?? `${inherited.build?.bytes} bytes`,
    )

    const cleared = await manager.build({ root: externalsRoot, externals: [] })
    check(
        'externals: an explicit empty list restarts and clears them',
        Boolean(cleared.error) && /SomeLib/.test(String(cleared.error)),
        String(cleared.error),
    )
    manager.stop({ root: externalsRoot })

    /* ------------------------------------------------------------------ *
     * A child that dies before its first `ready` must fail fast and explain
     * itself. This is the packaged-app failure mode: esbuild was missing from
     * the app bundle, the child crashed on import, and the studio page showed
     * only "dev-server exited with code 1" with "No logs yet" — after a 30s wait.
     * ------------------------------------------------------------------ */
    const crashScript = join(tmpdir(), `kn-studio-crash-${process.pid}.mjs`)
    await writeFile(
        crashScript,
        [
            `process.stderr.write("[plugin-dev:error] build failed (initial): Bundler unavailable: Cannot find package 'esbuild'\\n")`,
            'process.exit(1)',
            '',
        ].join('\n'),
    )
    // A dedicated manager: `devServer` is fixed when the session is created.
    const crashManager = new DevSessionManager()
    try {
        const crashStartedAt = Date.now()
        const crashed = await crashManager.start({ root, devServer: crashScript, watch: false })
        const crashDurationMs = Date.now() - crashStartedAt
        check('crash: reported as failed, not merely stopped', crashed.state === 'failed', crashed.state)
        check(
            'crash: the exit code is explained',
            /exited with code 1/.test(String(crashed.error)),
            String(crashed.error),
        )
        check(
            'crash: stderr diagnostics are surfaced',
            /Cannot find package 'esbuild'/.test(String(crashed.error)),
            String(crashed.error).split('\n')[0],
        )
        check(
            'crash: stderr is captured as session logs',
            crashManager.logs({ root }).some((entry) => /esbuild/.test(entry.message)),
            `${crashManager.logs({ root }).length} log entries`,
        )
        // The bug was waiting out INITIAL_BUILD_TIMEOUT_MS (30s) before reporting.
        check('crash: fails fast instead of timing out', crashDurationMs < 8000, crashDurationMs + 'ms')
    } finally {
        crashManager.dispose()
        await rm(crashScript, { force: true })
    }

    await rm(projectsDir, { recursive: true, force: true })
} catch (error) {
    check('manager test run completed', false, String((error && error.stack) || error))
} finally {
    manager.dispose()
    await rm(root, { recursive: true, force: true })
}

const failedChecks = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`)
process.exit(failedChecks.length ? 1 : 0)
