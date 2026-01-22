import { KPlugin, PluginConfig } from "@kn/common";
import { BilibiliExt, BilibiliExtension } from "./extension";

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
    editorExtension: [BilibiliExt]
});
export * from "./extension";