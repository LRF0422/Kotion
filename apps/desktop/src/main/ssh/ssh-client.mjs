/**
 * SSH capability — the ssh2 client (main process).
 *
 * One place owns the protocol: connect (agent/identity auth + host-key verdict),
 * buffered `exec`, the SFTP directory calls, and the interactive **pty shell**
 * as a streaming session. Pure Node apart from the `ssh2` import, so an
 * in-process `ssh2.Server` can drive all of it in tests (`ssh.test.mjs`) —
 * including the pty resize, which is the whole reason the host moved off
 * spawning the `ssh` binary (a pipe has no window size to forward).
 *
 * Failure semantics: a remote non-zero exit is a *result* (`ok: false`), not a
 * throw. Only "could not connect / could not authenticate / refused host key"
 * rejects, because those are the caller's problems to fix.
 */
// ssh2 is CommonJS: a default import is the interop-safe form (named imports
// only work when the bundler can see the CJS exports statically).
import ssh2 from 'ssh2'

const { Client } = ssh2
import {
    MAX_SFTP_ENTRIES,
    createOutputCollector,
} from './ssh-params.mjs'
import { buildAuthConfig, readKnownHostStore, readKnownHosts, verifyHostKey } from './ssh-keys.mjs'

/** How long to wait for the TCP+handshake+auth phase. */
const CONNECT_TIMEOUT_MS = 20_000

/** Per-SFTP-operation deadline; see callSftp. */
const SFTP_TIMEOUT_MS = 60_000

const asMessage = (value) => (value instanceof Error ? value.message : String(value))

/**
 * What to offer the server.
 *
 * A **stored credential wins outright**: the user typed it for this host, so
 * the connection uses exactly that instead of quietly trying the agent first and
 * reporting a failure about the wrong method. Without one, the user's
 * environment is used (agent, then default identity files), which is what the
 * feature shipped with.
 */
export const buildConnectAuth = ({ homeDir, env, credential } = {}) => {
    if (credential?.error) return { __authError: credential.error }
    if (credential?.privateKey) {
        return {
            privateKey: credential.privateKey,
            ...(credential.passphrase ? { passphrase: credential.passphrase } : {}),
        }
    }
    if (credential?.password) {
        // `tryKeyboard` lets ssh2 answer `keyboard-interactive` prompts too.
        return { password: credential.password, tryKeyboard: true }
    }
    return buildAuthConfig({ homeDir, env })
}

/**
 * Open one connection.
 *
 * `onHostKey` is called with the trust verdict; returning `false` (or throwing)
 * aborts the handshake. The verdict comes from `ssh-keys.mjs`, which is where
 * the known_hosts/TOFU rules live.
 */
export const connectSsh = (
    { target, hostKeyPolicy = 'strict', timeoutMs = CONNECT_TIMEOUT_MS, knownStorePath, homeDir, env, credential },
    { clientFactory = () => new Client() } = {},
) =>
    new Promise((resolve, reject) => {
        const client = clientFactory()
        const auth = buildConnectAuth({ homeDir, env, credential })
        if (auth.__authError) {
            settled = true
            reject(new Error(auth.__authError))
            return
        }
        const entries = readKnownHosts({ homeDir })
        const known = readKnownHostStore(knownStorePath)
        /** Set by the synchronous host-key callback below. */
        let verdict = null
        let settled = false

        const timer = setTimeout(() => {
            if (settled) return
            settled = true
            try {
                client.end()
            } catch {
                /* already gone */
            }
            reject(new Error(`desktop ssh: connection to ${target.host}:${target.port} timed out`))
        }, Math.min(timeoutMs, CONNECT_TIMEOUT_MS))

        const fail = (error) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            try {
                client.end()
            } catch {
                /* already gone */
            }
            reject(error instanceof Error ? error : new Error(String(error)))
        }

        client.on('error', (error) => {
            // A refused host key surfaces here as ssh2's own message; ours says
            // what actually happened (changed key / not in known_hosts).
            if (verdict && !verdict.ok) {
                fail(new Error(verdict.reason))
                return
            }
            // "All configured authentication methods failed" is the single most
            // confusing failure in this feature: say what was tried and where to
            // fix it, instead of echoing ssh2.
            if (error && error.level === 'client-authentication') {
                fail(
                    new Error(
                        'desktop ssh: authentication failed for ' +
                            `${target.user ? `${target.user}@` : ''}${target.host}:${target.port}. ` +
                            (credential
                                ? 'The stored credential was offered and rejected — check it in 设置 → SSH 凭据.'
                                : 'No stored credential matched and the ssh-agent / ~/.ssh keys were not accepted. ' +
                                  'Add a password or key in 设置 → SSH 凭据。'),
                    ),
                )
                return
            }
            fail(new Error(`desktop ssh: ${asMessage(error)}`))
        })

        /**
         * Servers that ask for the password via `keyboard-interactive` rather
         * than `password` (PAM, 2FA prompts) are extremely common; without this
         * hook a stored password is never offered to them.
         */
        client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
            const secret = credential?.password ?? credential?.passphrase
            if (!secret) {
                finish([])
                return
            }
            finish(prompts.map(() => secret))
        })
        client.on('close', () => {
            if (!settled) fail(new Error('desktop ssh: connection closed before it was ready'))
        })
        client.on('ready', () => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            resolve({ client, auth, verdict })
        })

        try {
            client.connect({
                host: target.host,
                port: target.port,
                username: target.user ?? undefined,
                readyTimeout: Math.min(timeoutMs, CONNECT_TIMEOUT_MS),
                keepaliveInterval: 15_000,
                keepaliveCountMax: 3,
                /**
                 * The verdict gate. ssh2 calls this with the server key *before*
                 * authentication, and `false` aborts the handshake — so a bad key
                 * can never be followed by a login attempt (which is what doing
                 * the check asynchronously in a `handshake` listener would risk).
                 */
                hostVerifier: (key) => {
                    verdict = verifyHostKey({
                        host: target.host,
                        port: target.port,
                        key,
                        entries,
                        known,
                        policy: hostKeyPolicy,
                    })
                    return verdict.ok
                },
                ...auth,
            })
        } catch (error) {
            clearTimeout(timer)
            reject(new Error(`desktop ssh: cannot connect to ${target.host}:${target.port}: ${asMessage(error)}`))
        }
    })

/** Close a connection without throwing. */
export const endSsh = (client) => {
    try {
        client?.end()
    } catch {
        /* already gone */
    }
}

/**
 * Run one command and buffer its output.
 *
 * `stdin` is closed immediately (`stream.end()`): a command that reads stdin
 * must fail fast rather than hang as an empty read.
 */
export const execSsh = (client, { command, timeoutMs, maxOutputBytes }) =>
    new Promise((resolve, reject) => {
        const stdout = createOutputCollector(maxOutputBytes)
        const stderr = createOutputCollector(maxOutputBytes)
        const startedAt = Date.now()
        let timedOut = false
        let settled = false

        client.exec(command, (error, stream) => {
            if (error) {
                reject(new Error(`desktop ssh: exec failed: ${asMessage(error)}`))
                return
            }
            const timer = setTimeout(() => {
                timedOut = true
                try {
                    stream.close()
                } catch {
                    /* already gone */
                }
            }, timeoutMs)

            stream.on('data', (chunk) => stdout.push(chunk))
            stream.stderr.on('data', (chunk) => stderr.push(chunk))
            stream.on('close', (code, signal) => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                const out = stdout.result()
                const err = stderr.result()
                resolve({
                    ok: code === 0 && !timedOut,
                    code: code === null || code === undefined ? null : Number(code),
                    signal: signal ? String(signal) : null,
                    stdout: out.text,
                    stderr: err.text,
                    truncated: out.truncated || err.truncated,
                    timedOut,
                    durationMs: Date.now() - startedAt,
                })
            })
            stream.on('error', (streamError) => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                reject(new Error(`desktop ssh: exec stream failed: ${asMessage(streamError)}`))
            })
            // No stdin: a command that reads it must not block forever.
            try {
                stream.end()
            } catch {
                /* some servers close immediately */
            }
        })
    })

/** Wrap ssh2's callback-style SFTP methods once per connection. */
const sftp = (client) =>
    new Promise((resolve, reject) => {
        client.sftp((error, sftpSession) => {
            if (error) reject(new Error(`desktop ssh: cannot open sftp: ${asMessage(error)}`))
            else resolve(sftpSession)
        })
    })

/**
 * Run one SFTP method with a deadline.
 *
 * ssh2's SFTP methods are callback-only: a server that never answers (an
 * unsupported operation, a half-open connection) leaves the promise pending
 * forever, which in this app means a renderer IPC call that never returns. The
 * timeout turns that into a normal failure. `showProgress` callers (fastPut /
 * fastGet) resolve on callback exactly like the rest.
 */
const callSftp = (session, method, ...args) =>
    new Promise((resolve, reject) => {
        let settled = false
        const timer = setTimeout(() => {
            if (settled) return
            settled = true
            reject(new Error(`desktop ssh: sftp ${method} timed out`))
        }, SFTP_TIMEOUT_MS)
        session[method](...args, (error, result) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            if (error) reject(new Error(`desktop ssh: sftp ${method} failed: ${asMessage(error)}`))
            else resolve(result)
        })
    })

/** Join a directory and an entry name without doubling the separator. */
const joinRemote = (dir, name) => (String(dir).endsWith('/') ? `${dir}${name}` : `${dir}/${name}`)

/** Map an ssh2 SFTP entry onto a plain, serializable shape. */
const toEntry = (entry, dir) => {
    const name = String(entry.filename ?? '')
    return {
        name,
        /** Full remote path, so a caller never has to re-join it. */
        path: joinRemote(dir, name),
        longname: String(entry.longname ?? ''),
        directory: Boolean(entry.attrs?.isDirectory?.()),
        file: Boolean(entry.attrs?.isFile?.()),
        symlink: Boolean(entry.attrs?.isSymbolicLink?.()),
        size: Number(entry.attrs?.size ?? 0),
        mode: Number(entry.attrs?.mode ?? 0),
        /** Epoch ms, like the rest of the bridge's timestamps. */
        modifiedAt: Number(entry.attrs?.mtime ?? 0) * 1000,
        uid: Number(entry.attrs?.uid ?? 0),
        gid: Number(entry.attrs?.gid ?? 0),
    }
}

/** List one remote directory. */
export const sftpList = async (client, { path }) => {
    const session = await sftp(client)
    try {
        const entries = await callSftp(session, 'readdir', path)
        const mapped = entries.map((entry) => toEntry(entry, path))
        const truncated = mapped.length > MAX_SFTP_ENTRIES
        return { path, entries: truncated ? mapped.slice(0, MAX_SFTP_ENTRIES) : mapped, truncated }
    } finally {
        try {
            session.end()
        } catch {
            /* already closed */
        }
    }
}

/** Stat one remote path. */
export const sftpStat = async (client, { path }) => {
    const session = await sftp(client)
    try {
        const stats = await callSftp(session, 'stat', path)
        return {
            path,
            size: Number(stats.size ?? 0),
            mode: Number(stats.mode ?? 0),
            directory: Boolean(stats.isDirectory?.()),
            file: Boolean(stats.isFile?.()),
            symlink: Boolean(stats.isSymbolicLink?.()),
            modifiedAt: Number(stats.mtime ?? 0) * 1000,
            accessedAt: Number(stats.atime ?? 0) * 1000,
            uid: Number(stats.uid ?? 0),
            gid: Number(stats.gid ?? 0),
        }
    } finally {
        try {
            session.end()
        } catch {
            /* already closed */
        }
    }
}

/** Run one mutating SFTP call in its own session. */
const withSftp = async (client, run) => {
    const session = await sftp(client)
    try {
        return await run(session)
    } finally {
        try {
            session.end()
        } catch {
            /* already closed */
        }
    }
}

export const sftpMkdir = (client, { path, recursive = false }) =>
    withSftp(client, async (session) => {
        if (!recursive) {
            await callSftp(session, 'mkdir', path)
            return { path, created: true }
        }
        // ssh2 has no mkdir -p: create each missing segment in order.
        const segments = String(path).split('/').filter(Boolean)
        const absolute = String(path).startsWith('/')
        let current = absolute ? '' : '.'
        for (const segment of segments) {
            current = current === '' ? `/${segment}` : `${current}/${segment}`
            try {
                await callSftp(session, 'mkdir', current)
            } catch (error) {
                // Already there is fine; anything else is not.
                const existing = await callSftp(session, 'stat', current).catch(() => null)
                if (!existing?.isDirectory?.()) throw error
            }
        }
        return { path, created: true }
    })

export const sftpRename = (client, { from, to, overwrite = false }) =>
    withSftp(client, async (session) => {
        // POSIX rename overwrites silently; make that a decision, not a surprise.
        if (!overwrite) {
            const target = await callSftp(session, 'stat', to).catch(() => null)
            if (target) throw new Error(`desktop ssh: refusing to overwrite existing "${to}" (pass overwrite: true)`)
        }
        await callSftp(session, 'rename', from, to)
        return { from, to }
    })

export const sftpRemove = (client, { path, directory = false }) =>
    withSftp(client, async (session) => {
        if (directory) {
            await callSftp(session, 'rmdir', path)
            return { path, removed: true }
        }
        await callSftp(session, 'unlink', path)
        return { path, removed: true }
    })

/** Upload a local file (`fastPut`). */
export const sftpUpload = (client, { localPath, remotePath }) =>
    withSftp(client, async (session) => {
        const startedAt = Date.now()
        await callSftp(session, 'fastPut', localPath, remotePath)
        return { localPath, remotePath, durationMs: Date.now() - startedAt }
    })

/** Download a remote file (`fastGet`). */
export const sftpDownload = (client, { remotePath, localPath }) =>
    withSftp(client, async (session) => {
        const startedAt = Date.now()
        await callSftp(session, 'fastGet', remotePath, localPath)
        return { localPath, remotePath, durationMs: Date.now() - startedAt }
    })

/**
 * Open an interactive shell (remote pty) and stream it.
 *
 * The returned handle is what the IPC layer keeps per session id. `cols`/`rows`
 * are sent again on every resize — the capability a spawned `ssh` pipe cannot
 * provide, because there is no local tty whose size could change.
 */
export const openShell = (
    client,
    { term = 'xterm-256color', cols = 80, rows = 24, onData, onExit, onError },
) =>
    new Promise((resolve, reject) => {
        client.shell({ term, cols, rows }, (error, stream) => {
            if (error) {
                reject(new Error(`desktop ssh: cannot open shell: ${asMessage(error)}`))
                return
            }
            let settled = false
            stream.on('data', (chunk) => onData?.(chunk))
            stream.stderr?.on('data', (chunk) => onData?.(chunk))
            stream.on('close', (code, signal) => {
                if (settled) return
                settled = true
                onExit?.({ code: code === null || code === undefined ? null : Number(code), signal: signal ? String(signal) : null })
            })
            stream.on('error', (streamError) => {
                if (settled) return
                settled = true
                onError?.(new Error(asMessage(streamError)))
            })
            resolve({
                stream,
                write: (data) => {
                    if (settled) return false
                    stream.write(data)
                    return true
                },
                resize: (nextCols, nextRows) => {
                    if (settled) return false
                    // ssh2 emits the pty window-change itself.
                    stream.setWindow(nextRows, nextCols, 0, 0)
                    return true
                },
                close: () => {
                    if (settled) return false
                    try {
                        stream.end()
                    } catch {
                        /* already gone */
                    }
                    return true
                },
                get closed() {
                    return settled
                },
            })
        })
    })
