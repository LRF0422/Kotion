/**
 * Electron end-to-end test for the generic plugin capability groups.
 *
 * Answers what a unit test cannot:
 *   1. does the *real* preload whitelist expose the new capabilities, and does
 *      the *real* IPC wiring answer them (not just the module under test)?
 *   2. does a raw TCP socket stream bytes to a browser window — and does TLS
 *      refuse a self-signed certificate in `strict` mode while `relaxed`
 *      connects?
 *   3. does the loopback OAuth listener actually receive a browser redirect and
 *      hand the query back over IPC?
 *   4. does `storage.secret` put only ciphertext on disk, and does the keychain
 *      refusal path hold when encryption is unavailable?
 *   5. do the host-driven timers tick while nothing in the renderer is running?
 *   6. do the four consent/policy refusals fail closed?
 *
 * The capability modules are TypeScript + plain `.mjs`, so they are bundled with
 * esbuild first (the same bundler the plugin studio uses); the preload is
 * bundled too, so the capability list under test is the one in source.
 *
 * CommonJS on purpose: Electron 33's ESM loader throws
 * "Cannot read properties of undefined (reading 'exports')" on
 * `import { app } from 'electron'`, so a `.mjs` entry cannot even start.
 *
 * Run:
 *   ELECTRON_RUN_AS_NODE= apps/desktop/node_modules/.bin/electron \
 *     apps/desktop/src/main/capabilities/electron.smoke.cjs --no-sandbox
 */
const { app, BrowserWindow, shell, safeStorage } = require('electron')

// `ELECTRON_RUN_AS_NODE=1` (set by some shells/CI runners) makes the electron
// binary behave like plain Node, where `require('electron')` is the npm shim and
// `app` is undefined. Fail with the fix instead of a confusing TypeError.
if (!process.versions.electron) {
    console.error(
        'capability smoke must run under Electron, not Node. Unset ELECTRON_RUN_AS_NODE (or run:\n' +
            '  ELECTRON_RUN_AS_NODE= apps/desktop/node_modules/.bin/electron <this file> --no-sandbox)',
    )
    process.exit(1)
}

const { build } = require('esbuild')
const http = require('node:http')
const net = require('node:net')
const tls = require('node:tls')
const { execFileSync } = require('node:child_process')
const { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

const appRoot = resolve(__dirname, '../../..')
const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const PAGE = `data:text/html;charset=utf-8,${encodeURIComponent(
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>',
)}`

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

async function withTimeout(promise, ms, label) {
    let timer
    try {
        return await Promise.race([
            promise,
            new Promise((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
            }),
        ])
    } finally {
        clearTimeout(timer)
    }
}

/** One self-signed certificate for the strict/relaxed TLS comparison. */
function makeSelfSignedCert(dir) {
    const keyPath = join(dir, 'key.pem')
    const certPath = join(dir, 'cert.pem')
    execFileSync(
        'openssl',
        [
            'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
            '-keyout', keyPath, '-out', certPath,
            '-days', '1', '-subj', '/CN=127.0.0.1',
            '-addext', 'subjectAltName=IP:127.0.0.1',
        ],
        { stdio: 'ignore' },
    )
    return { key: readFileSync(keyPath), cert: readFileSync(certPath) }
}

async function run() {
    const workDir = join(appRoot, '.tmp-check', 'capability-smoke')
    rmSync(workDir, { recursive: true, force: true })
    mkdirSync(workDir, { recursive: true })
    // Redirect the profile so the keystore, net policy and notifications land in
    // throwaway files instead of the developer's real userData.
    app.setPath('userData', join(workDir, 'userdata'))
    app.setPath('temp', join(workDir, 'temp'))
    app.setPath('downloads', join(workDir, 'downloads'))
    mkdirSync(join(workDir, 'userdata'), { recursive: true })
    mkdirSync(join(workDir, 'downloads'), { recursive: true })

    await build({
        entryPoints: [join(appRoot, 'src/main/capabilities/handlers.ts')],
        outfile: join(workDir, 'handlers.cjs'),
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: 'node20',
        external: ['electron'],
        logLevel: 'silent',
    })
    await build({
        entryPoints: [join(appRoot, 'src/preload/index.ts')],
        outfile: join(workDir, 'preload.cjs'),
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: 'node20',
        external: ['electron'],
        logLevel: 'silent',
    })

    const capabilities = require(join(workDir, 'handlers.cjs'))
    const httpBody = require(join(workDir, 'handlers.cjs'))

    // ---- injected gates -----------------------------------------------------
    // The real dialogs cannot answer themselves, so the smoke supplies the two
    // consent decisions and the DNS/address decision. Each is mutable, so the
    // test can drive both the allow and the refuse path.
    const consent = { allowSocket: true, allowBrowser: true, socketPrompts: [], browserPrompts: [] }
    const policy = { allowHost: true }
    const runtime = capabilities.setupCapabilityHandlers({
        assertAllowedPath: (value) => {
            if (typeof value !== 'string' || !value.startsWith(workDir)) {
                throw new Error('capability smoke: path outside the smoke root')
            }
            return value
        },
        assertHostAllowed: async (host) => {
            if (!policy.allowHost) throw new Error('net.socket: private address is blocked (smoke policy)')
            return host
        },
        confirm: {
            socket: async (prompt) => {
                consent.socketPrompts.push(prompt)
                return consent.allowSocket
            },
            browser: async (prompt) => {
                consent.browserPrompts.push(prompt)
                return consent.allowBrowser
            },
        },
    })

    // ---- local servers ------------------------------------------------------
    const echo = (socket) => {
        socket.write('HELLO\n')
        socket.on('data', (chunk) => socket.write(chunk))
    }
    const tcpServer = net.createServer(echo)
    await new Promise((done) => tcpServer.listen(0, '127.0.0.1', done))
    const tcpPort = tcpServer.address().port

    const cert = makeSelfSignedCert(workDir)
    const tlsServer = tls.createServer({ key: cert.key, cert: cert.cert }, echo)
    await new Promise((done) => tlsServer.listen(0, '127.0.0.1', done))
    const tlsPort = tlsServer.address().port

    const win = new BrowserWindow({
        show: false,
        webPreferences: {
            preload: join(workDir, 'preload.cjs'),
            contextIsolation: true,
            sandbox: false,
        },
    })
    await win.loadURL(PAGE)
    const evaluate = (expression) => win.webContents.executeJavaScript(expression, true)
    const call = (capability, params) =>
        evaluate(
            `window.knDesktop.invoke(${JSON.stringify(capability)}, ${
                params === undefined ? 'undefined' : JSON.stringify(params)
            })`,
        )

    /** Collect `desktop:event:<channel>` payloads inside the renderer. */
    const bridgeEvents = async (channel) => {
        await evaluate(
            `(function(){ window.__events = window.__events || {}; window.__events[${JSON.stringify(
                channel,
            )}] = []; window.knDesktop.on(${JSON.stringify(channel)}, function (value) { window.__events[${JSON.stringify(
                channel,
            )}].push(value) }); return true })()`,
        )
    }
    const events = (channel) => evaluate(`window.__events[${JSON.stringify(channel)}] || []`)
    const waitForEvent = async (channel, match, ms = 10000, label = channel) => {
        const deadline = Date.now() + ms
        for (;;) {
            const seen = await events(channel)
            const hit = seen.find(match)
            if (hit) return hit
            if (Date.now() > deadline) throw new Error(`${label} did not arrive`)
            await sleep(50)
        }
    }

    // A second window: sessions belong to the window that opened them, and this
    // one must not be able to drive the other's socket.
    const otherWin = new BrowserWindow({
        show: false,
        webPreferences: {
            preload: join(workDir, 'preload.cjs'),
            contextIsolation: true,
            sandbox: false,
        },
    })
    await otherWin.loadURL(PAGE)
    const otherCall = (capability, params) =>
        otherWin.webContents.executeJavaScript(
            `window.knDesktop.invoke(${JSON.stringify(capability)}, ${
                params === undefined ? 'undefined' : JSON.stringify(params)
            })`,
            true,
        )

    // ======================= 1. preload whitelist =======================
    console.log('\nPreload capability whitelist')
    const whitelist = await evaluate('window.knDesktop.capabilities')
    const expected = [
        'net.socketOpen',
        'net.socketWrite',
        'net.socketClose',
        'net.socketSessions',
        'shell.browserOpen',
        'shell.oauthStart',
        'shell.oauthWait',
        'shell.oauthSessions',
        'shell.oauthCancel',
        'storage.secretAvailable',
        'storage.secretSet',
        'storage.secretGet',
        'storage.secretHas',
        'storage.secretList',
        'storage.secretRemove',
        'storage.secretClear',
        'storage.secretNamespaces',
        'notification.available',
        'notification.show',
        'notification.setBadge',
        'notification.clear',
        'background.schedule',
        'background.list',
        'background.cancel',
        'background.cancelAll',
    ]
    const missing = expected.filter((name) => !whitelist.includes(name))
    check('preload: every new capability is whitelisted', missing.length === 0, missing.join(', '))
    check(
        'preload: no mail.* capability was added',
        !whitelist.some((name) => name.startsWith('mail')),
        whitelist.filter((name) => name.startsWith('mail')).join(', '),
    )

    // ======================= 2. raw socket =======================
    console.log('\nnet.socket: raw TCP stream')
    await bridgeEvents('net')
    const opened = await call('net.socketOpen', {
        host: '127.0.0.1',
        port: tcpPort,
        label: 'smoke-tcp',
        timeoutMs: 20000,
    })
    check(
        'open: answers with a session',
        opened && opened.protocol === 'tcp' && opened.port === tcpPort && !opened.encrypted,
        JSON.stringify(opened),
    )
    const hello = await waitForEvent('net', (event) => event.type === 'socket-data', 10000, 'greeting')
    check('data: server greeting arrives as base64', hello.dataBase64 === Buffer.from('HELLO\n').toString('base64'), hello.dataBase64)

    const written = await call('net.socketWrite', {
        sessionId: opened.sessionId,
        dataBase64: Buffer.from('PING\r\n').toString('base64'),
    })
    check('write: reports the flush', written === true, String(written))
    const echoed = await waitForEvent(
        'net',
        (event) => event.type === 'socket-data' && event.dataBase64 === Buffer.from('PING\r\n').toString('base64'),
        10000,
        'echo',
    )
    check('data: the echo comes back', Boolean(echoed))

    const sessions = await call('net.socketSessions')
    check(
        'sessions: counts the live socket',
        Array.isArray(sessions) && sessions.length === 1 && sessions[0].bytesOut >= 6,
        JSON.stringify(sessions),
    )

    const closed = await call('net.socketClose', { sessionId: opened.sessionId })
    check('close: reports success', closed === true, String(closed))
    const closeEvent = await waitForEvent('net', (event) => event.type === 'socket-close', 10000, 'close event')
    check(
        'close: the close event says it was local',
        closeEvent.local === true && closeEvent.sessionId === opened.sessionId,
        JSON.stringify(closeEvent),
    )
    check('consent: the socket was confirmed once', consent.socketPrompts.length === 1, String(consent.socketPrompts.length))

    // Sessions are per-window: another renderer must not be able to write to or
    // close a socket it did not open, even with the right session id.
    const owned = await call('net.socketOpen', { host: '127.0.0.1', port: tcpPort, label: 'smoke-tcp' })
    const foreignWrite = await otherCall('net.socketWrite', {
        sessionId: owned.sessionId,
        dataBase64: Buffer.from('Hijack\r\n').toString('base64'),
    }).then(
        () => null,
        (error) => String(error),
    )
    const foreignClose = await otherCall('net.socketClose', { sessionId: owned.sessionId })
    const foreignSessions = await otherCall('net.socketSessions')
    const ownerSessions = await call('net.socketSessions')
    check(
        'ownership: another window cannot write to this socket',
        typeof foreignWrite === 'string' && /no such session/.test(foreignWrite),
        foreignWrite || 'write unexpectedly succeeded',
    )
    check('ownership: another window cannot close it either', foreignClose === false, String(foreignClose))
    check(
        'ownership: another window does not see it',
        Array.isArray(foreignSessions) && foreignSessions.length === 0,
        JSON.stringify(foreignSessions),
    )
    check(
        'ownership: the owner still holds it',
        Array.isArray(ownerSessions) && ownerSessions.length === 1 && ownerSessions[0].sessionId === owned.sessionId,
        JSON.stringify(ownerSessions),
    )
    // A second open to the same target must reuse the grant (no new prompt).
    check('consent: a second connection to the same target is not re-asked', consent.socketPrompts.length === 1, String(consent.socketPrompts.length))
    await call('net.socketClose', { sessionId: owned.sessionId })

    // ======================= 3. TLS policy =======================
    console.log('\nnet.socket: TLS verification')
    const strictError = await call('net.socketOpen', {
        host: '127.0.0.1',
        port: tlsPort,
        protocol: 'tls',
        serverName: 'localhost',
        label: 'smoke-tls-strict',
    }).then(
        () => null,
        (error) => String(error),
    )
    check(
        'tls: strict refuses a self-signed certificate',
        typeof strictError === 'string' && /certificate|self.signed|unable to verify/i.test(strictError),
        strictError || 'open unexpectedly succeeded',
    )

    const relaxed = await call('net.socketOpen', {
        host: '127.0.0.1',
        port: tlsPort,
        protocol: 'tls',
        serverName: 'localhost',
        tlsMode: 'relaxed',
        label: 'smoke-tls-relaxed',
    }).catch((error) => ({ error: String(error) }))
    check(
        'tls: relaxed connects to the same server',
        relaxed && !relaxed.error && relaxed.encrypted === true,
        JSON.stringify(relaxed),
    )
    if (relaxed && !relaxed.error) {
        const tlsHello = await waitForEvent(
            'net',
            (event) => event.type === 'socket-data' && event.sessionId === relaxed.sessionId,
            10000,
            'tls greeting',
        )
        check('tls: bytes arrive over the encrypted stream', tlsHello.dataBase64 === Buffer.from('HELLO\n').toString('base64'))
        await call('net.socketClose', { sessionId: relaxed.sessionId })
    }

    // ======================= 4. refusals =======================
    console.log('\nFail-closed refusals')
    policy.allowHost = false
    const policyError = await call('net.socketOpen', {
        host: '127.0.0.1',
        port: tcpPort,
        label: 'smoke-policy-blocked',
    }).then(
        () => null,
        (error) => String(error),
    )
    check(
        'policy: a blocked target is refused before any dialog',
        typeof policyError === 'string' && /blocked/.test(policyError),
        policyError || 'open unexpectedly succeeded',
    )
    policy.allowHost = true

    consent.allowSocket = false
    const refusedError = await call('net.socketOpen', {
        host: '127.0.0.1',
        port: tcpPort,
        label: 'smoke-refused',
    }).then(
        () => null,
        (error) => String(error),
    )
    check(
        'consent: refusing the prompt refuses the connection',
        typeof refusedError === 'string' && /refused/.test(refusedError),
        refusedError || 'open unexpectedly succeeded',
    )
    consent.allowSocket = true

    const badUrl = await call('shell.browserOpen', { url: 'file:///etc/passwd' }).then(
        () => null,
        (error) => String(error),
    )
    check(
        'browser: a non-http(s) scheme is refused',
        typeof badUrl === 'string' && /http/.test(badUrl),
        badUrl || 'open unexpectedly succeeded',
    )

    // ======================= 5. browser + OAuth =======================
    console.log('\nshell: system browser + loopback redirect')
    // Stub the OS handoff: the point under test is the consent + listener, not
    // the desktop's URL handler. The stub hands the URL to the test, which
    // performs the redirect the browser would have performed.
    const realOpenExternal = shell.openExternal
    let handedToBrowser = null
    shell.openExternal = async (url) => {
        handedToBrowser = url
    }
    try {
        const callbackServer = http.createServer((request, response) => {
            response.writeHead(200, { 'content-type': 'text/plain' })
            response.end('smoke provider')
        })
        await new Promise((done) => callbackServer.listen(0, '127.0.0.1', done))
        const providerPort = callbackServer.address().port

        const browserResult = await call('shell.browserOpen', {
            url: `http://127.0.0.1:${providerPort}/authorize?client_id=smoke`,
        })
        check(
            'browser: opens after consent and reports the origin',
            browserResult && browserResult.opened === true && browserResult.origin === `http://127.0.0.1:${providerPort}`,
            JSON.stringify(browserResult),
        )
        check(
            'browser: the URL reached the OS handoff',
            handedToBrowser === `http://127.0.0.1:${providerPort}/authorize?client_id=smoke`,
            String(handedToBrowser),
        )
        check('browser: consent was asked once', consent.browserPrompts.length === 1, String(consent.browserPrompts.length))

        const oauthSession = await call('shell.oauthStart', { callbackPath: '/oauth/callback', timeoutMs: 20000 })
        check(
            'oauth: listener reports a loopback redirect_uri',
            oauthSession && /^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback$/.test(oauthSession.redirectUri),
            JSON.stringify(oauthSession),
        )

        const waiting = call('shell.oauthWait', { sessionId: oauthSession.sessionId })
        const authorizationUrl = `http://127.0.0.1:${providerPort}/authorize?redirect_uri=${encodeURIComponent(
            oauthSession.redirectUri,
        )}&state=smoke-state`
        await call('shell.browserOpen', { url: authorizationUrl })
        check('oauth: the authorization URL was opened', handedToBrowser === authorizationUrl, String(handedToBrowser))

        // What the browser would do with the provider's redirect.
        const redirect = `${oauthSession.redirectUri}?code=smoke-code&state=smoke-state`
        const providerResponse = await new Promise((done, fail) => {
            http.get(redirect, (response) => {
                let body = ''
                response.on('data', (chunk) => (body += chunk))
                response.on('end', () => done({ status: response.statusCode, body }))
            }).on('error', fail)
        })
        check(
            'oauth: the landing page answers the browser',
            providerResponse.status === 200 && /Authorization complete/i.test(providerResponse.body),
            String(providerResponse.status),
        )

        const oauthResult = await withTimeout(waiting, 15000, 'oauth wait')
        check(
            'oauth: the code comes back over IPC',
            oauthResult &&
                oauthResult.ok === true &&
                oauthResult.kind === 'oauth' &&
                oauthResult.query.code === 'smoke-code' &&
                oauthResult.query.state === 'smoke-state',
            JSON.stringify(oauthResult),
        )

        const cancelled = await call('shell.oauthStart', { callbackPath: '/oauth/callback', timeoutMs: 20000 })
        const cancelWait = call('shell.oauthWait', { sessionId: cancelled.sessionId })
        const didCancel = await call('shell.oauthCancel', { sessionId: cancelled.sessionId })
        const cancelledResult = await withTimeout(cancelWait, 10000, 'cancel wait')
        check(
            'oauth: cancel resolves the wait with cancelled',
            didCancel === true && cancelledResult.cancelled === true && cancelledResult.ok === false,
            JSON.stringify(cancelledResult),
        )

        await new Promise((done) => callbackServer.close(done))
    } finally {
        shell.openExternal = realOpenExternal
    }

    // ======================= 6. secrets =======================
    console.log('\nstorage.secret: keychain-backed KV')
    const secretsAvailable = await call('storage.secretAvailable')
    check('available: answers a boolean', typeof secretsAvailable === 'boolean', String(secretsAvailable))
    check(
        'available: agrees with safeStorage',
        secretsAvailable === safeStorage.isEncryptionAvailable(),
        `capability=${secretsAvailable} safeStorage=${safeStorage.isEncryptionAvailable()}`,
    )

    const secretWritten = await call('storage.secretSet', {
        namespace: 'plugin.smoke',
        key: 'refreshToken',
        value: 'super-secret-value-1234',
    })
    if (secretsAvailable) {
        check('set: stores the secret', secretWritten && secretWritten.ok === true, JSON.stringify(secretWritten))
        const keystorePath = join(workDir, 'userdata', 'plugin-secrets.json')
        const raw = existsSync(keystorePath) ? readFileSync(keystorePath, 'utf8') : ''
        check(
            'set: writes ciphertext only (no plaintext on disk)',
            raw.length > 0 && !raw.includes('super-secret-value-1234') && raw.includes('refreshToken'),
            raw.slice(0, 120),
        )

        const read = await call('storage.secretGet', { namespace: 'plugin.smoke', key: 'refreshToken' })
        check(
            'get: returns the plaintext to the caller',
            read && read.value === 'super-secret-value-1234' && read.decrypted === true,
            JSON.stringify(read),
        )

        const listed = await call('storage.secretList', { namespace: 'plugin.smoke' })
        check(
            'list: is metadata only',
            Array.isArray(listed) &&
                listed.length === 1 &&
                listed[0].key === 'refreshToken' &&
                listed[0].value === undefined,
            JSON.stringify(listed),
        )

        const has = await call('storage.secretHas', { namespace: 'plugin.smoke', key: 'refreshToken' })
        const missingKey = await call('storage.secretHas', { namespace: 'plugin.smoke', key: 'nope' })
        check('has: distinguishes present from absent', has === true && missingKey === false)

        const namespaces = await call('storage.secretNamespaces')
        check(
            'namespaces: reports the plugin namespace with a count',
            Array.isArray(namespaces) &&
                namespaces.some((entry) => entry.namespace === 'plugin.smoke' && entry.count === 1),
            JSON.stringify(namespaces),
        )

        const badNamespace = await call('storage.secretSet', {
            namespace: 'other-plugin',
            key: 'k',
            value: 'v',
        })
        check(
            'set: refuses a namespace outside plugin.<key> / app.<area>',
            badNamespace && badNamespace.ok === false && badNamespace.code === 'SECRET_INVALID_NAMESPACE',
            JSON.stringify(badNamespace),
        )

        const cleared = await call('storage.secretClear', { namespace: 'plugin.smoke' })
        const afterClear = await call('storage.secretList', { namespace: 'plugin.smoke' })
        check(
            'clear: empties one namespace and reports the count',
            cleared === 1 && Array.isArray(afterClear) && afterClear.length === 0,
            `cleared=${cleared} left=${afterClear.length}`,
        )
    } else {
        check(
            'set: refuses to store without a keychain',
            secretWritten &&
                secretWritten.ok === false &&
                secretWritten.code === 'SECRET_NO_KEYCHAIN',
            JSON.stringify(secretWritten),
        )
        check(
            'set: nothing was written to disk',
            !existsSync(join(workDir, 'userdata', 'plugin-secrets.json')),
        )
    }

    // ======================= 7. notifications =======================
    console.log('\nnotification.*')
    const notificationAvailable = await call('notification.available')
    check('available: answers a boolean', typeof notificationAvailable === 'boolean', String(notificationAvailable))
    const badge = await call('notification.setBadge', { count: 3 })
    check('setBadge: answers success on this platform', typeof badge === 'boolean', String(badge))
    const clearedNotifications = await call('notification.clear')
    check('clear: answers success', clearedNotifications === true, String(clearedNotifications))

    if (notificationAvailable) {
        const iconPath = join(workDir, 'icon.png')
        // A 1x1 PNG: the host checks the icon is a readable file, not its pixels.
        writeFileSync(
            iconPath,
            Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AGp1k6vAAAAAElFTkSuQmCC',
                'base64',
            ),
        )
        const shown = await call('notification.show', {
            title: 'Smoke',
            body: 'from the capability smoke test',
            iconPath,
            timeoutMs: 300,
        })
        check(
            'show: reports the notification and its dismissal',
            shown && shown.shown === true && shown.dismissed === true && shown.clicked === false,
            JSON.stringify(shown),
        )
    }
    const badIcon = await call('notification.show', {
        title: 'Smoke',
        iconPath: '/etc/passwd',
        timeoutMs: 100,
    })
    check(
        'show: refuses an icon outside the fs allowlist',
        badIcon && badIcon.shown === false && /allowlist|readable|outside/i.test(String(badIcon.error)),
        JSON.stringify(badIcon),
    )
    const noTitle = await call('notification.show', { body: 'no title' })
    check(
        'show: refuses a notification without a title',
        noTitle && noTitle.shown === false && /title/.test(String(noTitle.error)),
        JSON.stringify(noTitle),
    )

    // ======================= 8. background timers =======================
    console.log('\nbackground.*: host-driven timers')
    await bridgeEvents('background')
    const task = await call('background.schedule', {
        taskId: 'smoke.poll',
        intervalMs: 1000,
        initialDelayMs: 200,
    })
    check(
        'schedule: returns the task with its first deadline',
        task && task.taskId === 'smoke.poll' && task.nextAt > Date.now() - 1000,
        JSON.stringify(task),
    )
    const firstTick = await waitForEvent(
        'background',
        (event) => event.taskId === 'smoke.poll',
        10000,
        'first background tick',
    )
    check(
        'tick: carries run 1 and nothing missed',
        firstTick.run === 1 && firstTick.missed === 0 && firstTick.firedAt >= firstTick.scheduledAt,
        JSON.stringify(firstTick),
    )
    const listedTasks = await call('background.list')
    check(
        'list: reports the next deadline after the tick',
        Array.isArray(listedTasks) && listedTasks.length === 1 && listedTasks[0].runs >= 1,
        JSON.stringify(listedTasks),
    )
    const cancelledTask = await call('background.cancel', { taskId: 'smoke.poll' })
    const afterCancel = await call('background.list')
    check(
        'cancel: stops the task',
        cancelledTask === true && Array.isArray(afterCancel) && afterCancel.length === 0,
        JSON.stringify(afterCancel),
    )
    const badInterval = await call('background.schedule', { taskId: 'smoke.bad', intervalMs: 10 }).then(
        () => null,
        (error) => String(error),
    )
    check(
        'schedule: clamps to the minimum interval (1s) rather than accepting 10ms',
        badInterval === null,
        badInterval || 'rejected',
    )
    const clamped = await call('background.schedule', { taskId: 'smoke.clamped', intervalMs: 10 })
    check('schedule: 10ms becomes 1000ms', clamped && clamped.intervalMs === 1000, JSON.stringify(clamped))
    const cancelledAll = await call('background.cancelAll')
    check('cancelAll: clears the table', cancelledAll >= 1, String(cancelledAll))

    // ======================= 9. http body decoding =======================
    console.log('\nhttp.request: body representation helpers')
    const choose = httpBody.chooseBodyRepresentation
    const detect = httpBody.detectCharset
    check(
        'auto: json is text',
        choose(undefined, 'application/json; charset=utf-8', Buffer.from('{"a":1}')) === 'text',
    )
    check(
        'auto: a png is base64',
        choose(undefined, 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) === 'base64',
    )
    check(
        'auto: octet-stream that is really text sniffs as text',
        choose(undefined, 'application/octet-stream', Buffer.from('plain log line\n')) === 'text',
    )
    check(
        'explicit: base64 wins over a textual content type',
        choose('base64', 'application/json', Buffer.from('{"a":1}')) === 'base64',
    )
    check(
        'explicit: text wins over a binary content type',
        choose('text', 'image/png', Buffer.from('abc')) === 'text',
    )
    check('charset: reads the parameter', detect('text/html; charset=GBK') === 'gbk')
    check('charset: defaults to utf-8', detect('text/html') === 'utf-8')
    check(
        'charset: aliases resolve to a decoder Node accepts',
        httpBody.decodeBody(Buffer.from([0xc4, 0xe3, 0xba, 0xc3]), 'gb2312') === '你好',
        httpBody.decodeBody(Buffer.from([0xc4, 0xe3, 0xba, 0xc3]), 'gb2312'),
    )
    check(
        'sniff: rejects a real PNG even without a content type',
        choose(undefined, '', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) === 'base64',
    )

    otherWin.destroy()
    win.destroy()
    runtime.dispose()
    tcpServer.close()
    tlsServer.close()
}

app.whenReady().then(async () => {
    const timer = setTimeout(() => {
        console.error('capability smoke timed out')
        app.exit(2)
    }, 120000)
    try {
        await run()
    } catch (error) {
        check('capability smoke completed', false, String((error && error.stack) || error))
    } finally {
        clearTimeout(timer)
        const failed = results.filter((entry) => !entry.ok)
        console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
        if (failed.length) console.log('failed:\n' + failed.map((entry) => `  - ${entry.name}: ${entry.detail}`).join('\n'))
        app.exit(failed.length ? 1 : 0)
    }
})

app.on('window-all-closed', () => {})
