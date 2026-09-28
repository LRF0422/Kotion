import { KPlugin, PluginConfig, liftLegacySkills, liftLegacyTools } from "@kn/common";
import { NeteaseMusicExt, NeteaseMusicExtension } from "./extension";
import { neteaseMusicTools } from "./extension/tools";
import { neteaseMusicSkill } from "./extension/skills/netease-music-skill";
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
    agent: {
        agents: [{
            id: 'netease-music-ops',
            name: '网易云音乐嵌入',
            description: '在当前页面插入或更新网易云音乐卡片（单曲 / 歌单 / 专辑）：先查出 musicId 与类型，再写进文档。'
                + '当用户想把某首歌或某个歌单嵌进页面时派给它。',
            scope: 'page',
            systemPrompt: '你是网易云音乐嵌入助手，只操作当前页面的音乐卡片（insertNeteaseMusic / updateNeteaseMusic）。'
                + '写入前先用 getNeteaseMusicInfo 确认 musicId 与类型（song / playlist / album），同名结果多时选最匹配的一个，不要凭猜测的 ID 写入。'
                + '不要改动本页其他内容。完成后一句话汇报：插入了哪首歌或哪个歌单，以及落在文档的哪个位置。',
            tools: liftLegacyTools(neteaseMusicTools, { scope: 'page' }),
            skills: liftLegacySkills([neteaseMusicSkill]),
        }],
    },
    settings: {
        key: 'netease-music-settings',
        label: '网易云音乐',
        description: '配置网易云音乐账号和API服务',
        icon: React.createElement(Music, { className: 'h-4 w-4' }),
        component: NeteaseMusicSettings,
    },
});
