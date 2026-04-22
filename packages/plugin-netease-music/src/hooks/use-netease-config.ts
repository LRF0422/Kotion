import { usePluginConfig } from "@kn/common"
import type { NeteaseMusicPluginConfig } from '../types/config'
import { DEFAULT_NETEASE_MUSIC_CONFIG } from '../types/config'

export const NETEASE_MUSIC_PLUGIN_KEY = 'netease-music-settings'

export function useNeteaseMusicConfig() {
    return usePluginConfig<NeteaseMusicPluginConfig>({
        pluginKey: NETEASE_MUSIC_PLUGIN_KEY,
        defaultConfig: DEFAULT_NETEASE_MUSIC_CONFIG,
    })
}
