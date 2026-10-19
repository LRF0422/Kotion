/**
 * SSH capability — Electron wiring (main process).
 *
 * Three gates stand between a plugin and a remote host, in this order:
 *
 *   1. **Network policy** (`../net-policy`): private / loopback / metadata
 *      targets are refused unless the user lifted that switch in Settings —
 *      the same switch `http.request` obeys, re-checked on every call because
 *      DNS and the policy can both change.
 *   2. **A per-host user grant**: the first time this app run talks to a
 *      `user@host:port`, the user is asked in a modal dialog naming the target,
 *      the host-key policy, the auth source, and what is being requested — a
 *      command, a transfer, a directory change, or an **interactive shell**.
 *      Refusing (or having no window to ask in) fails closed. Grants live in
 *      memory for the app run.
 *   3. **The protocol** (`ssh-client.mjs`): the host key is verified against
 *      `~/.ssh/known_hosts` (hashed entries included) *before* authentication.
 *
 * Credentials are absent from the contract by design: auth is the user's
 * ssh-agent and default identity files. An interactive shell is the strongest
 * thing this surface can hand a plugin, which is why it gets its own wording in
 * the dialog rather than riding on "this host was already allowed".
 *
 * Connection strategy: `exec`, every SFTP call and every transfer go through the
 * connection pool (`ssh-pool.mjs`) — one reused client and one lazily opened
 * SFTP channel per `user@host:port` + host-key policy, reaped 60 s after the
 * last call releases it. An interactive shell still owns a dedicated connection
 * for as long as it lives (a pty is not a request/response call) and streams
 * over `desktop:event:ssh`.
 */
import { app, BrowserWindow, dialog, ipcMain, safeStorage } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import * as dns from 'node:dns'
import { join } from 'node:path'
import { isIP } from 'node:net'
import { classifyAddress } from '../net-policy'
import { getNetPolicy } from '../net-policy-store'
import {
    clampSshOutputBytes,
    clampSshTimeout,
    normalizeHostKeyPolicy,
    normalizeRemotePath,
    normalizeSessionId,
    normalizeShellInput,
    normalizeShellSize,
    normalizeSshCommand,
    normalizeSshTarget,
    normalizeTerm,
    sshDenyReason,
    sshGrantKey,
} from './ssh-params.mjs'
import { buildAuthConfig, describeAuth, readKnownHostStore, sshKnownHostsStorePath } from './ssh-keys.mjs'
import {
    listCredentials,
    removeCredential,
    resolveCredential,
    setCredential,
} from './ssh-credentials.mjs'
import {
    connectSsh,
    endSsh,
    execSsh,
    openShell,
    openSftpSession,
    sftpDownload,
    sftpList,
    sftpMkdir,
    sftpRemove,
    sftpRename,
    sftpStat,
    sftpUpload,
} from './ssh-client.mjs'
import { createSshPool } from './ssh-pool.mjs'

interface SshGrant {
    /** `user@host:port` — the identity `forget` revokes (all scopes at once). */
    key: string
    host: string
    user: string | null
    port: number
    hostKeyPolicy: 'strict' | 'accept-new'
    /**
     * What the user actually allowed.
     *
     * A grant is per host **and** per operation class: letting a plugin run a
     * command must not silently let it open an interactive terminal on the same
     * host, because a shell is the strongest thing this surface can hand out.
     */
    scope: SshRequestKind
    grantedAt: number
}

interface SetupSshOptions {
    /** The shared fs allowlist validator from `setupIpcHandlers`. */
    assertAllowedPath: (value: unknown, label: string) => string
}

type SshRequestKind = 'command' | 'transfer' | 'sftp' | 'shell'

interface ShellSession {
    id: string
    host: string
    user: string | null
    port: number
    openedAt: number
    cols: number
    rows: number
    client: unknown
    handle: { write: (data: string) => boolean; resize: (cols: number, rows: number) => boolean; close: () => boolean }
}

const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

/**
 * Terminal output travels as base64: ssh2 hands over `Buffer`s that can split a
 * multi-byte character across chunks, and a JSON string round-trip would turn
 * that into mojibake the terminal can never repair.
 */
const toBase64 = (chunk: unknown) => Buffer.from(chunk as Buffer).toString('base64')

/** Dialog copy follows the OS locale; the main process has no i18n runtime. */
const dialogStrings = (locale: string) =>
    locale.toLowerCase().startsWith('zh')
        ? {
              title: 'SSH 连接授权',
              allow: '允许',
              deny: '拒绝',
              message: (key: string) => `有插件请求通过 SSH 连接 ${key}`,
              kind: {
                  command: '操作：远程执行命令',
                  transfer: '操作：上传 / 下载文件',
                  sftp: '操作：读取或修改远端目录',
                  shell: '操作：打开「交互式终端」——远端 pty，可以输入任意命令',
              } as Record<SshRequestKind, string>,
              policyStrict: '主机密钥：严格校验（按 ~/.ssh/known_hosts）',
              policyAcceptNew: '主机密钥：首次自动信任（accept-new，会记住该密钥）',
              auth: (source: string) => `凭证：${source}（宿主不接收、不保存任何密码或私钥）`,
              remember: '允许后，本次运行内该主机的后续调用不再询问（可在设置里“忘记”）。',
          }
        : {
              title: 'SSH connection request',
              allow: 'Allow',
              deny: 'Deny',
              message: (key: string) => `A plugin wants to connect to ${key} over SSH`,
              kind: {
                  command: 'Action: run a remote command',
                  transfer: 'Action: upload / download a file',
                  sftp: 'Action: read or modify a remote directory',
                  shell: 'Action: open an INTERACTIVE TERMINAL (remote pty, arbitrary input)',
              } as Record<SshRequestKind, string>,
              policyStrict: 'Host key: strict (verify against ~/.ssh/known_hosts)',
              policyAcceptNew: 'Host key: accept-new (trust on first use, remembered)',
              auth: (source: string) => `Credentials: ${source} (the host never receives or stores a password or key)`,
              remember: 'Allowing covers later calls to this host for this app run (revocable at any time).',
          }

export function setupSshIpcHandlers({ assertAllowedPath }: SetupSshOptions) {
    /** Grants for this app run only: `user@host:port` → grant. */
    const grants = new Map<string, SshGrant>()
    /** Live interactive shells, by session id. */
    const shells = new Map<string, ShellSession>()
    let nextShellId = 0

    const knownStorePath = () => sshKnownHostsStorePath(app.getPath('userData'))

    /**
     * Credential storage bound to this profile.
     *
     * `canEncrypt` gates *storing*: on a Linux box without a keyring Electron
     * degrades to a fixed key, and a password behind that is not protected — the
     * UI is told so instead of pretending.
     */
    const credentialsFile = () => join(app.getPath('userData'), 'ssh-credentials.json')
    const credentialIo = {
        readFile: () => {
            try {
                return readFileSync(credentialsFile(), 'utf8')
            } catch {
                return ''
            }
        },
        writeFile: (contents: string) => writeFileSync(credentialsFile(), contents, 'utf8'),
        canEncrypt: () => {
            try {
                if (!safeStorage.isEncryptionAvailable()) return false
                const backend = (safeStorage as { getSelectedStorageBackend?: () => string })
                    .getSelectedStorageBackend?.()
                return backend !== 'basic_text'
            } catch {
                return false
            }
        },
        encrypt: (plain: string) => safeStorage.encryptString(plain).toString('base64'),
        decrypt: (cipher: string) => safeStorage.decryptString(Buffer.from(cipher, 'base64')),
    }

    const broadcast = (payload: Record<string, unknown>) => {
        for (const window of BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed()) window.webContents.send('desktop:event:ssh', payload)
        }
    }

    /** Persist a trust-on-first-use key so the next connection pins it. */
    const rememberHostKey = (name: string, fingerprint: string) => {
        const path = knownStorePath()
        try {
            const store = readKnownHostStore(path)
            store[name] = fingerprint
            writeFileSync(path, JSON.stringify(store, null, 2), 'utf8')
        } catch {
            // A read-only profile must not break the connection that just worked.
        }
    }

    /** Refuse a target the network policy blocks (literal, or every resolved answer). */
    const assertTargetAllowed = async (host: string): Promise<void> => {
        const policy = getNetPolicy()
        if (isIP(host) !== 0) {
            const verdict = classifyAddress(host)
            if (verdict === 'metadata') throw new Error(sshDenyReason('metadata'))
            if (verdict === 'private' && !policy.allowPrivateNetwork) throw new Error(sshDenyReason('private'))
            return
        }
        let records: Array<{ address: string }>
        try {
            records = await dns.promises.lookup(host, { all: true })
        } catch {
            throw new Error(`desktop ssh: cannot resolve host "${host}"`)
        }
        if (!records.length) throw new Error(`desktop ssh: cannot resolve host "${host}"`)
        for (const record of records) {
            const verdict = classifyAddress(record.address)
            if (verdict === 'metadata') throw new Error(sshDenyReason('metadata'))
            if (verdict === 'private' && !policy.allowPrivateNetwork) {
                throw new Error(sshDenyReason('private', { resolved: true }))
            }
        }
    }

    const requireGrant = async (
        event: Electron.IpcMainInvokeEvent,
        target: { host: string; user: string | null; port: number },
        hostKeyPolicy: 'strict' | 'accept-new',
        kind: SshRequestKind,
        detail: string,
    ): Promise<SshGrant> => {
        const key = sshGrantKey(target)
        const grantId = `${kind}:${key}`
        const existing = grants.get(grantId)
        // A grant made under `strict` must not silently cover `accept-new`
        // (the weaker policy), and it never covers another operation class —
        // so a changed request asks again.
        if (existing && existing.hostKeyPolicy === hostKeyPolicy) return existing

        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) throw new Error(`desktop ssh: no window is available to confirm "${key}"`)
        const t = dialogStrings(app.getLocale())
        const { response } = await dialog.showMessageBox(win, {
            type: 'question',
            buttons: [t.allow, t.deny],
            defaultId: 1,
            cancelId: 1,
            noLink: true,
            title: t.title,
            message: t.message(key),
            detail:
                `${t.kind[kind]}${detail ? `（${detail}）` : ''}\n\n` +
                `${hostKeyPolicy === 'strict' ? t.policyStrict : t.policyAcceptNew}\n` +
                `${t.auth(describeAuth(buildAuthConfig({})))}\n${t.remember}`,
        })
        if (response !== 0) throw new Error(`desktop ssh: the user refused the connection to "${key}"`)
        const grant: SshGrant = { key, ...target, hostKeyPolicy, scope: kind, grantedAt: Date.now() }
        grants.set(grantId, grant)
        return grant
    }

    /** Connect with the current trust rules, remembering a newly trusted key. */
    const connect = async (options: {
        target: { host: string; user: string | null; port: number }
        hostKeyPolicy: 'strict' | 'accept-new'
        credentialId?: string
    }) => {
        // The secret is resolved here and only here: a plugin passes a target or
        // an id, never a password.
        const credential = resolveCredential(credentialIo, {
            id: options.credentialId,
            host: options.target.host,
            user: options.target.user,
            port: options.target.port,
        })
        const session = await connectSsh({
            ...options,
            credential,
            knownStorePath: knownStorePath(),
            timeoutMs: 20_000,
        })
        if (session.verdict?.learned) {
            rememberHostKey(`${options.target.host}:${options.target.port}`, session.verdict.fingerprint)
        }
        return session
    }

    /**
     * Reused connections: one ssh2 Client and one lazily opened SFTP channel per
     * `user@host:port` + host-key policy, closed 60 s after the last call
     * releases it. The pool never decides trust — `connect` above is still the
     * only way in — and anything that changes that decision invalidates it
     * (`forget` and credential changes below). A shell opts out (see
     * `withConnection`) because a pty owns its connection.
     */
    const pool = createSshPool({ openSftp: openSftpSession, end: endSsh })

    /** Normalize + policy-check + grant-check, then run one call on a pooled client. */
    const withConnection = async (
        event: Electron.IpcMainInvokeEvent,
        raw: unknown,
        kind: SshRequestKind,
        detail: string,
        run: (context: {
            client: unknown
            target: { host: string; user: string | null; port: number }
            params: Record<string, unknown>
            timeoutMs: number
            maxOutputBytes: number
            /** The shared SFTP channel for this connection, opened on first use. */
            openSftp: () => Promise<unknown>
        }) => Promise<unknown>,
        { pooled = true }: { pooled?: boolean } = {},
    ) => {
        const params = asRecord(raw)
        const target = normalizeSshTarget(params)
        const hostKeyPolicy = normalizeHostKeyPolicy(params.hostKeyPolicy)
        const timeoutMs = clampSshTimeout(params.timeoutMs)
        const maxOutputBytes = clampSshOutputBytes(params.maxOutputBytes)
        await assertTargetAllowed(target.host)
        await requireGrant(event, target, hostKeyPolicy, kind, detail)

        const credentialId = typeof params.credentialId === 'string' ? params.credentialId : undefined
        // An interactive shell must not share a connection with request/response
        // calls: it owns its client until `shellClose` (or the remote exit).
        const lease = pooled
            ? await pool.acquire({
                  target,
                  hostKeyPolicy,
                  connect: () => connect({ target, hostKeyPolicy, credentialId }),
              })
            : null
        const session = lease ? null : await connect({ target, hostKeyPolicy, credentialId })
        const client = lease ? lease.client : session?.client
        let keepAlive = false
        try {
            const outcome = await run({
                client,
                target,
                params,
                timeoutMs,
                maxOutputBytes,
                openSftp: () => lease?.sftp() ?? Promise.reject(new Error('desktop ssh: no sftp channel')),
            })
            // A shell keeps its connection: shellClose (or the exit event) owns
            // it, not this call's scope.
            if (outcome && typeof outcome === 'object' && (outcome as { keepAlive?: boolean }).keepAlive) {
                keepAlive = true
                return (outcome as { result: unknown }).result
            }
            return outcome
        } catch (error) {
            // A stalled SFTP operation leaves a request in flight on the shared
            // channel (the server stopped answering), so the connection must not
            // be handed to the next call.
            if (lease && (error as { code?: string })?.code === 'SSH_SFTP_TIMEOUT') lease.invalidate()
            throw error
        } finally {
            if (lease) lease.release()
            else if (!keepAlive) endSsh(client)
        }
    }

    /* ---------------- exec ---------------- */
    ipcMain.handle('desktop:ssh.exec', (event, raw) =>
        withConnection(event, raw, 'command', '', async ({ client, target, params, timeoutMs, maxOutputBytes }) => {
            const command = normalizeSshCommand(params.command)
            const result = await execSsh(client, { command, timeoutMs, maxOutputBytes })
            return { ...target, command, ...result }
        }),
    )

    /* ---------------- file transfer ---------------- */
    const transfer = (direction: 'put' | 'get') => (event: Electron.IpcMainInvokeEvent, raw: unknown) =>
        withConnection(event, raw, 'transfer', direction === 'put' ? '上传' : '下载', async ({ client, target, params, openSftp }) => {
            const localPath = assertAllowedPath(params.localPath, 'localPath')
            const remotePath = normalizeRemotePath(params.remotePath)
            const session = await openSftp()
            // The upload/download helpers already report both paths and the
            // duration, so the result is just the target plus their report.
            const moved =
                direction === 'put'
                    ? await sftpUpload(client, { localPath, remotePath }, { session })
                    : await sftpDownload(client, { remotePath, localPath }, { session })
            return { ...target, direction, ok: true, ...moved }
        })
    ipcMain.handle('desktop:ssh.put', transfer('put'))
    ipcMain.handle('desktop:ssh.get', transfer('get'))

    /* ---------------- sftp directory calls ---------------- */
    ipcMain.handle('desktop:ssh.sftpList', (event, raw) =>
        withConnection(event, raw, 'sftp', 'list', async ({ client, target, params, openSftp }) => {
            const path = normalizeRemotePath(params.path, 'path')
            return { ...target, ...(await sftpList(client, { path }, { session: await openSftp() })) }
        }),
    )
    ipcMain.handle('desktop:ssh.sftpStat', (event, raw) =>
        withConnection(event, raw, 'sftp', 'stat', async ({ client, target, params, openSftp }) => {
            const path = normalizeRemotePath(params.path, 'path')
            return { ...target, ...(await sftpStat(client, { path }, { session: await openSftp() })) }
        }),
    )
    ipcMain.handle('desktop:ssh.sftpMkdir', (event, raw) =>
        withConnection(event, raw, 'sftp', 'mkdir', async ({ client, target, params, openSftp }) => {
            const path = normalizeRemotePath(params.path, 'path')
            return {
                ...target,
                ...(await sftpMkdir(client, { path, recursive: params.recursive === true }, { session: await openSftp() })),
            }
        }),
    )
    ipcMain.handle('desktop:ssh.sftpRename', (event, raw) =>
        withConnection(event, raw, 'sftp', 'rename', async ({ client, target, params, openSftp }) => {
            const from = normalizeRemotePath(params.from, 'from')
            const to = normalizeRemotePath(params.to, 'to')
            return {
                ...target,
                ...(await sftpRename(client, { from, to, overwrite: params.overwrite === true }, { session: await openSftp() })),
            }
        }),
    )
    ipcMain.handle('desktop:ssh.sftpRemove', (event, raw) =>
        withConnection(event, raw, 'sftp', 'remove', async ({ client, target, params, openSftp }) => {
            const path = normalizeRemotePath(params.path, 'path')
            return {
                ...target,
                ...(await sftpRemove(client, { path, directory: params.directory === true }, { session: await openSftp() })),
            }
        }),
    )

    /* ---------------- interactive shell (pty) ---------------- */
    ipcMain.handle('desktop:ssh.shellOpen', (event, raw) =>
        withConnection(
            event,
            raw,
            'shell',
            '',
            async ({ client, target, params }) => {
                const { cols, rows } = normalizeShellSize(params)
                const term = normalizeTerm(params.term)
                const id = `sh-${++nextShellId}-${Date.now().toString(36)}`
                const handle = await openShell(client, {
                    term,
                    cols,
                    rows,
                    onData: (chunk) => broadcast({ type: 'shell-data', sessionId: id, data: toBase64(chunk) }),
                    onExit: (info) => {
                        broadcast({ type: 'shell-exit', sessionId: id, code: info.code, signal: info.signal })
                        const live = shells.get(id)
                        shells.delete(id)
                        endSsh(live?.client ?? client)
                    },
                    onError: (error) => {
                        broadcast({ type: 'shell-error', sessionId: id, message: error.message })
                        const live = shells.get(id)
                        shells.delete(id)
                        endSsh(live?.client ?? client)
                    },
                })
                const session: ShellSession = {
                    id,
                    host: target.host,
                    user: target.user,
                    port: target.port,
                    openedAt: Date.now(),
                    cols,
                    rows,
                    client,
                    handle,
                }
                shells.set(id, session)
                // The shell owns its connection: `withConnection` must not close it.
                return {
                    result: { sessionId: id, ...target, cols, rows, term },
                    keepAlive: true,
                }
            },
            { pooled: false },
        ),
    )

    ipcMain.handle('desktop:ssh.shellWrite', (_event, raw) => {
        const params = asRecord(raw)
        const session = shells.get(normalizeSessionId(params.sessionId))
        if (!session) throw new Error('desktop ssh: no such shell session')
        return session.handle.write(normalizeShellInput(params.data))
    })

    ipcMain.handle('desktop:ssh.shellResize', (_event, raw) => {
        const params = asRecord(raw)
        const session = shells.get(normalizeSessionId(params.sessionId))
        if (!session) throw new Error('desktop ssh: no such shell session')
        const { cols, rows } = normalizeShellSize(params)
        session.cols = cols
        session.rows = rows
        return session.handle.resize(cols, rows)
    })

    ipcMain.handle('desktop:ssh.shellClose', (_event, raw) => {
        const params = asRecord(raw)
        const id = normalizeSessionId(params.sessionId)
        const session = shells.get(id)
        if (!session) return false
        shells.delete(id)
        try {
            session.handle.close()
        } finally {
            endSsh(session.client)
        }
        return true
    })

    ipcMain.handle('desktop:ssh.shells', () =>
        [...shells.values()]
            .map(({ id, host, user, port, openedAt, cols, rows }) => ({
                sessionId: id,
                host,
                user,
                port,
                openedAt,
                cols,
                rows,
            }))
            .sort((a, b) => a.openedAt - b.openedAt),
    )

    /* ---------------- stored credentials ---------------- */
    ipcMain.handle('desktop:ssh.credentialsAvailable', () => credentialIo.canEncrypt())
    // Metadata only: the secret never crosses this boundary (see ssh-credentials.mjs).
    ipcMain.handle('desktop:ssh.credentialsList', () => listCredentials(credentialIo))
    ipcMain.handle('desktop:ssh.credentialsSet', (_event, raw) => {
        const result = setCredential(credentialIo, asRecord(raw))
        // A rotated secret must apply to the next call: any pooled connection for
        // that target authenticated with the previous one (or with the agent).
        if (result.ok && result.credential) pool.invalidate(result.credential)
        return result
    })
    ipcMain.handle('desktop:ssh.credentialsRemove', (_event, raw) => {
        const params = asRecord(raw)
        const id = typeof params.id === 'string' ? params.id : ''
        if (!id) return { ok: false, error: 'desktop ssh: "id" is required' }
        // Resolve the target *before* deleting: removal may leave a pooled
        // connection authenticated by that credential, which must not be reused.
        const known = listCredentials(credentialIo).find((entry) => entry.id === id)
        const result = removeCredential(credentialIo, id)
        if (result.ok && known) pool.invalidate(known)
        return result
    })

    /* ---------------- grants ---------------- */
    ipcMain.handle('desktop:ssh.hosts', () => [...grants.values()].sort((a, b) => a.key.localeCompare(b.key)))
    ipcMain.handle('desktop:ssh.forget', (_event, raw) => {
        const params = asRecord(raw)
        // Revoking a host revokes every scope the user allowed for it: leaving a
        // shell grant behind would be the surprise, not the other way round.
        const key = typeof params.key === 'string' && params.key ? params.key : sshGrantKey(normalizeSshTarget(params))
        const revoked: SshGrant[] = []
        for (const [id, grant] of [...grants]) {
            if (grant.key !== key) continue
            grants.delete(id)
            revoked.push(grant)
        }
        // A revoked host must lose its pooled connection too: the next call has
        // to ask again rather than inherit a session allowed under the old grant.
        for (const grant of revoked) pool.invalidate(grant)
        return revoked.length > 0
    })

    // Live shells and pooled connections must not outlive the app.
    app.on('will-quit', () => {
        pool.dispose()
        for (const session of shells.values()) {
            try {
                session.handle.close()
            } catch {
                /* already gone */
            }
            endSsh(session.client)
        }
        shells.clear()
    })
}
