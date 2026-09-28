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
    tools: liftLegacyTools(bilibiliTools, { scope: 'page' }),
    skills: liftLegacySkills([bilibiliSkill]),
});
export * from "./extension";
export * from "./extension/tools";