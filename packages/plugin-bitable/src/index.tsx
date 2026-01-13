import { KPlugin, PluginConfig } from "@kn/common";
import { BitableExtension } from "./bitable";

interface BitablePluginConfig extends PluginConfig {
    // 可以在这里添加插件特定的配置
}

class BitablePlugin extends KPlugin<BitablePluginConfig> { }

export const bitable = new BitablePlugin({
    status: '',
    name: 'Bitable',
    editorExtension: [BitableExtension]
});
