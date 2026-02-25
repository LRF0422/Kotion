import { PluginConfig } from "@kn/common"
import { PluginConfigData } from "@kn/core"

export interface GitHubPluginConfig extends PluginConfigData {
    personalAccessToken: string
    defaultOwner: string
    defaultRepo: string
    cacheTTLMinutes: number
    autoRefreshEnabled: boolean
    autoRefreshIntervalMinutes: number
}

export const DEFAULT_GITHUB_CONFIG: GitHubPluginConfig = {
    personalAccessToken: '',
    defaultOwner: '',
    defaultRepo: '',
    cacheTTLMinutes: 5,
    autoRefreshEnabled: true,
    autoRefreshIntervalMinutes: 15,
}
