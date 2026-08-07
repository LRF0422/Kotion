
import { KPlugin, PluginConfig } from "@kn/common";
import { BlockReferenceExtension } from "./extension/block-reference/index";
import { backlinksDockPanel } from "./bidirectional-link/components/BacklinksDockPanel";


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
    editorExtension: [BlockReferenceExtension],
    dockPanels: [backlinksDockPanel],
    // Only the dock panel title goes through the app's i18n; everything else in
    // this plugin uses the local table in ./i18n.
    locales: {
        zh: { translation: { dock: { backlinks: '反向链接' } } },
        en: { translation: { dock: { backlinks: 'Backlinks' } } },
    }
});