/**
 * SSH capability — Electron wiring (main process).
 *
 * Three gates stand between a plugin and a remote shell, in this order:
 *
 *   1. **Network policy** (`../net-policy`): private / loopback / metadata
 *      targets are refused unless the user lifted that switch in Settings —
 *      the same switch `http.request` obeys, re-checked on every call because
 *      DNS and the policy can both change between calls.
 *   2. **A per-host user grant**: the first time this app run talks to a
 *      `user@host:port`, the user is asked in a modal dialog naming the target,
 *      the host-key policy and (for exec) the command. Refusing — or having no
 *      window to ask in — fails closed. Grants live in memory for the app run
 *      only, the same lifetime as the `fs.*` dialog grants.
 *   3. **argv-only execution**: nothing here interpolates into a shell; see
 *      `ssh-args.mjs`.
 *
 * Credentials are deliberately absent from the contract: the host never
 * receives, stores or forwards a password or key. Auth is the user's own
 * `~/.ssh/config` + agent, and `BatchMode=yes` turns "needs a password" into a
 * fast failure instead of an invisible prompt.
 */
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import * as dns from 'node:dns'
import { isIP } from 'node:net'
import { classifyAddress } from '../net-policy'
import { getNetPolicy } from '../net-policy-store'
import {
    buildScpArgs,
    buildSshArgs,
    clampSshOutputBytes,
    clampSshTimeout,
    normalizeHostKeyPolicy,
    normalizeRemotePath,
    normalizeSshCommand,
    normalizeSshTarget,
    sshDenyReason,
    sshGrantKey,
} from './ssh-args.mjs'
import { killActiveSshProcesses, runSshProcess } from './ssh-runner.mjs'

export interface SshGrant {
    key: string
    host: string
    user: string | null
    port: number
    hostKeyPolicy: 'strict' | 'accept-new'
    grantedAt: number
}

interface SetupSshOptions {
    /** The shared fs allowlist validator from `setupIpcHandlers`. */
    assertAllowedPath: (value: unknown, label: string) => string
    /** Overridable for tests; defaults to the real binaries on PATH. */
    sshBinary?: string
    scpBinary?: string
}

const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

/**
 * The confirmation dialog follows the OS locale.
 *
 * The main process has no i18n runtime (and the call is initiated by a plugin,
 * so no renderer locale is available); `app.getLocale()` is the one honest
 * signal. Diagnostics stay English, like every other main-process error.
 */
const dialogStrings = (locale: string) =>
    locale.toLowerCase().startsWith('zh')
        ? {
              title: 'SSH 连接授权',
              allow: '允许',
              deny: '拒绝',
              message: (key: string) => `有插件请求通过 SSH 连接 ${key}`,
              policyStrict: '严格（按 known_hosts 校验）',
              policyAcceptNew: '首次自动信任（accept-new）',
              credentials: '凭证：使用你自己的 ~/.ssh 配置与 ssh-agent；宿主不接收、不保存密码或私钥。',
              remember: '允许后，本次运行内该主机的后续调用不再询问（可随时“忘记”）。',
              commandLabel: '远程执行命令：',
              transferLabel: '文件传输：',
          }
        : {
              title: 'SSH connection request',
              allow: 'Allow',
              deny: 'Deny',
              message: (key: string) => `A plugin wants to connect to ${key} over SSH`,
              policyStrict: 'strict (verify against known_hosts)',
              policyAcceptNew: 'accept-new (trust on first use)',
              credentials: 'Credentials: your own ~/.ssh config and ssh-agent. The host never receives or stores a password or key.',
              remember: 'Allowing covers later calls to this host for this app run (revocable at any time).',
              commandLabel: 'Remote command: ',
              transferLabel: 'File transfer: ',
          }

/**
 * Refuse a target the network policy blocks.
 *
 * A literal address is judged directly; a name is resolved once and *every*
 * answer is judged, so a round-robin or rebinding record cannot slip a private
 * address past the switch.
 */
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

const commandPreview = (command: string): string => {
    const flat = command.replace(/\s+/g, ' ').trim()
    return flat.length > 200 ? `${flat.slice(0, 200)}…` : flat
}

export function setupSshIpcHandlers({ assertAllowedPath, sshBinary, scpBinary }: SetupSshOptions) {
    /** Grants for this app run only: `user@host:port` → grant. */
    const grants = new Map<string, SshGrant>()

    // A hung ssh/scp must not outlive the app: Electron does not reap
    // main-process children on quit, so the runner's registry is drained here.
    app.on('will-quit', () => {
        killActiveSshProcesses()
    })

    const requireGrant = async (
        event: Electron.IpcMainInvokeEvent,
        target: { host: string; user: string | null; port: number },
        hostKeyPolicy: 'strict' | 'accept-new',
        request: { kind: 'command' | 'transfer'; detail: string },
    ): Promise<SshGrant> => {
        const key = sshGrantKey(target)
        const existing = grants.get(key)
        // A grant made under `strict` must not silently cover `accept-new`
        // (the weaker policy), so a changed request asks again.
        if (existing && existing.hostKeyPolicy === hostKeyPolicy) return existing

        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) {
            // No surface to ask in: refuse rather than run unconfirmed.
            throw new Error(`desktop ssh: no window is available to confirm "${key}"`)
        }
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
                `${request.kind === 'command' ? t.commandLabel : t.transferLabel}${request.detail}\n\n` +
                `Host key: ${hostKeyPolicy === 'strict' ? t.policyStrict : t.policyAcceptNew}\n` +
                `${t.credentials}\n${t.remember}`,
        })
        if (response !== 0) throw new Error(`desktop ssh: the user refused the connection to "${key}"`)
        const grant: SshGrant = { key, ...target, hostKeyPolicy, grantedAt: Date.now() }
        grants.set(key, grant)
        return grant
    }

    const prepare = async (event: Electron.IpcMainInvokeEvent, raw: unknown) => {
        const params = asRecord(raw)
        const target = normalizeSshTarget(params)
        const hostKeyPolicy = normalizeHostKeyPolicy(params.hostKeyPolicy)
        const timeoutMs = clampSshTimeout(params.timeoutMs)
        const maxOutputBytes = clampSshOutputBytes(params.maxOutputBytes)
        await assertTargetAllowed(target.host)
        return { target, hostKeyPolicy, timeoutMs, maxOutputBytes, params }
    }

    ipcMain.handle('desktop:ssh.exec', async (event, raw) => {
        const { target, hostKeyPolicy, timeoutMs, maxOutputBytes, params } = await prepare(event, raw)
        const command = normalizeSshCommand(params.command)
        await requireGrant(event, target, hostKeyPolicy, { kind: 'command', detail: commandPreview(command) })
        const result = await runSshProcess({
            binary: sshBinary ?? 'ssh',
            args: buildSshArgs({ target, command, hostKeyPolicy, connectTimeoutMs: timeoutMs }),
            timeoutMs,
            maxOutputBytes,
        })
        return { ...target, command, ...result }
    })

    const transfer = (direction: 'put' | 'get') => async (event: Electron.IpcMainInvokeEvent, raw: unknown) => {
        const { target, hostKeyPolicy, timeoutMs, maxOutputBytes, params } = await prepare(event, raw)
        const localPath = assertAllowedPath(params.localPath, 'localPath')
        const remotePath = normalizeRemotePath(params.remotePath)
        await requireGrant(event, target, hostKeyPolicy, { kind: 'transfer', detail: `${localPath} <-> ${remotePath}` })
        const result = await runSshProcess({
            binary: scpBinary ?? 'scp',
            args: buildScpArgs({ target, direction, localPath, remotePath, hostKeyPolicy, connectTimeoutMs: timeoutMs }),
            timeoutMs,
            maxOutputBytes,
        })
        return { ...target, direction, localPath, remotePath, ...result }
    }

    ipcMain.handle('desktop:ssh.put', transfer('put'))
    ipcMain.handle('desktop:ssh.get', transfer('get'))
    ipcMain.handle('desktop:ssh.hosts', () => [...grants.values()].sort((a, b) => a.key.localeCompare(b.key)))
    ipcMain.handle('desktop:ssh.forget', (_event, raw) => {
        const params = asRecord(raw)
        if (typeof params.key === 'string' && params.key) return grants.delete(params.key)
        return grants.delete(sshGrantKey(normalizeSshTarget(params)))
    })
}
