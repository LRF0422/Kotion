/**
 * SSH capability test (plain Node — no Electron, no external sshd).
 *
 * Two halves:
 *
 * 1. **Contract + trust**, against pure functions: request validation, the
 *    known_hosts matcher (including the hashed `|1|salt|hash` form OpenSSH
 *    writes by default), the trust-on-first-use decisions, and auth discovery.
 * 2. **Protocol**, against a real `ssh2.Server` started in this process on a
 *    random port: connect with a verified host key, buffered `exec`, the
 *    interactive **pty shell** (data both ways *and* a window resize, which is
 *    the capability a spawned-`ssh` pipe cannot provide), and the SFTP
 *    directory calls plus upload/download.
 *
 * Run: node apps/desktop/src/main/ssh/ssh.test.mjs
 */
import { generateKeyPairSync, createHmac } from 'node:crypto'
import { Buffer } from 'node:buffer'
import ssh2 from 'ssh2'

const { Server, utils } = ssh2
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    DEFAULT_SSH_OUTPUT_BYTES,
    MAX_SHELL_COLS,
    MAX_SSH_TIMEOUT_MS,
    clampSshOutputBytes,
    clampSshTimeout,
    createOutputCollector,
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
import {
    buildAuthConfig,
    describeAuth,
    knownHostsName,
    matchHashedName,
    matchKnownHost,
    parseKnownHosts,
    verifyHostKey,
} from './ssh-keys.mjs'
import {
    buildConnectAuth,
    connectSsh,
    endSsh,
    execSsh,
    openShell,
    sftpDownload,
    sftpList,
    sftpMkdir,
    sftpRemove,
    sftpRename,
    sftpStat,
    sftpUpload,
} from './ssh-client.mjs'
import {
    listCredentials,
    removeCredential,
    resolveCredential,
    setCredential,
    toMetadata,
} from './ssh-credentials.mjs'

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}
const throws = (fn) => {
    try {
        fn()
        return ''
    } catch (error) {
        return error.message
    }
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/* ================================================================== *
 * 1. Contract validation
 * ================================================================== */
const target = normalizeSshTarget({ host: 'deploy.example.com', user: 'deploy', port: 2222 })
check('target: normalized', target.host === 'deploy.example.com' && target.user === 'deploy' && target.port === 2222, JSON.stringify(target))
check('target: defaults', JSON.stringify(normalizeSshTarget({ host: 'h' })) === JSON.stringify({ host: 'h', user: null, port: 22 }))
check('target: ipv6 brackets stripped', normalizeSshTarget({ host: '[2001:db8::1]' }).host === '2001:db8::1')
check('target: host required', /host/.test(throws(() => normalizeSshTarget({}))))
check('target: leading dash refused', /must not start with/.test(throws(() => normalizeSshTarget({ host: '-oProxyCommand=id' }))))
check('target: bad host chars refused', /unsupported/.test(throws(() => normalizeSshTarget({ host: 'h;rm -rf /' }))))
check('target: bad port refused', /port/.test(throws(() => normalizeSshTarget({ host: 'h', port: 70000 }))))
check('target: grant key', sshGrantKey({ host: 'h', user: 'u', port: 22 }) === 'u@h:22')
check('target: unknown policy falls back to strict', normalizeHostKeyPolicy('whatever') === 'strict')

check('command: required', /command/.test(throws(() => normalizeSshCommand('   '))))
check('command: rejects NUL', /NUL/.test(throws(() => normalizeSshCommand('a\u0000b'))))
check('command: multi-line kept verbatim', normalizeSshCommand('set -e\nls -la') === 'set -e\nls -la')
check('path: control characters refused', /control/.test(throws(() => normalizeRemotePath('/tmp/a\nb'))))
check('path: spaces are fine', normalizeRemotePath('/var/www/my app/i.html') === '/var/www/my app/i.html')
check('session id: validated', normalizeSessionId('abc-123') === 'abc-123' && /invalid/.test(throws(() => normalizeSessionId('a b'))))
check(
    'shell size: clamped and defaulted',
    JSON.stringify(normalizeShellSize({})) === JSON.stringify({ cols: 80, rows: 24 }) && normalizeShellSize({ cols: 10_000 }).cols === MAX_SHELL_COLS,
    JSON.stringify(normalizeShellSize({ cols: 10_000 })),
)
check('term: sanitized', normalizeTerm('xterm-256color') === 'xterm-256color' && normalizeTerm('bad; rm -rf /') === 'xterm-256color')
check('shell input: size capped', /too large/.test(throws(() => normalizeShellInput('x'.repeat(70_000)))))
check('timeout: clamped', clampSshTimeout(10 ** 9) === MAX_SSH_TIMEOUT_MS && clampSshTimeout(-5) === 1_000)
check('output: clamped', clampSshOutputBytes(10 ** 9) >= DEFAULT_SSH_OUTPUT_BYTES)
check('policy wording: private offers a way forward', /allow private network/.test(sshDenyReason('private')))
check('policy wording: metadata is absolute', /always blocked/.test(sshDenyReason('metadata')))

const collector = createOutputCollector(10)
collector.push('12345')
collector.push('67890more')
check('output collector: caps and flags', collector.result().text === '1234567890' && collector.result().truncated === true)

/* ================================================================== *
 * 2. Host-key trust + auth discovery
 * ================================================================== */
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const hostKeyPem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
const keyBlob = utils.parseKey(hostKeyPem).getPublicSSH()
const keyB64 = keyBlob.toString('base64')
/** A second server identity, for the "server key changed" case. */
const otherHostKeyPem = generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs1', format: 'pem' })
    .toString()
const otherKey = utils.parseKey(otherHostKeyPem).getPublicSSH()

check('known_hosts: default port uses the bare name', knownHostsName('h') === 'h')
check('known_hosts: nonstandard port is bracketed', knownHostsName('h', 2222) === '[h]:2222')

const parsed = parseKnownHosts(
    `# comment\n\nh ssh-rsa ${keyB64}\n[h2]:2222,10.0.0.1 ssh-rsa ${keyB64}\n@cert-authority * ssh-rsa ${keyB64}\n`,
)
check('known_hosts: comments and markers skipped', parsed.length === 2, JSON.stringify(parsed.map((entry) => entry.names)))
check(
    'known_hosts: comma lists kept (bracketed form for the port, bare name for 22)',
    matchKnownHost(parsed[1], 'h2', 2222) === true &&
        matchKnownHost(parsed[1], '10.0.0.1', 22) === true &&
        matchKnownHost(parsed[1], '10.0.0.1', 2222) === false,
)
check('known_hosts: plain match honours the port', matchKnownHost(parsed[0], 'h', 22) === true && matchKnownHost(parsed[0], 'h', 2222) === false)

const salt = Buffer.from('0123456789abcdef')
const hashedName = `|1|${salt.toString('base64')}|${createHmac('sha1', salt).update('hashed.example.com').digest('base64')}`
const hashedEntry = parseKnownHosts(`${hashedName} ssh-rsa ${keyB64}\n`)[0]
check('known_hosts: hashed entry matches its host', matchHashedName(hashedEntry.names[0], 'hashed.example.com') === true)
check('known_hosts: hashed entry rejects another host', matchHashedName(hashedEntry.names[0], 'other.example.com') === false)
check('known_hosts: hashed entries participate in matching', matchKnownHost(hashedEntry, 'hashed.example.com', 22) === true)

const good = verifyHostKey({ host: 'h', port: 22, key: keyBlob, entries: parsed, known: {}, policy: 'strict' })
check('verify: known key accepted', good.ok === true && good.learned === false, JSON.stringify(good))
const changed = verifyHostKey({ host: 'h', port: 22, key: otherKey, entries: parsed, known: {}, policy: 'strict' })
check('verify: changed key refused loudly', changed.ok === false && /HOST KEY CHANGED/.test(changed.reason), changed.reason)
const unknownStrict = verifyHostKey({ host: 'new.example.com', port: 22, key: keyBlob, entries: parsed, known: {}, policy: 'strict' })
check('verify: unknown host refused under strict', unknownStrict.ok === false && /known_hosts/.test(unknownStrict.reason), unknownStrict.reason)
const learned = verifyHostKey({ host: 'new.example.com', port: 22, key: keyBlob, entries: parsed, known: {}, policy: 'accept-new' })
check('verify: accept-new learns once', learned.ok === true && learned.learned === true, JSON.stringify(learned))
const rememberedMismatch = verifyHostKey({
    host: 'new.example.com',
    port: 22,
    key: otherKey,
    entries: parsed,
    known: { 'new.example.com': keyB64 },
    policy: 'accept-new',
})
check('verify: a learned key is pinned afterwards', rememberedMismatch.ok === false && /CHANGED/.test(rememberedMismatch.reason), rememberedMismatch.reason)

const fakeHome = mkdtempSync(join(tmpdir(), 'kn-ssh-home-'))
check('auth: nothing to use is reported', describeAuth(buildAuthConfig({ homeDir: fakeHome, env: {} })) === 'no key or agent found')
writeFileSync(join(fakeHome, 'id_test_key'), hostKeyPem)
check(
    'auth: the agent is attached when the environment has one',
    buildAuthConfig({ homeDir: fakeHome, env: { SSH_AUTH_SOCK: '/tmp/agent.sock' } }).agent === '/tmp/agent.sock',
)

/* ================================================================== *
 * 3. Protocol — a real ssh2 server, in process
 * ================================================================== */
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))

/**
 * A server-side client that aborts mid-handshake (a refused host key) emits
 * `error`, and an unhandled one takes the whole process down. Some tests abort
 * on purpose, so swallow it here.
 */
const ignoreClientErrors = (client) => client.on('error', () => undefined)

/** Minimal in-memory SFTP + exec + shell server. */
const startServer = async () => {
    const files = new Map([['/welcome.txt', Buffer.from('hello from the server\n')]])
    const dirs = new Set(['/', '/logs'])
    const ptyRequests = []
    const windowChanges = []
    const server = new Server({ hostKeys: [hostKeyPem] }, (client) => {
        ignoreClientErrors(client)
        client.on('authentication', (ctx) => ctx.accept())
        client.on('ready', () => {
            client.on('session', (accept) => {
                const session = accept()
                session.on('exec', (acceptExec, _reject, info) => {
                    const stream = acceptExec()
                    stream.write(`ran: ${info.command}\n`)
                    stream.exit(0)
                    stream.end()
                })
                session.on('pty', (acceptPty, _reject, info) => {
                    ptyRequests.push(info)
                    acceptPty()
                })
                /**
                 * Never reply to a window-change: RFC 4254 sends it with
                 * `want_reply = false`, and ssh2's *client* treats a CHANNEL_SUCCESS
                 * for it as a protocol violation and drops the connection. Real
                 * servers ignore it too — the resize still arrives, which is all
                 * this test asserts.
                 */
                session.on('window-change', (_acceptChange, _reject, info) => {
                    windowChanges.push(info)
                })
                session.on('shell', (acceptShell) => {
                    const stream = acceptShell()
                    stream.write('$ ')
                    stream.on('data', (chunk) => stream.write(`echo:${chunk.toString()}`))
                    // A real shell exits when its client closes the channel; without
                    // this the client never sees CHANNEL_CLOSE.
                    stream.on('end', () => {
                        stream.exit(0)
                        stream.end()
                    })
                })
                session.on('sftp', (acceptSftp) => {
                    const sftp = acceptSftp()
                    // ssh2's server SFTP API takes plain attribute objects
                    // (the `utils.Attributes` class of older versions is gone).
                    const attrs = (path, size = 0) => ({
                        mode: dirs.has(path) ? 0o040755 : 0o100644,
                        size,
                        uid: 501,
                        gid: 20,
                        atime: 1_700_000_000,
                        mtime: 1_700_000_000,
                    })
                    sftp.on('REALPATH', (reqid) => sftp.name(reqid, [{ filename: '/', longname: '/', attrs: attrs('/') }]))
                    // SSH_FX_NO_SUCH_FILE (2) when the path is unknown: the client
                    // relies on this to decide whether a rename would overwrite.
                    const exists = (path) => files.has(path) || dirs.has(path)
                    sftp.on('STAT', (reqid, path) =>
                        exists(path)
                            ? sftp.attrs(reqid, attrs(path, files.get(path)?.length ?? 0))
                            : sftp.status(reqid, 2),
                    )
                    sftp.on('LSTAT', (reqid, path) =>
                        exists(path)
                            ? sftp.attrs(reqid, attrs(path, files.get(path)?.length ?? 0))
                            : sftp.status(reqid, 2),
                    )
                    const dirOffsets = new Map()
                    sftp.on('OPENDIR', (reqid, path) => {
                        dirOffsets.set(path, 0)
                        sftp.handle(reqid, Buffer.from(path))
                    })
                    /**
                     * SFTP's READDIR is a paged protocol: the client keeps asking
                     * until it gets an empty batch. Returning the same list forever
                     * makes ssh2's client loop until the operation times out.
                     */
                    sftp.on('READDIR', (reqid, handle) => {
                        const dir = handle.toString()
                        const prefix = dir === '/' ? '/' : `${dir}/`
                        const all = [...files.keys(), ...dirs]
                            .filter((path) => path !== '/' && path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
                            .map((path) => ({
                                filename: path.split('/').pop(),
                                longname: path,
                                attrs: attrs(path, files.get(path)?.length ?? 0),
                            }))
                        const offset = dirOffsets.get(dir) ?? 0
                        const page = all.slice(offset, offset + 100)
                        dirOffsets.set(dir, offset + page.length)
                        // The end of a listing is SSH_FX_EOF (status 1), not an
                        // empty NAME: ssh2's client keeps asking otherwise.
                        if (page.length === 0) sftp.status(reqid, 1)
                        else sftp.name(reqid, page)
                    })
                    sftp.on('MKDIR', (reqid, path) => {
                        dirs.add(path)
                        sftp.status(reqid, 0)
                    })
                    sftp.on('RMDIR', (reqid, path) => {
                        dirs.delete(path)
                        sftp.status(reqid, 0)
                    })
                    sftp.on('REMOVE', (reqid, path) => {
                        files.delete(path)
                        sftp.status(reqid, 0)
                    })
                    sftp.on('RENAME', (reqid, from, to) => {
                        if (files.has(from)) {
                            files.set(to, files.get(from))
                            files.delete(from)
                        }
                        sftp.status(reqid, 0)
                    })
                    const handles = new Map()
                    sftp.on('OPEN', (reqid, filename, flags) => {
                        const handle = Buffer.from(`h${handles.size}`)
                        handles.set(handle.toString(), {
                            path: filename,
                            data: files.get(filename) ?? Buffer.alloc(0),
                            write: Boolean(flags & 2),
                        })
                        sftp.handle(reqid, handle)
                    })
                    sftp.on('READ', (reqid, handle, offset, length) => {
                        const entry = handles.get(handle.toString())
                        if (!entry || offset >= entry.data.length) {
                            sftp.status(reqid, 1)
                            return
                        }
                        sftp.data(reqid, entry.data.subarray(offset, Math.min(offset + length, entry.data.length)))
                    })
                    sftp.on('WRITE', (reqid, handle, offset, data) => {
                        const entry = handles.get(handle.toString())
                        if (entry) {
                            const next = Buffer.alloc(Math.max(entry.data.length, offset + data.length))
                            entry.data.copy(next)
                            data.copy(next, offset)
                            entry.data = next
                        }
                        sftp.status(reqid, 0)
                    })
                    sftp.on('FSTAT', (reqid, handle) => {
                        const entry = handles.get(handle.toString())
                        sftp.attrs(reqid, attrs(entry?.path ?? '/', entry?.data.length ?? 0))
                    })
                    sftp.on('SETSTAT', (reqid) => sftp.status(reqid, 0))
                    sftp.on('FSETSTAT', (reqid) => sftp.status(reqid, 0))
                    sftp.on('CLOSE', (reqid, handle) => {
                        const entry = handles.get(handle.toString())
                        if (entry?.write) files.set(entry.path, entry.data)
                        handles.delete(handle.toString())
                        sftp.status(reqid, 0)
                    })
                })
            })
        })
    })
    const port = await listen(server)
    const close = () => new Promise((resolve) => server.close(resolve))
    return { port, files, dirs, ptyRequests, windowChanges, close }
}

const server = await startServer()
const workDir = mkdtempSync(join(tmpdir(), 'kn-ssh-work-'))
/** `readKnownHosts` looks in `<home>/.ssh/known_hosts`, like ssh itself. */
const sshDir = join(workDir, '.ssh')
mkdirSync(sshDir, { recursive: true })
const knownHostsFile = join(sshDir, 'known_hosts')
writeFileSync(knownHostsFile, `[127.0.0.1]:${server.port} ssh-rsa ${keyB64}\n`)
const base = {
    target: { host: '127.0.0.1', user: 'tester', port: server.port },
    hostKeyPolicy: 'strict',
    homeDir: workDir,
    knownStorePath: join(workDir, 'tofu.json'),
    timeoutMs: 10_000,
}

const session = await connectSsh(base)
check('connect: verified host key accepted', session.verdict?.ok === true && Boolean(session.client), JSON.stringify(session.verdict))

const emptyHome = mkdtempSync(join(tmpdir(), 'kn-ssh-nokeys-'))
let strictError = ''
try {
    const refused = await connectSsh({ ...base, homeDir: emptyHome })
    endSsh(refused.client)
} catch (error) {
    strictError = error.message
}
check('connect: unknown host refused under strict (no known_hosts entry)', /known_hosts/.test(strictError), strictError)
const learnedSession = await connectSsh({ ...base, homeDir: emptyHome, hostKeyPolicy: 'accept-new' })
check(
    'connect: accept-new connects and reports the learned fingerprint',
    learnedSession.verdict?.learned === true && /^SHA256:/.test(learnedSession.verdict.fingerprint),
    JSON.stringify(learnedSession.verdict),
)
endSsh(learnedSession.client)

const execResult = await execSsh(session.client, { command: 'echo hi', timeoutMs: 5_000, maxOutputBytes: 4096 })
check('exec: output and exit code', execResult.ok === true && execResult.stdout.includes('ran: echo hi') && execResult.code === 0, JSON.stringify(execResult))
check('exec: reports duration and no truncation', execResult.truncated === false && execResult.durationMs >= 0)

const chunks = []
const shell = await openShell(session.client, {
    term: 'xterm-256color',
    cols: 80,
    rows: 24,
    onData: (chunk) => chunks.push(chunk.toString()),
})
check('shell: server saw the pty request with our size', server.ptyRequests[0]?.cols === 80 && server.ptyRequests[0]?.rows === 24, JSON.stringify(server.ptyRequests[0]))
await wait(120)
check('shell: initial banner streamed', chunks.join('') === '$ ', JSON.stringify(chunks.join('')))
shell.write('uname -a\n')
await wait(150)
check('shell: input round-trips through the pty', chunks.join('').includes('echo:uname -a'), JSON.stringify(chunks.join('')))
shell.resize(132, 43)
await wait(150)
check(
    'shell: resize reached the server (the pty upgrade)',
    server.windowChanges.at(-1)?.cols === 132 && server.windowChanges.at(-1)?.rows === 43,
    JSON.stringify(server.windowChanges.at(-1)),
)
shell.close()
await wait(120)
check('shell: close ends the session', shell.closed === true)

const listing = await sftpList(session.client, { path: '/' })
check(
    'sftp: list returns mapped entries with full paths',
    listing.entries.some((entry) => entry.name === 'welcome.txt' && entry.path === '/welcome.txt' && entry.file === true) &&
        listing.entries.some((entry) => entry.name === 'logs' && entry.directory === true),
    JSON.stringify(listing.entries.map((entry) => `${entry.path}:${entry.directory ? 'd' : 'f'}`)),
)
const stat = await sftpStat(session.client, { path: '/welcome.txt' })
check('sftp: stat carries size and flags', stat.file === true && stat.size === 22 && stat.directory === false, JSON.stringify(stat))
const made = await sftpMkdir(session.client, { path: '/nested/deep', recursive: true })
check('sftp: recursive mkdir creates each segment', made.created === true && server.dirs.has('/nested') && server.dirs.has('/nested/deep'), [...server.dirs].join(','))
const renamed = await sftpRename(session.client, { from: '/welcome.txt', to: '/renamed.txt' })
check('sftp: rename moves the entry', renamed.to === '/renamed.txt' && !server.files.has('/welcome.txt') && server.files.has('/renamed.txt'), [...server.files.keys()].join(','))
let overwriteRefused = ''
try {
    await sftpRename(session.client, { from: '/renamed.txt', to: '/renamed.txt' })
} catch (error) {
    overwriteRefused = error.message
}
check('sftp: rename refuses to overwrite unless asked', /refusing to overwrite/.test(overwriteRefused), overwriteRefused)
const uploaded = join(workDir, 'upload.txt')
writeFileSync(uploaded, 'from the client\n')
const putResult = await sftpUpload(session.client, { localPath: uploaded, remotePath: '/uploaded.txt' })
check('sftp: upload lands the bytes', putResult.remotePath === '/uploaded.txt' && server.files.get('/uploaded.txt')?.toString() === 'from the client\n', server.files.get('/uploaded.txt')?.toString())
const downloaded = join(workDir, 'download.txt')
const getResult = await sftpDownload(session.client, { remotePath: '/renamed.txt', localPath: downloaded })
check('sftp: download writes the bytes', getResult.localPath === downloaded && readFileSync(downloaded, 'utf8') === 'hello from the server\n', readFileSync(downloaded, 'utf8'))
const removed = await sftpRemove(session.client, { path: '/uploaded.txt' })
check('sftp: remove deletes a file', removed.removed === true && !server.files.has('/uploaded.txt'))

/* A host key that is not the one we pinned must fail before authentication. */
let authAttempts = 0
const otherServer = new Server({ hostKeys: [otherHostKeyPem] }, (client) => {
    ignoreClientErrors(client)
    client.on('authentication', (ctx) => {
        authAttempts += 1
        ctx.accept()
    })
})
const otherPort = await listen(otherServer)
writeFileSync(knownHostsFile, `[127.0.0.1]:${server.port} ssh-rsa ${keyB64}\n[127.0.0.1]:${otherPort} ssh-rsa ${keyB64}\n`)
let mismatchError = ''
try {
    const wrong = await connectSsh({ ...base, target: { host: '127.0.0.1', user: 'tester', port: otherPort } })
    endSsh(wrong.client)
} catch (error) {
    mismatchError = error.message
}
check(
    'connect: a changed server key never reaches authentication',
    /HOST KEY CHANGED/.test(mismatchError) && authAttempts === 0,
    `attempts=${authAttempts} err=${mismatchError}`,
)
otherServer.close()

/* A failing command is a result; only broken plumbing throws. */
const failing = new Server({ hostKeys: [hostKeyPem] }, (client) => {
    ignoreClientErrors(client)
    client.on('authentication', (ctx) => ctx.accept())
    client.on('ready', () => {
        client.on('session', (accept) => {
            const session = accept()
            session.on('exec', (acceptExec) => {
                const stream = acceptExec()
                stream.stderr.write('boom\n')
                stream.exit(1)
                stream.end()
            })
        })
    })
})
const failingPort = await listen(failing)
const failingHome = mkdtempSync(join(tmpdir(), 'kn-ssh-fail-'))
const failingSession = await connectSsh({
    ...base,
    target: { host: '127.0.0.1', user: 'tester', port: failingPort },
    homeDir: failingHome,
    hostKeyPolicy: 'accept-new',
})
const failedExec = await execSsh(failingSession.client, { command: 'false', timeoutMs: 5_000, maxOutputBytes: 4096 })
check(
    'exec: a non-zero exit is a structured result, not a throw',
    failedExec.ok === false && failedExec.code === 1 && failedExec.stderr.includes('boom'),
    JSON.stringify(failedExec),
)
endSsh(failingSession.client)
failing.close()

endSsh(session.client)
server.close()

/* ================================================================== *
 * 4. Stored credentials — the path that makes password-only hosts usable
 * ================================================================== */
/** A fake encrypted store: the "cipher" is a marker prefix, so a test can prove
 *  the plaintext never lands in the file. */
const makeCredentialIo = (canEncrypt = true) => {
    let file = ''
    const written = () => file
    return {
        io: {
            readFile: () => file,
            writeFile: (contents) => {
                file = contents
            },
            canEncrypt: () => canEncrypt,
            encrypt: (plain) => `enc:${Buffer.from(plain, 'utf8').toString('base64')}`,
            decrypt: (cipher) => Buffer.from(String(cipher).replace(/^enc:/, ''), 'base64').toString('utf8'),
        },
        written,
    }
}

const store = makeCredentialIo()
const saved = setCredential(store.io, { host: 'db.internal', user: 'deploy', port: 2222, kind: 'password', secret: 'hunter2', label: 'db' })
check('credentials: saved', saved.ok === true && saved.credential?.kind === 'password', JSON.stringify(saved))
check(
    'credentials: the file holds only ciphertext',
    store.written().includes('enc:') && !store.written().includes('hunter2'),
    store.written().slice(0, 120),
)
const listed = listCredentials(store.io)
check(
    'credentials: list is metadata only (no secret fields)',
    listed.length === 1 &&
        listed[0].targetKey === 'deploy@db.internal:2222' &&
        !('secretCipher' in listed[0]) &&
        !('password' in listed[0]) &&
        Object.keys(listed[0]).every((key) => !/secret|password|privateKey/i.test(key)),
    JSON.stringify(listed[0]),
)
const resolved = resolveCredential(store.io, { host: 'db.internal', user: 'deploy', port: 2222 })
check('credentials: main process can resolve the secret', resolved.password === 'hunter2' && resolved.kind === 'password', JSON.stringify({ ...resolved, password: '***' }))
const resolvedById = resolveCredential(store.io, { id: saved.credential.id })
check('credentials: resolves by id too', resolvedById.password === 'hunter2')
const missing = resolveCredential(store.io, { host: 'other', user: 'x', port: 22 })
check('credentials: no match resolves to nothing (falls back to agent/keys)', Object.keys(missing).length === 0)
const rotated = setCredential(store.io, { host: 'db.internal', user: 'deploy', port: 2222, kind: 'password', secret: 'newpass' })
check('credentials: rotating keeps the id', rotated.credential?.id === saved.credential.id, JSON.stringify(rotated.credential?.id))
check('credentials: rotation replaces, never duplicates', listCredentials(store.io).length === 1)
check('credentials: remove', removeCredential(store.io, saved.credential.id).ok === true && listCredentials(store.io).length === 0)

const noKeyring = makeCredentialIo(false)
check(
    'credentials: refuses to store when the OS cannot encrypt',
    setCredential(noKeyring.io, { host: 'h', kind: 'password', secret: 'x' }).ok === false,
    setCredential(noKeyring.io, { host: 'h', kind: 'password', secret: 'x' }).error,
)
const keyStore = makeCredentialIo()
check(
    'credentials: rejects a non-PEM private key',
    setCredential(keyStore.io, { host: 'h', kind: 'key', secret: 'not a key' }).ok === false,
)
const keySaved = setCredential(keyStore.io, { host: 'h', kind: 'key', secret: hostKeyPem, passphrase: 'pp' })
check('credentials: stores a key plus passphrase', keySaved.ok === true && keySaved.credential?.hasPassphrase === true)
const keyResolved = resolveCredential(keyStore.io, { host: 'h', port: 22 })
check('credentials: key + passphrase round-trip', keyResolved.privateKey === hostKeyPem && keyResolved.passphrase === 'pp')
check(
    'credentials: metadata of a key never leaks key material',
    JSON.stringify(toMetadata({ ...keySaved.credential, secretCipher: undefined })).includes('PRIVATE KEY') === false,
)

/* Auth precedence: a stored credential is used *instead of* agent/keys. */
check(
    'auth: no credential falls back to the environment',
    typeof buildConnectAuth({ homeDir: fakeHome, env: {}, credential: {} }) === 'object',
)
check(
    'auth: a stored password wins over the agent',
    JSON.stringify(buildConnectAuth({ env: { SSH_AUTH_SOCK: '/tmp/agent.sock' }, credential: { password: 'p' } })) ===
        JSON.stringify({ password: 'p', tryKeyboard: true }),
    JSON.stringify(buildConnectAuth({ env: { SSH_AUTH_SOCK: '/tmp/agent.sock' }, credential: { password: 'p' } })),
)
check(
    'auth: a stored key carries its passphrase',
    JSON.stringify(buildConnectAuth({ credential: { privateKey: 'K', passphrase: 'P' } })) === JSON.stringify({ privateKey: 'K', passphrase: 'P' }),
)
check(
    'auth: an undecryptable credential surfaces as an error, not a silent retry',
    Boolean(buildConnectAuth({ credential: { error: 'nope' } }).__authError),
)

/** A server that accepts exactly one password, over either method. */
const startAuthServer = async (mode) => {
    const attempts = []
    const server = new Server({ hostKeys: [hostKeyPem] }, (client) => {
        ignoreClientErrors(client)
        client.on('authentication', (ctx) => {
            attempts.push(ctx.method)
            // `mode` picks which method this server actually offers: a PAM-style
            // host refuses `password` and only speaks keyboard-interactive.
            if (mode === 'password' && ctx.method === 'password') {
                if (ctx.password === 's3cret') ctx.accept()
                else ctx.reject(['password', 'keyboard-interactive'])
                return
            }
            if (mode === 'keyboard-interactive' && ctx.method === 'keyboard-interactive') {
                ctx.prompt([{ prompt: 'Password: ', echo: false }], (answers) => {
                    if (answers?.[0] === 's3cret') ctx.accept()
                    else ctx.reject()
                })
                return
            }
            ctx.reject(mode === 'password' ? ['password', 'keyboard-interactive'] : ['keyboard-interactive'])
        })
        client.on('ready', () => {
            client.on('session', (accept) => {
                const session = accept()
                session.on('exec', (acceptExec) => {
                    const stream = acceptExec()
                    stream.write('authed\n')
                    stream.exit(0)
                    stream.end()
                })
            })
        })
    })
    const port = await listen(server)
    return { port, attempts, close: () => server.close(), mode }
}

const passwordHome = mkdtempSync(join(tmpdir(), 'kn-ssh-pw-'))
mkdirSync(join(passwordHome, '.ssh'), { recursive: true })
const passwordServer = await startAuthServer('password')
writeFileSync(join(passwordHome, '.ssh', 'known_hosts'), `[127.0.0.1]:${passwordServer.port} ssh-rsa ${keyB64}\n`)

const pwStore = makeCredentialIo()
setCredential(pwStore.io, { host: '127.0.0.1', user: 'tester', port: passwordServer.port, kind: 'password', secret: 's3cret' })
const pwAuth = await connectSsh({
    target: { host: '127.0.0.1', user: 'tester', port: passwordServer.port },
    homeDir: passwordHome,
    knownStorePath: join(passwordHome, 'tofu.json'),
    credential: resolveCredential(pwStore.io, { host: '127.0.0.1', user: 'tester', port: passwordServer.port }),
})
check('auth: a stored password authenticates (password method)', Boolean(pwAuth.client), JSON.stringify(passwordServer.attempts))
const pwExec = await execSsh(pwAuth.client, { command: 'true', timeoutMs: 5000, maxOutputBytes: 1000 })
check('auth: the session works after password auth', pwExec.ok === true && pwExec.stdout.includes('authed'), JSON.stringify(pwExec))
endSsh(pwAuth.client)

/* A password against a keyboard-interactive-only server: this is why the client
   answers prompts instead of only sending `password`. */
const keyboardServer = await startAuthServer('keyboard-interactive')
const keyboardHome = mkdtempSync(join(tmpdir(), 'kn-ssh-kb-'))
mkdirSync(join(keyboardHome, '.ssh'), { recursive: true })
writeFileSync(join(keyboardHome, '.ssh', 'known_hosts'), `[127.0.0.1]:${keyboardServer.port} ssh-rsa ${keyB64}\n`)
const kbAuth = await connectSsh({
    target: { host: '127.0.0.1', user: 'tester', port: keyboardServer.port },
    homeDir: keyboardHome,
    knownStorePath: join(keyboardHome, 'tofu.json'),
    credential: { password: 's3cret' },
})
check(
    'auth: a stored password also answers keyboard-interactive prompts',
    Boolean(kbAuth.client) && keyboardServer.attempts.includes('keyboard-interactive'),
    JSON.stringify(keyboardServer.attempts),
)
endSsh(kbAuth.client)

/* The failure that used to be a dead end now says where to fix it. */
let authError = ''
try {
    const refused = await connectSsh({
        target: { host: '127.0.0.1', user: 'tester', port: passwordServer.port },
        homeDir: mkdtempSync(join(tmpdir(), 'kn-ssh-nocred-')),
        hostKeyPolicy: 'accept-new',
        knownStorePath: join(passwordHome, 'tofu.json'),
        credential: {},
    })
    endSsh(refused.client)
} catch (error) {
    authError = error.message
}
check(
    'auth: failure names the missing credential and where to add it',
    /authentication failed/.test(authError) && /SSH 凭据/.test(authError),
    authError,
)
passwordServer.close()
keyboardServer.close()

const failedChecks = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`)
process.exit(failedChecks.length ? 1 : 0)
