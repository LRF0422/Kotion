import { KPlugin, PluginConfig } from "@kn/common";
import { NeteaseMusicExt, NeteaseMusicExtension } from "./extension";
import { NeteaseMusicSettings } from "./components/NeteaseMusicSettings";
import { Music } from "@kn/icon";
import React from "react";

interface NeteaseMusicPluginConfig extends PluginConfig { }

class NeteaseMusicPlugin extends KPlugin<NeteaseMusicPluginConfig> {
    static pluginName = "neteaseMusic";
    static command = "neteaseMusic";

    constructor(config: NeteaseMusicPluginConfig) {
        super(config);
        this.name = "NeteaseMusic";
    }

    get extension() {
        return NeteaseMusicExtension;
    }

    get menuConfig() {
        return {
            text: "Embed NetEase Cloud Music",
            icon: "music",
            command: "neteaseMusic"
        };
    }
}
export const neteaseMusic = new NeteaseMusicPlugin({
    name: "neteaseMusic",
    status: "enabled",
    editorExtension: [NeteaseMusicExt],
    settings: {
        key: 'netease-music-settings',
        label: '网易云音乐',
        description: '配置网易云音乐账号和API服务',
        icon: React.createElement(Music, { className: 'h-4 w-4' }),
        component: NeteaseMusicSettings,
    },
});
