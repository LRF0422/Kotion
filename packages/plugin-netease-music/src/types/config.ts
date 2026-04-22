import { PluginConfigData } from "@kn/common"

export interface NeteaseMusicPluginConfig extends PluginConfigData {
    /** 网易云音乐用户Cookie（用于访问需要登录的API） */
    cookie: string
    /** 默认显示模式：player(嵌入播放器) 或 card(卡片) */
    defaultDisplayMode: 'player' | 'card'
    /** 嵌入播放器是否自动播放 */
    autoPlay: boolean
    /** NeteaseCloudMusicApi 服务地址（可选，用于搜索等高级功能） */
    apiBaseUrl: string
}

export const DEFAULT_NETEASE_MUSIC_CONFIG: NeteaseMusicPluginConfig = {
    cookie: '',
    defaultDisplayMode: 'player',
    autoPlay: false,
    apiBaseUrl: '',
}
