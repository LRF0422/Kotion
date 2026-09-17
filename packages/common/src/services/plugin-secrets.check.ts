/**
 * Runtime checks for the plugin-credential redaction layer.
 *
 * Run with: pnpm --filter @kn/common check:plugin-secrets
 */

import {
    SECRET_MASK,
    clearCachedPluginSecrets,
    containsPlaintextSecret,
    detectSecretFields,
    extractSecretValues,
    hasSecretValue,
    isSecretFieldName,
    isSecretMask,
    maskSecretForDisplay,
    redactSecretFields,
    resolveSecretFields,
} from './plugin-secrets'
import {
    LocalPluginConfigStorage,
    PluginConfigData,
    PluginConfigStore,
    PluginConfigStorageAdapter,
} from './plugin-config-service'

let pass = 0
let fail = 0

function check(name: string, condition: boolean, actual?: unknown): void {
    if (condition) {
        pass += 1
        console.log('  ok   ' + name)
    } else {
        fail += 1
        console.log('  FAIL ' + name + (actual === undefined ? '' : '  -> ' + JSON.stringify(actual)))
    }
}

// ─── Field detection ─────────────────────────────────────────

console.log('\nSecret field detection')

const realSecrets = [
    'apiKey',
    'api_key',
    'API-KEY',
    'personalAccessToken',
    'accessSecret',
    'access_secret',
    'clientSecret',
    'password',
    'refreshToken',
    'authorization',
    'cookie',
    'privateKey',
]
for (const name of realSecrets) {
    check(`flags ${name}`, isSecretFieldName(name))
}

const nonSecrets = [
    'maxTokens',
    'cacheTTLMinutes',
    'defaultSearchCount',
    'enableCache',
    'baseUrl',
    'defaultRepo',
    'defaultOwner',
    'releaseTagPrefix',
    'tokenCount',
    'cookiesEnabled',
    'apiEndpoint',
    'maxTokenBudget',
]
for (const name of nonSecrets) {
    check(`leaves ${name} alone`, !isSecretFieldName(name), name)
}

check(
    'detects the real AI settings config',
    JSON.stringify(detectSecretFields({
        apiEndpoint: '',
        apiKey: 'sk-live',
        imageApiEndpoint: '',
        enableAutoComplete: true,
        maxTokens: '2048',
    })) === JSON.stringify(['apiKey']),
    detectSecretFields({ apiKey: 'x', maxTokens: '1' }),
)

check(
    'detects the real GitHub settings config',
    JSON.stringify(detectSecretFields({
        personalAccessToken: 'ghp_x',
        defaultOwner: 'acme',
        cacheTTLMinutes: 5,
        autoRefreshEnabled: true,
    })) === JSON.stringify(['personalAccessToken']),
)

// ─── Redaction ───────────────────────────────────────────────

console.log('\nRedaction')

const { redacted, secrets } = redactSecretFields(
    { apiKey: 'sk-live-123456', apiEndpoint: 'https://x', maxTokens: '2048' },
    ['apiKey'],
)
check('masks the credential', redacted.apiKey === SECRET_MASK, redacted.apiKey)
check('keeps non-secret fields', redacted.apiEndpoint === 'https://x' && redacted.maxTokens === '2048')
check('lifts the plaintext out', secrets.apiKey === 'sk-live-123456')

const alreadyMasked = redactSecretFields({ apiKey: SECRET_MASK }, ['apiKey'])
check('keeps an existing mask', alreadyMasked.redacted.apiKey === SECRET_MASK)
check('does not treat a mask as a value', Object.keys(alreadyMasked.secrets).length === 0)

const empty = redactSecretFields({ apiKey: '' }, ['apiKey'])
check('does not turn "unset" into "configured"', empty.redacted.apiKey === '')

check('hasSecretValue rejects masks', !hasSecretValue(SECRET_MASK) && !hasSecretValue('') && !hasSecretValue(null))
check('hasSecretValue accepts a credential', hasSecretValue('ghp_x'))
check('isSecretMask is exact', isSecretMask(SECRET_MASK) && !isSecretMask('sk-' + SECRET_MASK))

check(
    'extractSecretValues skips masks',
    JSON.stringify(extractSecretValues({ apiKey: SECRET_MASK, token: 't' }, ['apiKey', 'token'])) ===
        JSON.stringify({ token: 't' }),
)
check(
    'containsPlaintextSecret is false for a fully masked config',
    !containsPlaintextSecret({ apiKey: SECRET_MASK, token: '' }),
)
check('containsPlaintextSecret is true for a legacy config', containsPlaintextSecret({ apiKey: 'sk-live' }))

check(
    'a plugin declaration is unioned with the heuristic',
    JSON.stringify(resolveSecretFields({ weirdField: 'x', apiKey: 'y' }, ['weirdField']).sort()) ===
        JSON.stringify(['apiKey', 'weirdField']),
)

console.log('\nDisplay mask')
check('keeps only a short tail', maskSecretForDisplay('ghp_abcdef123456') === '••••••3456', maskSecretForDisplay('ghp_abcdef123456'))
check('never reveals a short secret', maskSecretForDisplay('abc') === '•••')

// ─── localStorage adapter ────────────────────────────────────

console.log('\nlocalStorage adapter never persists a credential')

const STORAGE_KEY = 'kn_plugin_configs_check'
const local = new LocalPluginConfigStorage(STORAGE_KEY)

async function testLocalAdapter(): Promise<void> {
    await local.save('github-settings', {
        personalAccessToken: 'ghp_super_secret',
        defaultOwner: 'acme',
    })
    const raw = localStorage.getItem(STORAGE_KEY) ?? ''
    check('raw localStorage has no credential', !raw.includes('ghp_super_secret'), raw)
    check('raw localStorage holds the mask', raw.includes(SECRET_MASK))

    const loaded = await local.load('github-settings')
    check('loading returns the masked value', loaded?.personalAccessToken === SECRET_MASK)
    check('loading keeps non-secret fields', loaded?.defaultOwner === 'acme')

    // An explicitly redacted projection always wins over the heuristic.
    await local.save('ai-settings', { apiKey: 'sk-x', note: 'keep' }, { apiKey: SECRET_MASK, note: 'keep' })
    const ai = await local.load('ai-settings')
    check('honours the caller-supplied projection', ai?.apiKey === SECRET_MASK && ai?.note === 'keep')
}

// ─── Store: save / reveal / migrate ──────────────────────────

interface FakeAdapter extends PluginConfigStorageAdapter {
    apiSaves: Array<{ pluginKey: string; config: PluginConfigData }>
    localWrites: Array<{ pluginKey: string; config: PluginConfigData }>
    revealed: number
    revealValue: PluginConfigData | null
    failDurableWrite: boolean
}

function createFakeAdapter(seedLocal: Record<string, PluginConfigData> = {}): FakeAdapter {
    const localCopy: Record<string, PluginConfigData> = { ...seedLocal }
    const adapter: FakeAdapter = {
        apiSaves: [],
        localWrites: [],
        revealed: 0,
        revealValue: null,
        failDurableWrite: false,
        async load(pluginKey) {
            return localCopy[pluginKey] ?? null
        },
        async loadAll() {
            return { ...localCopy }
        },
        async save(pluginKey, config, redacted) {
            adapter.apiSaves.push({ pluginKey, config })
            localCopy[pluginKey] = redacted ?? config
        },
        async migratePlaintextSecret(pluginKey, config, redacted) {
            if (adapter.failDurableWrite) throw new Error('offline')
            adapter.apiSaves.push({ pluginKey, config })
            localCopy[pluginKey] = redacted
        },
        async reveal(pluginKey) {
            adapter.revealed += 1
            return adapter.revealValue
        },
    }
    return adapter
}

async function testStore(): Promise<void> {
    console.log('\nStore redacts on save and reveals on demand')

    PluginConfigStore.resetInstance()
    clearCachedPluginSecrets()
    const adapter = createFakeAdapter()
    const store = PluginConfigStore.getInstance(adapter)
    store.registerSecretFields('github-settings', ['personalAccessToken'])

    await store.saveConfig('github-settings', {
        personalAccessToken: 'ghp_live',
        defaultOwner: 'acme',
    })

    check('the durable write receives the plaintext', adapter.apiSaves[0].config.personalAccessToken === 'ghp_live')
    check(
        'getConfig only ever exposes the mask',
        (await store.getConfig('github-settings'))?.personalAccessToken === SECRET_MASK,
    )
    check('getSecret returns the in-memory credential', (await store.getSecret('github-settings', 'personalAccessToken')) === 'ghp_live')

    // A fresh store (cold memory) must fetch the credential from the server.
    PluginConfigStore.resetInstance()
    clearCachedPluginSecrets()
    const coldAdapter = createFakeAdapter({ 'github-settings': { personalAccessToken: SECRET_MASK, defaultOwner: 'acme' } })
    coldAdapter.revealValue = { personalAccessToken: 'ghp_server_side' }
    const coldStore = PluginConfigStore.getInstance(coldAdapter)
    coldStore.registerSecretFields('github-settings', ['personalAccessToken'])
    await coldStore.initialize()

    check('a cold read does not call reveal eagerly', coldAdapter.revealed === 0)
    check('getSecret falls back to the server', (await coldStore.getSecret('github-settings', 'personalAccessToken')) === 'ghp_server_side')
    check('reveal is called exactly once', coldAdapter.revealed === 1)
    check('the credential is now cached', (await coldStore.getSecret('github-settings', 'personalAccessToken')) === 'ghp_server_side')
    check('reveal is not repeated', coldAdapter.revealed === 1)

    // ── Legacy plaintext migration ──
    console.log('\nLegacy plaintext is migrated transparently')

    PluginConfigStore.resetInstance()
    clearCachedPluginSecrets()
    const legacyAdapter = createFakeAdapter({
        'github-settings': { personalAccessToken: 'ghp_legacy', defaultOwner: 'acme' },
    })
    const legacyStore = PluginConfigStore.getInstance(legacyAdapter)
    legacyStore.registerSecretFields('github-settings', ['personalAccessToken'])
    await legacyStore.initialize()

    check('the legacy credential is pushed to the server', legacyAdapter.apiSaves[0].config.personalAccessToken === 'ghp_legacy')
    check('the local copy is rewritten masked', legacyAdapter.localWrites.length === 0 && (await legacyAdapter.load('github-settings'))?.personalAccessToken === SECRET_MASK)
    check('the cached config is masked', (await legacyStore.getConfig('github-settings'))?.personalAccessToken === SECRET_MASK)
    check('the credential survives in memory', (await legacyStore.getSecret('github-settings', 'personalAccessToken')) === 'ghp_legacy')

    // A failed durable write must not destroy the credential.
    PluginConfigStore.resetInstance()
    clearCachedPluginSecrets()
    const offlineAdapter = createFakeAdapter({
        'github-settings': { personalAccessToken: 'ghp_offline', defaultOwner: 'acme' },
    })
    offlineAdapter.failDurableWrite = true
    const offlineStore = PluginConfigStore.getInstance(offlineAdapter)
    offlineStore.registerSecretFields('github-settings', ['personalAccessToken'])
    await offlineStore.initialize()

    check(
        'a failed migration leaves the legacy copy untouched',
        (await offlineAdapter.load('github-settings'))?.personalAccessToken === 'ghp_offline',
    )
    check('the credential still works in memory', (await offlineStore.getSecret('github-settings', 'personalAccessToken')) === 'ghp_offline')

    // Clearing for logout.
    clearCachedPluginSecrets()
    check('logout drops the in-memory credential', (await offlineStore.getSecret('github-settings', 'personalAccessToken')) === '')

    // Clearing a credential must not leave the old value in the memory cache.
    console.log('\nClearing a credential drops the cached value')

    PluginConfigStore.resetInstance()
    clearCachedPluginSecrets()
    const clearAdapter = createFakeAdapter({ 'github-settings': { personalAccessToken: SECRET_MASK } })
    clearAdapter.revealValue = { personalAccessToken: 'ghp_to_be_cleared' }
    const clearStore = PluginConfigStore.getInstance(clearAdapter)
    clearStore.registerSecretFields('github-settings', ['personalAccessToken'])
    await clearStore.initialize()

    check(
        'the credential is revealed first',
        (await clearStore.getSecret('github-settings', 'personalAccessToken')) === 'ghp_to_be_cleared',
    )

    await clearStore.saveConfig('github-settings', {
        personalAccessToken: '',
        defaultOwner: 'acme',
    })
    // The server no longer holds the credential, so a fresh reveal returns nothing.
    clearAdapter.revealValue = null
    const revealsBefore = clearAdapter.revealed
    check(
        'the cleared credential is no longer served from memory',
        (await clearStore.getSecret('github-settings', 'personalAccessToken')) === '',
    )
    check(
        'the cleared value had to be re-fetched from the server',
        clearAdapter.revealed === revealsBefore + 1,
    )

    // A masked (untouched) credential must survive a save.
    const keepAdapter = createFakeAdapter({ 'github-settings': { personalAccessToken: SECRET_MASK } })
    keepAdapter.revealValue = { personalAccessToken: 'ghp_kept' }
    PluginConfigStore.resetInstance()
    clearCachedPluginSecrets()
    const keepStore = PluginConfigStore.getInstance(keepAdapter)
    keepStore.registerSecretFields('github-settings', ['personalAccessToken'])
    await keepStore.initialize()
    await keepStore.getSecret('github-settings', 'personalAccessToken')
    await keepStore.saveConfig('github-settings', {
        personalAccessToken: SECRET_MASK,
        defaultOwner: 'acme',
    })
    check(
        'an echoed mask keeps the credential in memory',
        (await keepStore.getSecret('github-settings', 'personalAccessToken')) === 'ghp_kept',
    )
}

async function main(): Promise<void> {
    await testLocalAdapter()
    await testStore()
    console.log(`\n${pass} passed, ${fail} failed`)
    process.exit(fail === 0 ? 0 : 1)
}

void main()
