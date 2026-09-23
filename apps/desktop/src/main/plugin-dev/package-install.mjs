/**
 * Third-party dependency installation for plugin projects (main process).
 *
 * Runs the project's package manager inside the project directory so a plugin
 * can depend on npm packages, not just the host-injected modules. The shell is
 * never given free text: package specs are parsed and character-validated
 * first, and the manager is one of three fixed executable names.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

const NAME_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789._~-'
const VERSION_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.^~<>=*+_-'
export const MANAGERS = ['npm', 'pnpm', 'yarn']

const isValidSegment = (segment) => {
    if (!segment) return false
    for (const char of segment) {
        if (!NAME_CHARS.includes(char)) return false
    }
    return true
}

/** Parse and validate one package spec like name, name@1.2 or @scope/name@^1. */
export const parsePackageSpec = (raw) => {
    if (typeof raw !== 'string') return null
    const spec = raw.trim()
    if (!spec) return null
    let name = spec
    let version
    const at = spec.lastIndexOf('@')
    if (at > 0) {
        name = spec.slice(0, at)
        version = spec.slice(at + 1)
    }
    let bare = name
    if (name.startsWith('@')) {
        const slash = name.indexOf('/')
        if (slash <= 1) return null
        if (!isValidSegment(name.slice(1, slash))) return null
        bare = name.slice(slash + 1)
    }
    if (!isValidSegment(bare)) return null
    if (version !== undefined) {
        if (!version) return null
        for (const char of version) {
            if (!VERSION_CHARS.includes(char)) return null
        }
    }
    return { spec, name, version }
}

/** Validate a list of package specs, de-duplicated. */
export const validatePackageSpecs = (value) => {
    if (!Array.isArray(value) || value.length === 0) {
        return { ok: false, error: 'packages must be a non-empty array' }
    }
    const specs = []
    for (const item of value) {
        const parsed = parsePackageSpec(item)
        if (!parsed) return { ok: false, error: 'invalid package spec: ' + String(item) }
        if (!specs.includes(parsed.spec)) specs.push(parsed.spec)
    }
    return { ok: true, specs }
}

/** Which package manager the project already uses. */
export const detectManager = (root) => {
    if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm'
    if (existsSync(join(root, 'yarn.lock'))) return 'yarn'
    return 'npm'
}

/** argv for one manager. Kept separate so it is unit-tested without spawning. */
export const buildInstallArgs = (manager, specs, dev = false) => {
    if (manager === 'yarn') return ['add', ...(dev ? ['--dev'] : []), ...specs]
    // The scaffold declares the host modules (@kn/common, @kn/ui, react) as
    // peerDependencies; npm 7+ and pnpm 8+ would try to fetch them from the
    // public registry and fail. Disable peer auto-install so only the
    // requested packages (and their real deps) are installed.
    if (manager === 'pnpm') {
        return ['add', ...(dev ? ['--save-dev'] : ['--save']), '--config.auto-install-peers=false', ...specs]
    }
    // Explicit --save/--save-dev so package.json is updated even when the user
    // has `save=false` in their npm config.
    return ['install', '--legacy-peer-deps', ...(dev ? ['--save-dev'] : ['--save']), ...specs]
}

/**
 * GUI apps inherit a minimal PATH, so add the usual install locations before
 * spawning. The manager itself still has to exist; we surface ENOENT clearly.
 */
export const buildPath = () => {
    const extra = [
        '/usr/local/bin',
        '/opt/homebrew/bin',
        join(homedir(), '.local', 'bin'),
        join(homedir(), '.npm-global', 'bin'),
    ]
    return [process.env.PATH, ...extra].filter(Boolean).join(delimiter)
}

/**
 * Install packages into a plugin project.
 *
 * Returns a result object instead of throwing so the studio can show the
 * package manager's output on failure. `spawnImpl` is injectable for tests.
 */
export const installDependencies = ({
    root,
    packages,
    dev = false,
    manager,
    timeoutMs = 180000,
    spawnImpl = spawn,
}) =>
    new Promise((resolve) => {
        const validation = validatePackageSpecs(packages)
        if (!validation.ok) {
            return resolve({ ok: false, manager: manager || 'npm', packages: [], output: '', error: validation.error })
        }
        const chosen = MANAGERS.includes(manager) ? manager : detectManager(root)
        const args = buildInstallArgs(chosen, validation.specs, dev === true)
        const env = { ...process.env, PATH: buildPath() }
        let child
        try {
            child = spawnImpl(chosen, args, {
                cwd: root,
                env,
                // Windows resolves npm.cmd through the shell; specs are already
                // constrained to a safe character set, so nothing else can run.
                shell: process.platform === 'win32',
                stdio: ['ignore', 'pipe', 'pipe'],
            })
        } catch (error) {
            return resolve({ ok: false, manager: chosen, packages: validation.specs, output: '', error: error.message })
        }

        let output = ''
        const append = (chunk) => {
            output += String(chunk)
            if (output.length > 20000) output = output.slice(-20000)
        }
        if (child.stdout && child.stdout.on) child.stdout.on('data', append)
        if (child.stderr && child.stderr.on) child.stderr.on('data', append)

        const timer = setTimeout(() => {
            try {
                child.kill('SIGKILL')
            } catch {
                // already gone
            }
        }, timeoutMs)

        child.on('error', (error) => {
            clearTimeout(timer)
            resolve({ ok: false, manager: chosen, packages: validation.specs, output: output.trim(), error: error.message })
        })
        child.on('close', (code) => {
            clearTimeout(timer)
            resolve({
                ok: code === 0,
                manager: chosen,
                packages: validation.specs,
                output: output.trim(),
                error: code === 0 ? undefined : 'package manager exited with code ' + code,
            })
        })
    })
