import { usePluginConfig } from "@kn/common"
import type { NeteaseMusicPluginConfig } from '../types/config'
import { DEFAULT_NETEASE_MUSIC_CONFIG } from '../types/config'

export const NETEASE_MUSIC_PLUGIN_KEY = 'netease-music-settings'

/**
 * Credential fields of the NetEase config. Declared so the storage layer keeps
 * the account cookie out of localStorage and out of every server read.
 */
export const NETEASE_MUSIC_SECRET_FIELDS = ['cookie'] as const

export function useNeteaseMusicConfig() {
    return usePluginConfig<NeteaseMusicPluginConfig>({
        pluginKey: NETEASE_MUSIC_PLUGIN_KEY,
        defaultConfig: DEFAULT_NETEASE_MUSIC_CONFIG,
        secretFields: NETEASE_MUSIC_SECRET_FIELDS,
    })
}
