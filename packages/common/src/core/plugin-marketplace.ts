/**
 * Core plugin-marketplace contract.
 *
 * Centralizes the catalogue lifecycle that used to be spread across the Shop
 * components: submitting a plugin for review (上架), publishing a new version
 * (发布), and upgrading an installed plugin (升级). `@kn/core` registers the
 * implementation as the `pluginMarketplace` core service so the plugin studio
 * (UI and agent tools) can drive the same flow.
 */

/** Developer-side submission/published-plugin status. */
export type PluginMarketplaceStatus = 'PENDING' | 'IN_PROGRESS' | 'REJECTED' | 'DONE'

/** One of the developer's submissions or published plugins. */
export interface PluginMarketplaceMine {
    id: string | number
    name?: string
    pluginKey?: string
    version?: string
    status?: PluginMarketplaceStatus
    icon?: string
    reviewComment?: string
    reviewReasonCode?: string
    reviewTime?: string
    [key: string]: unknown
}

/** One installed plugin as the catalogue knows it (has the version ids). */
export interface PluginMarketplaceInstalled {
    id?: string | number
    name?: string
    pluginKey?: string
    version?: string
    currentVersionId?: string | number
    installStatus?: unknown
    [key: string]: unknown
}

/** Result of uploading a built artifact. */
export interface PluginArtifactUpload {
    resourcePath: string
    integrity?: string
}

/** A version-description section (Feature / Detail / ChangeLog). */
export interface PluginVersionDescriptionInput {
    label: string
    /** Rich-text content as a JSON string. */
    content: string
}

/** Submit a brand-new plugin for review (上架). */
export interface PluginSubmitInput {
    name: string
    pluginKey: string
    version: string
    category: 'APP' | 'FEATURE' | 'CONNECTOR'
    description: string
    resourcePath: string
    integrity?: string
    tags?: string[]
    icon?: string | null
    permissions?: string[]
    versionDescs?: PluginVersionDescriptionInput[]
}

/** Publish a new version of an already-listed plugin (发布). */
export interface PluginVersionInput {
    version: string
    resourcePath: string
    integrity?: string
    versionDescs?: PluginVersionDescriptionInput[]
}

/** Prefill for the host's publish wizard (from the dev project manifest). */
export interface PluginPublisherPrefill {
    name?: string
    pluginKey?: string
    version?: string
    category?: 'APP' | 'FEATURE' | 'CONNECTOR'
    description?: string
    tags?: string[]
    icon?: string | null
    permissions?: string[]
}

/** Options for opening the host-owned publish flow. */
export interface OpenPublisherOptions {
    /** When set, the host opens the publish-a-new-version flow for this plugin. */
    pluginId?: string | number
    /** Prefill for the wizard fields. */
    prefill?: PluginPublisherPrefill
    /** An artifact the caller already built and uploaded. */
    artifact?: { resourcePath: string; integrity?: string }
}

/** Service surface for the plugin catalogue lifecycle. */
export interface PluginMarketplaceService {
    /** The developer's submissions and published plugins. */
    listMine(): Promise<PluginMarketplaceMine[]>
    /** Installed plugins as the catalogue knows them (with version ids). */
    listInstalled(): Promise<PluginMarketplaceInstalled[]>
    /** Upload a built artifact; returns its stored path and integrity. */
    uploadArtifact(input: { fileName: string; data: Blob }): Promise<PluginArtifactUpload>
    /** Submit a new plugin for review. */
    submit(input: PluginSubmitInput): Promise<unknown>
    /** Resubmit a rejected submission. */
    resubmit(id: string | number, input: PluginSubmitInput): Promise<unknown>
    /** Publish a new version of a listed plugin. */
    publishVersion(pluginId: string | number, input: PluginVersionInput): Promise<unknown>
    /** Upgrade an installed plugin to the given catalogue version. */
    upgrade(versionId: string | number): Promise<void>
    /**
     * Ask the host to open its publish flow. The host owns the UI (the same
     * three-step wizard the plugin center uses), so plugins never import it.
     */
    openPublisher(options?: OpenPublisherOptions): void
}
