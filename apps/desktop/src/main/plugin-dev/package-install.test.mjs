/**
 * Dependency installer test.
 *
 * Covers spec parsing/validation, manager detection and argv construction, plus
 * a fake-spawn run so the spawn path is exercised without touching the network.
 *
 * Run: node apps/desktop/src/main/plugin-dev/package-install.test.mjs
 */
import { EventEmitter } from 'node:events'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    buildInstallArgs,
    detectManager,
    installDependencies,
    parsePackageSpec,
    validatePackageSpecs,
} from './package-install.mjs'

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log((condition ? 'ok  ' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''))
}

check('parse: plain name', parsePackageSpec('lodash')?.name === 'lodash')
check('parse: name with version', parsePackageSpec('lodash@4.17.21')?.version === '4.17.21')
const scoped = parsePackageSpec('@octokit/rest@^21.0.0')
check('parse: scoped + range', scoped?.name === '@octokit/rest' && scoped?.version === '^21.0.0', JSON.stringify(scoped))
check('parse: bare scoped name', parsePackageSpec('@octokit/rest')?.name === '@octokit/rest')
check('parse: rejects shell metacharacters', parsePackageSpec('evil; rm -rf /') === null)
check('parse: rejects spaces', parsePackageSpec('two words') === null)

const validated = validatePackageSpecs(['lodash', 'lodash', 'date-fns@3'])
check('validate: dedupes', validated.ok === true && validated.specs.length === 2, JSON.stringify(validated))
check('validate: rejects empty list', validatePackageSpecs([]).ok === false)
check('validate: rejects bad spec', validatePackageSpecs(['ok', 'bad pkg']).ok === false)

check(
    'args: npm disables peers',
    buildInstallArgs('npm', ['lodash']).join(' ') === 'install --legacy-peer-deps --save lodash',
    buildInstallArgs('npm', ['lodash']).join(' '),
)
check(
    'args: npm dev',
    buildInstallArgs('npm', ['lodash'], true).join(' ') === 'install --legacy-peer-deps --save-dev lodash',
    buildInstallArgs('npm', ['lodash'], true).join(' '),
)
check(
    'args: pnpm disables peers',
    buildInstallArgs('pnpm', ['lodash']).join(' ') === 'add --save --config.auto-install-peers=false lodash',
    buildInstallArgs('pnpm', ['lodash']).join(' '),
)
check('args: yarn dev', buildInstallArgs('yarn', ['lodash'], true).join(' ') === 'add --dev lodash')

const root = join(tmpdir(), 'kn-package-install-' + process.pid)
await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })
check('manager: npm by default', detectManager(root) === 'npm')
await writeFile(join(root, 'pnpm-lock.yaml'), '')
check('manager: pnpm from lockfile', detectManager(root) === 'pnpm')
await rm(join(root, 'pnpm-lock.yaml'))
await writeFile(join(root, 'yarn.lock'), '')
check('manager: yarn from lockfile', detectManager(root) === 'yarn')
await rm(join(root, 'yarn.lock'))

const record = []
const fakeSpawn = (command, args, options) => {
    record.push({ command, args, options })
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {}
    setImmediate(() => {
        child.stdout.emit('data', 'added 1 package')
        child.emit('close', 0)
    })
    return child
}

const installed = await installDependencies({ root, packages: ['date-fns@^3'], spawnImpl: fakeSpawn })
check('install: succeeds', installed.ok === true && installed.manager === 'npm', JSON.stringify(installed))
check(
    'install: spawns the manager in the project',
    record[0]?.command === 'npm' && record[0]?.args.join(' ') === 'install --legacy-peer-deps --save date-fns@^3' && record[0]?.options.cwd === root,
    JSON.stringify(record[0]),
)
check('install: captures output', installed.output.includes('added 1 package'), installed.output)

const before = record.length
const rejected = await installDependencies({ root, packages: ['bad; pkg'], spawnImpl: fakeSpawn })
check('install: rejects bad spec without spawning', rejected.ok === false && record.length === before, rejected.error)

await rm(root, { recursive: true, force: true })

const failed = results.filter((entry) => !entry.ok)
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed')
process.exit(failed.length ? 1 : 0)
