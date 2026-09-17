import { PluginConfigData } from "@kn/common"

export interface GitHubPluginConfig extends PluginConfigData {
    personalAccessToken: string
    defaultOwner: string
    defaultRepo: string
    cacheTTLMinutes: number
    autoRefreshEnabled: boolean
    autoRefreshIntervalMinutes: number
    /** Prefix pre-filled for new release tags, e.g. "v" produces "v1.2.0". */
    releaseTagPrefix: string
    /** Default state for the "draft" toggle when composing a release. */
    releaseDraftDefault: boolean
    /** Default state for the "pre-release" toggle when composing a release. */
    releasePrereleaseDefault: boolean
    /** Ask GitHub to auto-generate release notes from merged PRs by default. */
    releaseAutoGenerateNotes: boolean
}

export const DEFAULT_GITHUB_CONFIG: GitHubPluginConfig = {
    personalAccessToken: '',
    defaultOwner: '',
    defaultRepo: '',
    cacheTTLMinutes: 5,
    autoRefreshEnabled: true,
    autoRefreshIntervalMinutes: 15,
    releaseTagPrefix: 'v',
    releaseDraftDefault: false,
    releasePrereleaseDefault: false,
    releaseAutoGenerateNotes: true,
}
