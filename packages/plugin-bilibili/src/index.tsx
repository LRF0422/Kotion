import { KPlugin, PluginConfig, liftLegacySkills, liftLegacyTools } from "@kn/common";
import { BilibiliExt, BilibiliExtension } from "./extension";
import { bilibiliTools } from "./extension/tools";
import { bilibiliSkill } from "./extension/skills/bilibili-skill";

interface BilibiliPluginConfig extends PluginConfig { }

class BilibiliPlugin extends KPlugin<BilibiliPluginConfig> {
    static pluginName = "bilibili";
    static command = "bilibili";

    constructor(config: BilibiliPluginConfig) {
        super(config);
        this.name = "Bilibili";
    }

    get extension() {
        return BilibiliExtension;
    }

    get menuConfig() {
        return {
            text: "Embed Bilibili Video",
            icon: "video",
            command: "bilibili"
        };
    }
}

export { BilibiliPlugin };
export const bilibili = new BilibiliPlugin({
    name: "bilibili",
    status: "enabled",
    editorExtension: [BilibiliExt],
    agent: {
        agents: [{
            id: 'bilibili-ops',
            name: 'B站视频嵌入',
            description: '在当前页面插入或更新 B 站视频卡片（按 bvid，可带起播时间）：先用工具确认视频信息，再写进文档。'
                + '当用户想把某个 B 站视频嵌进页面时派给它。',
            scope: 'page',
            systemPrompt: '你是 B 站视频嵌入助手，只操作当前页面的 B 站视频卡片（insertBilibiliVideo / updateBilibiliVideo）。'
                + '写入前先用 getBilibiliVideosInfo 确认 bvid 与标题，不要凭猜测的 bvid 写入。'
                + '不要改动本页其他内容。完成后一句话汇报：插入了哪个视频（bvid / 标题）以及落在文档的哪个位置。',
            tools: liftLegacyTools(bilibiliTools, { scope: 'page' }),
            skills: liftLegacySkills([bilibiliSkill]),
        }],
    },
});
export * from "./extension";
export * from "./extension/tools";