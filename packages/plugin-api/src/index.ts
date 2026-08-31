/**
 * @kn/plugin-api — the versioned contract between the host application and
 * remotely-loaded plugins.
 *
 * Dependency direction is strictly `plugin-api -> common` (type-only), so the
 * host (@kn/common) never depends on this package at runtime; the host API
 * version is injected into PluginManager by the App entry instead.
 */

/**
 * The plugin API contract version.
 *
 * Single source of truth is this package's `package.json` version — keep the
 * two in sync (the rollup build reads `package.json`, the host reads this
 * constant). Bump the MAJOR part on breaking contract changes; plugins built
 * against a different major version are skipped by the host at load time.
 */
export const PLUGIN_API_VERSION = "2.0.0"

/**
 * Metadata a plugin bundle registers alongside its exports.
 * Legacy bundles (built before the __KN__ namespace) have no meta at all.
 */
export interface PluginMeta {
    /** The @kn/plugin-api version the plugin was built against. */
    apiVersion?: string
    /** The plugin's package name (UMD bundle name). */
    packageName?: string
}

/**
 * What `window.__KN__.definePlugin` records and
 * `window.__KN__.getPlugin` returns for a loaded plugin bundle.
 */
export interface PluginRegistration {
    /** The UMD module exports of the plugin bundle. */
    exports: Record<string, unknown>
    /** Build-time metadata (empty object for legacy bundles). */
    meta: PluginMeta
}

// Contract types re-exported (type-only) from @kn/common so plugin authors
// can depend on @kn/plugin-api alone for typings.
export type {
    PluginConfig,
    KPlugin,
    ExtensionWrapper,
    Services,
    RouteConfig,
    PluginSettingsConfig,
    TourConfig,
    DockPanelConfig,
    DockPanelContext,
    DockPanelProps,
    DockPosition,
    SpacePageService,
    SpaceOperations,
    PageOperations,
    TemplateOperations,
    MemberPermissionOperations,
    CollaborationOperations,
    ShareOperations,
    CommentOperations,
    TagOperations,
    ActivityOperations,
    RelationOperations,
    PageHistoryOperations,
    PageSessionOperations,
    PageOperationOperations,
    PageDocumentOperations,
    SpaceId,
    PageId,
    BlockId,
    UserId,
    PagedResult,
    Space,
    UserSummary,
    PageMetadata,
    PageSummary,
    PageTreeNode,
    PageDocument,
    PageDocumentSnapshot,
    SpacePageChange,
    SpacePageChangeStream,
    CurrentPageContext,
    PageNavigationBridge,
} from "@kn/common"
