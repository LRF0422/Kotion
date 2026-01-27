
import { KPlugin, PluginConfig } from "@kn/common";
import { BlockReferenceExtension } from "./extension/block-reference/index";

// Export types for external use
export * from "./types";
export * from "./hooks";
export * from "./i18n";
export * from "./utils";
export * from "./constants";

/**
 * Configuration interface for Block Reference Plugin
 */
interface BlockReferenceConfig extends PluginConfig {
    /** Enable caching for block/page data (default: true) */
    enableCache?: boolean;
    /** Cache TTL in milliseconds (default: 5 minutes) */
    cacheTTL?: number;
}

/**
 * Block Reference Plugin
 * Provides block and page reference functionality for the Knowledge editor
 */
class BlockReferencePlugin extends KPlugin<BlockReferenceConfig> {
    // Plugin-specific methods can be added here
}

export const blockReference = new BlockReferencePlugin({
    status: '',
    name: 'blockReference',
    editorExtension: [BlockReferenceExtension]
});