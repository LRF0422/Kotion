import { usePluginConfig } from '@kn/core'
import type { GitHubPluginConfig } from '../types/config'
import { DEFAULT_GITHUB_CONFIG } from '../types/config'

export const GITHUB_PLUGIN_KEY = 'github-settings'

export function useGitHubConfig() {
    return usePluginConfig<GitHubPluginConfig>({
        pluginKey: GITHUB_PLUGIN_KEY,
        defaultConfig: DEFAULT_GITHUB_CONFIG,
    })
}
