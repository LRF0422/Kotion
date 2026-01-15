
import { KPlugin, PluginConfig } from "@kn/common";
import { BlockReferenceExtension } from "./extension/block-reference/inde";

// Export types for external use
export * from "./types";
export * from "./hooks";

interface BlockReferenceConfig extends PluginConfig {
    // Future configuration options can be added here
}

class BlockReferencePlugin extends KPlugin<BlockReferenceConfig> {
    // Plugin-specific methods can be added here
}

export const blockReference = new BlockReferencePlugin({
    status: '',
    name: 'blockReference',
    editorExtension: [BlockReferenceExtension]
});