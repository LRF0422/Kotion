import { PluginConfigStore, usePluginConfig } from "@kn/common"
import type { GitHubPluginConfig } from '../types/config'
import { DEFAULT_GITHUB_CONFIG } from '../types/config'

export const GITHUB_PLUGIN_KEY = 'github-settings'

/**
 * Credential fields of the GitHub config. Declared so the storage layer keeps
 * the PAT out of localStorage and out of every server read — the token only
 * ever exists in memory, revealed on demand.
 */
export const GITHUB_SECRET_FIELDS = ['personalAccessToken'] as const

export function useGitHubConfig() {
    return usePluginConfig<GitHubPluginConfig>({
        pluginKey: GITHUB_PLUGIN_KEY,
        defaultConfig: DEFAULT_GITHUB_CONFIG,
        secretFields: GITHUB_SECRET_FIELDS,
    })
}

/**
 * Decrypted PAT for runtime callers (Octokit, direct REST calls), revealed from
 * the server into memory. Returns `''` when the user has not configured one.
 */
export async function loadGitHubToken(): Promise<string> {
    const store = PluginConfigStore.getInstance()
    await store.initialize()
    return store.getSecret(GITHUB_PLUGIN_KEY, 'personalAccessToken')
}

/**
 * Same as {@link loadGitHubToken} but throws for tool executors, which cannot
 * proceed without a token and surface the message to the user.
 */
export async function requireGitHubToken(): Promise<string> {
    const token = await loadGitHubToken()
    if (!token) {
        throw new Error('GitHub PAT not configured. Please set it in Settings -> GitHub.')
    }
    return token
}

/** Non-hook config read with defaults merged (credentials stay masked). */
export async function loadGitHubConfig(): Promise<GitHubPluginConfig> {
    const store = PluginConfigStore.getInstance()
    await store.initialize()
    const saved = await store.getConfig<GitHubPluginConfig>(GITHUB_PLUGIN_KEY)
    return { ...DEFAULT_GITHUB_CONFIG, ...(saved ?? {}) }
}
