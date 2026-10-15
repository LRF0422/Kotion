/**
 * SSH capability — process runner (main process).
 *
 * Spawns the user's own `ssh` / `scp` binaries with an argv this module builds,
 * and turns the process into a structured result: no shell is involved, stdin is
 * closed for `ssh` (so a remote command can never block waiting on input), the
 * output budget is enforced while reading, and a timeout escalates SIGTERM →
 * SIGKILL so a hung connection cannot leak a process for the app's lifetime.
 *
 * `spawnImpl` / `binary` are injectable so the whole path is testable without a
 * real server (`ssh.test.mjs`), and the module imports nothing electron-side.
 */
import { spawn } from 'node:child_process'
import { createOutputCollector } from './ssh-args.mjs'

/** How long a SIGTERM'd child gets to die before it is killed outright. */
const KILL_GRACE_MS = 3000

/**
 * At most this many ssh/scp children at once; the rest queue in arrival order.
 *
 * A plugin could otherwise turn one call site into a fork bomb of ssh clients.
 * Queueing (rather than refusing) keeps "deploy to five hosts" working.
 */
const MAX_CONCURRENT_CALLS = 4
const waiting = []
let activeSlots = 0

const acquireSlot = () => {
    if (activeSlots < MAX_CONCURRENT_CALLS) {
        activeSlots += 1
        return Promise.resolve()
    }
    return new Promise((resolve) => {
        // The waiter inherits the slot the finishing call hands over, so the
        // count stays put (see releaseSlot).
        waiting.push(resolve)
    })
}

const releaseSlot = () => {
    const next = waiting.shift()
    if (next) next()
    else activeSlots -= 1
}

/** How many calls hold a slot, running or queued-to-run (tests, diagnostics). */
export const activeSshSlotCount = () => activeSlots

/**
 * Children that are still running.
 *
 * A hung `ssh` must not outlive the app: Electron does not reap children of the
 * main process on quit, so `will-quit` calls {@link killActiveSshProcesses}
 * (same reasoning as the dev-server manager's `dispose()`).
 */
const activeChildren = new Set()

/** Kill every in-flight ssh/scp child; returns how many were signalled. */
export const killActiveSshProcesses = (signal = 'SIGTERM') => {
    let killed = 0
    for (const child of activeChildren) {
        try {
            child.kill(signal)
            killed += 1
        } catch {
            /* already gone */
        }
    }
    return killed
}

/** How many children are in flight (tests, diagnostics). */
export const activeSshProcessCount = () => activeChildren.size

const asMessage = (value) => (value instanceof Error ? value.message : String(value))

/**
 * Run one child process with a byte budget and a wall-clock deadline.
 *
 * Resolves (never rejects) for a process that ran and exited non-zero — a
 * failing remote command is a *result* (`ok: false`, `code`), not an exception,
 * so callers can show its stderr. It rejects only when the process could not be
 * started at all (e.g. the ssh binary is missing).
 */
export const runSshProcess = async (
    { binary = 'ssh', args, stdinText, timeoutMs, maxOutputBytes },
    { spawnImpl = spawn, env = process.env, cwd } = {},
) => {
    // Wait for a slot first: the timeout starts when the call actually runs.
    await acquireSlot()
    return new Promise((resolve, reject) => {
        let slotReleased = false
        const releaseSlotOnce = () => {
            if (slotReleased) return
            slotReleased = true
            releaseSlot()
        }
        let child
        try {
            child = spawnImpl(binary, args, {
                // `ssh` gets a closed stdin: a command that reads stdin must not
                // silently succeed as an empty read. `scp` has no batch input.
                stdio: [stdinText === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
                env,
                cwd,
                windowsHide: true,
            })
        } catch (error) {
            releaseSlotOnce()
            reject(new Error(`desktop ssh: cannot run "${binary}": ${asMessage(error)}`))
            return
        }

        const stdout = createOutputCollector(maxOutputBytes)
        const stderr = createOutputCollector(maxOutputBytes)
        activeChildren.add(child)
        const startedAt = Date.now()
        let timedOut = false
        let settled = false
        let killTimer = null

        const timer = setTimeout(() => {
            timedOut = true
            try {
                child.kill('SIGTERM')
            } catch {
                /* already gone */
            }
            killTimer = setTimeout(() => {
                try {
                    child.kill('SIGKILL')
                } catch {
                    /* already gone */
                }
            }, KILL_GRACE_MS)
        }, timeoutMs)

        const cleanup = () => {
            clearTimeout(timer)
            if (killTimer) clearTimeout(killTimer)
            activeChildren.delete(child)
            releaseSlotOnce()
        }

        child.stdout?.on('data', (chunk) => stdout.push(chunk))
        child.stderr?.on('data', (chunk) => stderr.push(chunk))

        child.on('error', (error) => {
            if (settled) return
            settled = true
            cleanup()
            const hint = error && error.code === 'ENOENT'
                ? `desktop ssh: "${binary}" was not found. Install an OpenSSH client or put it on PATH.`
                : `desktop ssh: cannot run "${binary}": ${asMessage(error)}`
            reject(new Error(hint))
        })

        child.on('close', (code, signal) => {
            if (settled) return
            settled = true
            cleanup()
            const out = stdout.result()
            const err = stderr.result()
            resolve({
                ok: code === 0 && !timedOut,
                code: code === null ? null : Number(code),
                signal: signal ?? null,
                stdout: out.text,
                stderr: err.text,
                truncated: out.truncated || err.truncated,
                timedOut,
                durationMs: Date.now() - startedAt,
                /** The exact argv that ran — useful when a failure is about flags. */
                argv: [binary, ...args],
            })
        })

        if (stdinText !== undefined) {
            // scp reads batch/command input from stdin in the modes we use; an
            // EPIPE means the child exited early, which `close` will report.
            child.stdin?.on('error', () => undefined)
            child.stdin?.end(stdinText)
        }
    })
}
