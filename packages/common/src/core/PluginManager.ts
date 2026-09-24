import { merge } from "lodash";
import { ExtensionWrapper } from "./editor";
import { DockPanelConfig, DockPosition, ResolvedDockPanel } from "./dock";
import { PageTypeConfig, ResolvedPageType } from "./page-type";
import { SiderMenuItemProps } from "./menu";
import { TourConfig } from "./tour";
import { RouteConfig } from "./route";
import { Services } from "./types";
import {
    ServiceRegistry,
    type ServiceRegistryView,
    pluginServiceOwner,
    CORE_SERVICE_OWNER,
} from "./ServiceRegistry";
import { PluginMeta, PluginRegistration } from "./global-namespace";
import {
    getRemotePluginInputName,
    normalizeRemotePluginDescriptor,
    type RemotePluginDescriptor,
    type RemotePluginInput,
} from "./plugin-runtime";
import type { PluginManagementEntry, PluginSource } from "./plugin-management";
import { pluginScriptLoader } from "../utils/import-util";
import { logger } from "../utils/logger";
import { event, PLUGIN_INCOMPATIBLE } from "../event";
import { Editor } from "@tiptap/core";
import {
    agentScopeMatches,
    filterContributionByScope,
    getAgentToolImplementation,
    legacyExtensionToAgentContribution,
    resolveAgentToolNames,
    toAgentWireName,
} from "../ai/plugin-agent";
import type {
    AgentContribution,
    AgentScope,
    AgentToolContext,
    AgentToolDefinition,
    ResolvedAgentCapabilities,
    ResolvedAgentContribution,
    ResolvedAgentScope,
} from "../ai/plugin-agent";

export interface PluginSettingsConfig {
    /**
     * Unique key for the settings panel
     */
    key: string;
    /**
     * Display name for the settings panel
     */
    label: string;
    /**
     * Icon component for the settings panel
     */
    icon?: React.ReactNode;
    /**
     * Settings component to render.
     * Receives an optional `pluginKey` prop for config persistence.
     */
    component: React.ComponentType<{ pluginKey?: string }>;
    /**
     * Description of the settings panel
     */
    description?: string;
}

export interface PluginConfig {
    name: string
    status: string
    routes?: RouteConfig[]
    globalRoutes?: RouteConfig[]
    menus?: SiderMenuItemProps[]
    editorExtension?: ExtensionWrapper[]
    locales?: any
    services?: Services
    /**
     * Plugin settings configuration
     */
    settings?: PluginSettingsConfig
    /**
     * Onboarding/feature tours contributed by this plugin.
     * Aggregated by PluginManager.resolveTours().
     */
    tours?: TourConfig[]
    /**
     * Side-dock panels contributed by this plugin (relation graph, outline, …).
     * Aggregated by PluginManager.resolveDockPanels(); installing/uninstalling
     * the plugin adds/removes its rail icon at runtime.
     */
    dockPanels?: DockPanelConfig[]
    /**
     * Stable page renderers contributed by this plugin.
     * Aggregated by PluginManager.resolvePageTypes().
     */
    pageTypes?: PageTypeConfig[]
    /**
     * Kernel agent contribution — tools, skills, context, actions and named
     * agents this plugin adds to the agent. The first-class, editor-optional
     * contribution point (see ai/plugin-agent/types.ts). Installing this plugin
     * adds these capabilities to the agent; uninstalling removes them.
     */
    agent?: AgentContribution
    /**
     * True when the plugin needs desktop (Electron) capabilities. Surfaced to
     * the marketplace so it can mark the plugin desktop-only and, on the web,
     * refuse to install it.
     */
    desktopOnly?: boolean
}

export class KPlugin<T extends PluginConfig> {

    name: string
    pluginKey: string = ""
    private _routes?: RouteConfig[]
    private _globalRoutes?: RouteConfig[]
    private _editorExtension?: ExtensionWrapper[]
    private _menus?: SiderMenuItemProps[]
    private _locales?: any
    private _services?: Services
    private _settings?: PluginSettingsConfig
    private _tours?: TourConfig[]
    private _dockPanels?: DockPanelConfig[]
    private _pageTypes?: PageTypeConfig[]
    private _agent?: AgentContribution
    private _desktopOnly?: boolean

    constructor(config: T) {
        this.name = config.name
        this._routes = config.routes
        this._globalRoutes = config.globalRoutes
        this._editorExtension = config.editorExtension
        this._menus = config.menus
        this._locales = config.locales
        this._services = config.services
        this._settings = config.settings
        this._tours = config.tours
        this._dockPanels = config.dockPanels
        this._pageTypes = config.pageTypes
        this._agent = config.agent
        this._desktopOnly = config.desktopOnly
    }

    /** Whether this plugin needs desktop (Electron) capabilities. */
    get desktopOnly(): boolean {
        return Boolean(this._desktopOnly)
    }

    get routes(): RouteConfig[] {
        return this._routes || []
    }

    get editorExtensions(): ExtensionWrapper[] {
        return this._editorExtension || []
    }

    get menus(): SiderMenuItemProps[] {
        return this._menus || []
    }

    get locales(): any {
        return this._locales
    }

    get services(): Services | undefined {
        return this._services
    }

    get settings(): PluginSettingsConfig | undefined {
        return this._settings
    }

    get tours(): TourConfig[] {
        return this._tours || []
    }

    get dockPanels(): DockPanelConfig[] {
        return this._dockPanels || []
    }

    get pageTypes(): PageTypeConfig[] {
        return this._pageTypes || []
    }

    /** Kernel agent contribution declared by this plugin. */
    get agent(): AgentContribution | undefined {
        return this._agent
    }

}

export interface PluginManagerOptions {
    /** Maps a plugin's resourcePath to the (public, no-auth) download URL */
    resolveUrl: (resourcePath: string) => string
    /** The plugin API version the host was built with (from @kn/plugin-api) */
    hostApiVersion: string
    /** Application-owned services that plugins cannot replace. */
    coreServices?: Partial<Services>
    /**
     * How long a single plugin script may take to load before the request is
     * aborted and the plugin is reported through `failedPlugins` (ms).
     * Bounds one bad artifact; it never fails initialization.
     * @default 10000
     */
    loadTimeoutMs?: number
    /**
     * Hard budget for the whole remote-plugin loading phase (ms). Plugins that
     * have not settled by then are abandoned and reported through
     * `failedPlugins`, so `init()` always resolves and the host can boot with
     * whatever did load. A non-positive value disables the budget.
     * @default 15000
     */
    bootstrapTimeoutMs?: number
}

export interface PluginApiIncompatibility {
    name: string
    pluginKey?: string
    versionId?: string | number
    version?: string
    apiVersion: string
    hostApiVersion: string
}

export interface PluginInitResult {
    failedPlugins: string[]
    incompatiblePlugins: PluginApiIncompatibility[]
}

export class PluginManager {

    plugins: KPlugin<any>[] = []
    _initialPlugins: KPlugin<any>[] = []
    private _serviceRegistry: ServiceRegistry
    private _serviceRegistryView: ServiceRegistryView
    private _resolveUrl: (resourcePath: string) => string
    private _hostApiVersion: string
    private _loadTimeoutMs: number
    private _bootstrapTimeoutMs: number
    _init: boolean = false

    // Version counter that increments whenever plugins change.
    // Used by React hooks (usePluginState, useEditorExtension) to detect changes
    // and trigger re-renders / editor reconfiguration.
    private _version: number = 0

    // Observable change listeners – a lightweight alternative to emitting events
    // from within the PluginManager. UI code subscribes via onChange().
    private _changeListeners = new Set<() => void>()

    // Cache for resolved plugin data to improve performance
    private _cacheRoutes: RouteConfig[] | null = null
    private _cacheMenus: SiderMenuItemProps[] | null = null
    private _cacheExtensions: ExtensionWrapper[] | null = null
    private _cacheLocales: any | null = null
    private _cacheTours: TourConfig[] | null = null
    private _cacheDockPanels: ResolvedDockPanel[] | null = null
    private _cachePageTypes: ResolvedPageType[] | null = null
    private _cacheAgentContributions: ResolvedAgentContribution[] | null = null
    private _pluginMap: Map<string, KPlugin<any>> = new Map()
    /** Install metadata per active plugin; drives the pluginManagement service. */
    private _pluginMeta = new Map<string, {
        pluginKey: string
        version?: string
        source: PluginSource
        desktopOnly: boolean
    }>()
    private _incompatiblePlugins = new Map<string, PluginApiIncompatibility>()

    // Built-in dock panels contributed by the host itself (e.g. the AI agent
    // panel). Same contract as plugin-contributed panels; they simply cannot be
    // uninstalled. Keyed by panel id, insertion-ordered.
    private _coreDockPanels: Map<string, DockPanelConfig> = new Map()

    constructor(options: PluginManagerOptions, initalPlugins: KPlugin<any>[]) {
        this._resolveUrl = options.resolveUrl
        this._hostApiVersion = options.hostApiVersion
        this._loadTimeoutMs = options.loadTimeoutMs ?? 10_000
        this._bootstrapTimeoutMs = options.bootstrapTimeoutMs ?? 15_000
        this._serviceRegistry = new ServiceRegistry(options.coreServices)
        this._serviceRegistryView = Object.freeze({
            get: <K extends keyof Services>(name: K) => this._serviceRegistry.get(name),
            getOwner: (name: keyof Services) => this._serviceRegistry.getOwner(name),
            has: (name: keyof Services) => this._serviceRegistry.has(name),
            getAll: () => this._serviceRegistry.getAll(),
            subscribe: (listener: (name: string) => void) => this._serviceRegistry.subscribe(listener),
        })
        this._initialPlugins = initalPlugins
        this._buildPluginMap(initalPlugins)
        logger.debug('Initial plugins loaded:', this._initialPlugins);
    }

    /**
     * Get the current plugin version counter.
     * This value changes every time plugins are added, removed, or re-initialized.
     * Use this as a React hook dependency to detect plugin changes.
     */
    get version(): number {
        return this._version
    }

    get incompatiblePlugins(): PluginApiIncompatibility[] {
        return [...this._incompatiblePlugins.values()]
    }

    /**
     * Subscribe to plugin state changes.
     * The listener is called every time the plugin list changes (init, install, uninstall, remove).
     * @returns An unsubscribe function.
     */
    onChange(listener: () => void): () => void {
        this._changeListeners.add(listener)
        return () => { this._changeListeners.delete(listener) }
    }

    private _buildPluginMap(plugins: KPlugin<any>[], source: PluginSource = 'system') {
        plugins.forEach(plugin => {
            this._pluginMap.set(plugin.name, plugin)
            // The remote-install path records metadata (with the version) before
            // this runs, so only label plugins that do not have an entry yet.
            if (!this._pluginMeta.has(plugin.name)) {
                this._pluginMeta.set(plugin.name, {
                    pluginKey: plugin.pluginKey || plugin.name,
                    source,
                    desktopOnly: plugin.desktopOnly,
                })
            }
        })
    }

    private _isInitialPluginKey(pluginKey?: string): boolean {
        return Boolean(pluginKey && this._initialPlugins.some(plugin => plugin.pluginKey === pluginKey))
    }

    /**
     * Invalidate internal derived-data caches and notify listeners.
     */
    private _notifyChange() {
        this._cacheRoutes = null
        this._cacheMenus = null
        this._cacheExtensions = null
        this._cacheLocales = null
        this._cacheTours = null
        this._cacheDockPanels = null
        this._cachePageTypes = null
        this._cacheAgentContributions = null
        this._version++
        this._changeListeners.forEach(fn => fn())
    }

    /**
     * Clear the plugin script cache to ensure plugins are freshly loaded.
     * Call this before re-initializing plugins (after uninstall/update)
     * to avoid serving stale cached versions.
     */
    clearPluginCache() {
        pluginScriptLoader.invalidateAll()
        logger.info('Plugin script cache invalidated')
    }

    /**
     * Clear a specific plugin URL from the script cache.
     */
    clearPluginCacheByUrl(url: string) {
        pluginScriptLoader.invalidate(url)
        logger.info(`Plugin script cache invalidated for URL: ${url}`)
    }

    private _validatePlugin(plugin: { name?: string } | null | undefined): boolean {
        if (!plugin) {
            logger.error('Plugin is null or undefined')
            return false
        }
        if (!plugin.name) {
            logger.error('Plugin must have a name')
            return false
        }
        if (this._pluginMap.has(plugin.name)) {
            logger.warn(`Plugin ${plugin.name} is already installed`)
            return false
        }
        return true
    }

    /**
     * Build the script URL for a remote plugin. Publishing produces a new
     * resourcePath (new file name), so the extra `v` parameter is only a
     * second line of defence against stale HTTP caches.
     */
    private _buildPluginUrl(plugin: RemotePluginDescriptor): string {
        return this._resolveUrl(plugin.resourcePath)
            + '&cache=true'
            + '&v=' + (plugin.versionId ?? plugin.version ?? '')
    }

    private _pluginIdentity(plugin: RemotePluginDescriptor): string {
        return `${plugin.pluginKey}:${plugin.versionId ?? plugin.version ?? 'unknown'}`
    }

    private _clearPluginIncompatibility(plugin: { pluginKey?: string; name: string }): boolean {
        let cleared = false
        for (const [key, issue] of this._incompatiblePlugins) {
            const matches = plugin.pluginKey && issue.pluginKey
                ? plugin.pluginKey === issue.pluginKey
                : Boolean(plugin.name && plugin.name === issue.name)
            if (matches) {
                this._incompatiblePlugins.delete(key)
                cleared = true
            }
        }
        return cleared
    }

    /**
     * Version handshake: a plugin built against a different MAJOR plugin-api
     * version than the host is skipped. Legacy bundles without metadata are
     * allowed through with a warning.
     */
    private _getApiIncompatibility(
        meta: PluginMeta | undefined,
        plugin: RemotePluginDescriptor,
    ): PluginApiIncompatibility | null {
        const name = plugin.name
        const apiVersion = meta?.apiVersion
        if (!apiVersion) {
            logger.warn(`Plugin ${name} has no apiVersion metadata (legacy bundle), loading anyway`)
            return null
        }
        const pluginMajor = apiVersion.split('.')[0]
        const hostMajor = this._hostApiVersion.split('.')[0]
        if (pluginMajor !== hostMajor) {
            logger.warn(`Plugin ${name} is incompatible: built against plugin-api ${apiVersion}, host is ${this._hostApiVersion}. Skipping.`)
            event.emit(PLUGIN_INCOMPATIBLE, { name, apiVersion })
            return {
                name,
                pluginKey: plugin.pluginKey,
                versionId: plugin.versionId,
                version: plugin.version,
                apiVersion,
                hostApiVersion: this._hostApiVersion,
            }
        }
        return null
    }

    /**
     * Extract the KPlugin instance from a load result and sanity-check it
     * (name present, contract getters accessible) before activation.
     */
    private _extractPlugin(registration: PluginRegistration): KPlugin<any> | null {
        const plugin = Object.values(registration.exports)
            .find((value): value is KPlugin<any> => value instanceof KPlugin)
        if (!plugin) {
            logger.error('No KPlugin instance found in plugin exports')
            return null
        }
        try {
            if (!plugin.name) {
                logger.error('Plugin must have a non-empty name')
                return null
            }
            // Contract smoke test: getters must be accessible
            void plugin.routes
            void plugin.editorExtensions
            void plugin.pageTypes
        } catch (error) {
            logger.error('Plugin contract getters are not accessible:', error)
            return null
        }
        return plugin
    }

    /**
     * Wait for `promises` to settle, but never longer than `budgetMs`.
     * Returns `true` when every promise settled inside the budget, `false` when
     * the budget expired first. Rejections are absorbed: stragglers keep running
     * harmlessly and are ignored by the caller.
     */
    private async _settleWithin(promises: Promise<unknown>[], budgetMs: number): Promise<boolean> {
        const all = Promise.allSettled(promises).then(() => true)
        if (!Number.isFinite(budgetMs) || budgetMs <= 0) return all

        let timer: ReturnType<typeof setTimeout> | undefined
        try {
            return await Promise.race([
                all,
                new Promise<boolean>(resolve => {
                    timer = setTimeout(() => resolve(false), budgetMs)
                }),
            ])
        } finally {
            if (timer !== undefined) clearTimeout(timer)
        }
    }

    public async init(remotePlugins: readonly RemotePluginInput[]): Promise<PluginInitResult> {
        logger.info('Initializing remote plugins:', remotePlugins);
        logger.info('Current init status:', this._init);

        // Determine if we are re-initializing (already initialized before)
        const isReinit = this._init

        try {
            // Reset state if reinitializing to ensure clean state
            if (isReinit) {
                logger.info('PluginManager already initialized, resetting state for reinitialization');
                this._init = false;
                // Keep initial plugins but clear remote plugins
                this.plugins = [...this._initialPlugins];
                // Rebuild plugin map with only initial plugins
                this._pluginMap.clear();
                this._pluginMeta.clear();
                this._buildPluginMap(this._initialPlugins);
                this._rebuildServices();

                // Invalidate script cache so remote plugins are freshly loaded
                this.clearPluginCache()
            }

            if (!remotePlugins || remotePlugins.length === 0) {
                this.plugins = ([...(this._initialPlugins || [])])
                const conflicts = this._rebuildServices()
                if (conflicts.size > 0) {
                    this.plugins = this.plugins.filter(plugin => !conflicts.has(plugin.name))
                    this._pluginMap.clear()
                    this._pluginMeta.clear()
                    this._buildPluginMap(this.plugins)
                    this._rebuildServices()
                }
                this._incompatiblePlugins = new Map()
                this._notifyChange()
                this._init = true
                logger.info('Plugins loaded:', this.plugins.length);
                logger.debug('Services loaded:', this._serviceRegistry.getAll());
                return { failedPlugins: [...conflicts], incompatiblePlugins: [] }
            }

            const failedPlugins = new Set<string>()
            const normalizedRemotePlugins = remotePlugins.flatMap(input => {
                const plugin = normalizeRemotePluginDescriptor(input)
                if (plugin) return [plugin]
                const name = getRemotePluginInputName(input)
                failedPlugins.add(name)
                logger.warn(`Skipping remote plugin ${name}: missing name or resourcePath`)
                return []
            })
            const loadableRemotePlugins = normalizedRemotePlugins.filter(plugin => {
                if (!this._isInitialPluginKey(plugin.pluginKey)) return true
                logger.info(`Skipping remote plugin ${plugin.pluginKey}: already provided by the host`)
                return false
            })

            // Plugin boot is bounded and failure-isolated: a script that errors,
            // never answers, or exceeds its budget is reported through
            // `failedPlugins` and skipped. Initialization still resolves so the
            // host can start without it.
            const loadOutcomes = new Map<number, { registration: PluginRegistration } | { error: unknown }>()
            const loadPromises = loadableRemotePlugins.map((plugin, index) => {
                const path = this._buildPluginUrl(plugin)
                return pluginScriptLoader.load(path, plugin.pluginKey, plugin.name, {
                    integrity: plugin.integrity || undefined,
                    timeout: this._loadTimeoutMs,
                }).then(
                    registration => {
                        loadOutcomes.set(index, { registration })
                    },
                    error => {
                        logger.error(`Failed to load plugin ${plugin.name}:`, error)
                        loadOutcomes.set(index, { error })
                    },
                )
            })
            await this._settleWithin(loadPromises, this._bootstrapTimeoutMs)
            loadableRemotePlugins.forEach((plugin, index) => {
                const outcome = loadOutcomes.get(index)
                // Script/registration failures were already logged where they
                // were captured; they are reported, not fatal.
                if (outcome) {
                    if ('error' in outcome) failedPlugins.add(plugin.name || plugin.pluginKey || 'unknown')
                    return
                }
                const name = plugin.name || plugin.pluginKey || 'unknown'
                failedPlugins.add(name)
                logger.warn(
                    `Plugin ${name} did not finish loading within ${this._bootstrapTimeoutMs}ms; ` +
                    'skipping it so the workspace can start'
                )
            })

            const incompatiblePlugins = new Map<string, PluginApiIncompatibility>()
            const successfulPlugins: KPlugin<any>[] = []
            const activatedPluginKeys = new Set<string>()
            const seenPluginNames = new Set(this._initialPlugins.map(plugin => plugin.name))
            loadableRemotePlugins.forEach((plugin, index) => {
                const outcome = loadOutcomes.get(index)
                if (!outcome || !('registration' in outcome)) return
                const { registration } = outcome
                const incompatibility = this._getApiIncompatibility(registration.meta, plugin)
                if (incompatibility) {
                    incompatiblePlugins.set(this._pluginIdentity(plugin), incompatibility)
                    return
                }
                const instance = this._extractPlugin(registration)
                if (!instance) {
                    logger.warn(`Invalid plugin ${plugin.name} detected, skipping`)
                    failedPlugins.add(plugin.name || plugin.pluginKey)
                    return
                }
                if (seenPluginNames.has(instance.name)) {
                    logger.info(`Skipping plugin ${instance.name}: a plugin with the same runtime name is already active`)
                    return
                }
                seenPluginNames.add(instance.name)
                successfulPlugins.push(instance)
                this._pluginMeta.set(instance.name, {
                    pluginKey: plugin.pluginKey,
                    version: plugin.version,
                    source: 'installed',
                    desktopOnly: instance.desktopOnly || plugin.desktopOnly === true,
                })
                if (plugin.pluginKey) activatedPluginKeys.add(plugin.pluginKey)
            })

            for (const [key, issue] of incompatiblePlugins) {
                if (issue.pluginKey && activatedPluginKeys.has(issue.pluginKey)) {
                    incompatiblePlugins.delete(key)
                }
            }

            this.plugins = [...this._initialPlugins, ...successfulPlugins]
            this._buildPluginMap(successfulPlugins)

            const serviceConflicts = this._rebuildServices()
            if (serviceConflicts.size > 0) {
                const initialNames = new Set(this._initialPlugins.map(plugin => plugin.name))
                const rejectedRemoteNames = [...serviceConflicts].filter(name => !initialNames.has(name))
                if (rejectedRemoteNames.length > 0) {
                    const rejected = new Set(rejectedRemoteNames)
                    this.plugins = this.plugins.filter(plugin => !rejected.has(plugin.name))
                    rejectedRemoteNames.forEach(name => {
                        this._pluginMap.delete(name)
                        this._pluginMeta.delete(name)
                        failedPlugins.add(name)
                    })
                    this._rebuildServices()
                }
            }

            this._incompatiblePlugins = incompatiblePlugins
            this._notifyChange()
            this._init = true

            logger.info(`All plugins loaded: ${this.plugins.length} (${successfulPlugins.length} remote)`);
            logger.debug('Services loaded:', this._serviceRegistry.getAll());

            if (failedPlugins.size > 0) {
                logger.warn(`${failedPlugins.size} plugins failed to load or activate`)
            }
            if (incompatiblePlugins.size > 0) {
                logger.warn(`${incompatiblePlugins.size} plugins skipped because their API versions are incompatible`)
            }
            return {
                failedPlugins: [...failedPlugins],
                incompatiblePlugins: [...incompatiblePlugins.values()],
            }
        } catch (error) {
            logger.error('Fatal error during plugin initialization:', error)
            this.plugins = [...this._initialPlugins]
            this._pluginMap.clear()
            this._pluginMeta.clear()
            this._buildPluginMap(this._initialPlugins)
            this._rebuildServices()
            this._incompatiblePlugins = new Map()
            this._notifyChange()
            this._init = true
            throw error
        }
    }

    private _rebuildServices(): Set<string> {
        const conflicts = this._serviceRegistry.replacePluginServices(
            this.plugins
                .filter(plugin => plugin.services)
                .map(plugin => ({
                    owner: pluginServiceOwner(plugin.name),
                    services: plugin.services!,
                }))
        )
        conflicts.forEach(name => {
            logger.error(`Plugin ${name} service registration rejected: a service key is already owned`)
        })
        return conflicts
    }

    uninstallPlugin(key: string) {
        logger.info('pluginStore ', this._pluginMap);
        const plugin = this._pluginMap.get(key)
        const clearedIncompatibility = this._clearPluginIncompatibility({ name: key })
        if (!plugin && !clearedIncompatibility) {
            logger.warn(`Plugin ${key} not found, cannot uninstall`)
            return false
        }

        if (plugin) {
            this.plugins = this.plugins.filter(it => it.name !== key)
            this._pluginMap.delete(key)
            this._pluginMeta.delete(key)
        }

        // Invalidate the script cache so that if the plugin is re-installed,
        // it will be freshly loaded instead of using the stale cached version
        this.clearPluginCache()

        // Atomically rebuild plugin-owned services from the remaining plugins.
        if (plugin) this._rebuildServices()

        logger.info('Plugin uninstalled:', key);
        // Notify listeners (does NOT emit global events – callers do that)
        this._notifyChange()
        return true
    }

    async installPlugin(input: RemotePluginInput, callBack?: () => void) {
        const plugin = normalizeRemotePluginDescriptor(input)
        if (!plugin) {
            logger.error(`Plugin ${getRemotePluginInputName(input)} is missing required runtime metadata`)
            return false
        }

        try {
            if (this._isInitialPluginKey(plugin.pluginKey)) {
                logger.warn(`Plugin ${plugin.pluginKey} is provided by the host and cannot be installed remotely`)
                return false
            }

            if (!this._validatePlugin(plugin)) {
                logger.error('Plugin validation failed')
                return false
            }

            // Use bustCache to ensure we get the latest version of the plugin script
            const path = this._buildPluginUrl(plugin)
            const registration = await pluginScriptLoader.load(path, plugin.pluginKey, plugin.name, {
                bustCache: true,
                integrity: plugin.integrity || undefined,
                timeout: this._loadTimeoutMs,
            })

            if (!registration) {
                logger.error(`Failed to load plugin instance for ${plugin.name}`)
                return false
            }

            return this._activateRegistration(registration, plugin, callBack)
        } catch (error) {
            logger.error(`Error installing plugin ${plugin?.name}:`, error)
            return false
        }
    }

    /**
     * Install a plugin from JavaScript source that is already in hand, instead
     * of from a URL.
     *
     * The plugin studio builds a project's bundle in a child process and holds
     * the code in memory; it should not have to publish that bundle to an
     * origin first. The source is loaded through an object URL, so it goes
     * through exactly the same activation path as a remote artifact — API
     * version handshake, `KPlugin` extraction, service registration.
     *
     * Pass `replace: true` for hot reload: any active plugin with the same name
     * is uninstalled first, and a stale object URL is never reused.
     */
    async installPluginFromSource(
        options: {
            /** JavaScript previously produced by the dev bundler. */
            code: string
            /** Registry key the bundle registered itself under. */
            pluginKey: string
            /** Human-readable name, used for logs and the incompatible list. */
            name: string
            version?: string
            /** Uninstall an active plugin with the same runtime name first. */
            replace?: boolean
            /** Label for logs; defaults to the plugin name. */
            sourceLabel?: string
        },
        callBack?: () => void,
    ): Promise<boolean> {
        const { code, pluginKey, name } = options
        if (!code || !pluginKey || !name) {
            logger.error('installPluginFromSource requires code, pluginKey and name')
            return false
        }

        const plugin: RemotePluginDescriptor = {
            pluginKey,
            name,
            version: options.version,
            resourcePath: `inline://${options.sourceLabel ?? name}`,
        }

        if (this._isInitialPluginKey(pluginKey)) {
            logger.warn(`Plugin ${pluginKey} is provided by the host and cannot be installed from source`)
            return false
        }

        if (options.replace) {
            const active = this._pluginMap.get(name)
            if (active) {
                // Safe: the reload is about to install a fresh instance.
                this.uninstallPlugin(name)
            }
        }

        if (!this._validatePlugin(plugin)) {
            logger.error('Plugin validation failed')
            return false
        }

        let objectUrl: string | undefined
        try {
            objectUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
            const registration = await pluginScriptLoader.load(objectUrl, pluginKey, name, {
                bustCache: true,
                timeout: this._loadTimeoutMs,
            })
            if (!registration) {
                logger.error(`Failed to load plugin instance for ${name}`)
                return false
            }
            return this._activateRegistration(registration, plugin, callBack, 'dev')
        } catch (error) {
            logger.error(`Error installing plugin from source ${name}:`, error)
            return false
        } finally {
            // The registration is cached in memory; the URL itself is not needed.
            if (objectUrl) URL.revokeObjectURL(objectUrl)
        }
    }

    /**
     * Shared tail of every install path: version handshake, `KPlugin`
     * extraction, service registration and change notification.
     */
    private _activateRegistration(
        registration: PluginRegistration,
        plugin: RemotePluginDescriptor,
        callBack?: () => void,
        source: PluginSource = 'installed',
    ): boolean {
        const incompatibility = this._getApiIncompatibility(registration.meta, plugin)
        if (incompatibility) {
            this._clearPluginIncompatibility(plugin)
            this._incompatiblePlugins.set(this._pluginIdentity(plugin), incompatibility)
            this._notifyChange()
            return false
        }

        const loadedPlugin = this._extractPlugin(registration)
        if (!loadedPlugin) {
            logger.error(`Invalid plugin structure for ${plugin.name}`)
            return false
        }
        if (!this._validatePlugin(loadedPlugin)) {
            logger.error(`Plugin ${loadedPlugin.name} conflicts with an active runtime plugin`)
            return false
        }

        if (loadedPlugin.services) {
            this._serviceRegistry.registerAll(
                loadedPlugin.services,
                pluginServiceOwner(loadedPlugin.name)
            )
        }

        this.plugins = [...this.plugins, loadedPlugin]
        this._pluginMap.set(loadedPlugin.name, loadedPlugin)
        this._pluginMeta.set(loadedPlugin.name, {
            pluginKey: plugin.pluginKey,
            version: plugin.version,
            source,
            desktopOnly: loadedPlugin.desktopOnly || plugin.desktopOnly === true,
        })
        this._clearPluginIncompatibility(plugin)

        logger.info(`Plugin ${loadedPlugin.name} installed successfully`)
        // Notify listeners (does NOT emit global events – callers do that)
        this._notifyChange()
        callBack && callBack()
        return true
    }

    remove(name: string) {
        const plugin = this._pluginMap.get(name)
        const existed = Boolean(plugin)
        if (plugin) {
            this.plugins = this.plugins.filter(it => it.name !== name)
            this._pluginMap.delete(name)
            this._pluginMeta.delete(name)
            this._rebuildServices()
            logger.debug(`Plugin ${name} removed from manager`)
            this._notifyChange()
        }
        return existed
    }

    getPlugin(name: string): KPlugin<any> | undefined {
        return this._pluginMap.get(name)
    }

    hasPlugin(name: string): boolean {
        return this._pluginMap.has(name)
    }

    getAllPluginNames(): string[] {
        return Array.from(this._pluginMap.keys())
    }

    /**
     * Active plugins with their install metadata. Backs the `pluginManagement`
     * core service so management UIs (and the plugin studio) do not need to
     * reach into the manager.
     */
    getPluginEntries(): PluginManagementEntry[] {
        return Array.from(this._pluginMap.values()).map(plugin => {
            const meta = this._pluginMeta.get(plugin.name)
            return {
                name: plugin.name,
                pluginKey: meta?.pluginKey ?? plugin.pluginKey ?? plugin.name,
                version: meta?.version,
                source: meta?.source ?? 'system',
                desktopOnly: meta?.desktopOnly ?? plugin.desktopOnly,
            }
        })
    }

    getPluginEntry(name: string): PluginManagementEntry | undefined {
        return this.getPluginEntries().find(entry => entry.name === name)
    }

    /** Host-owned (system) plugins are part of the app and cannot be removed. */
    isPluginRemovable(name: string): boolean {
        return this._pluginMap.has(name) && this._pluginMeta.get(name)?.source !== 'system'
    }

    get initStatus() {
        return this._init
    }

    // ---- Resolve methods (correctly spelled) ----

    resolveRoutes(): RouteConfig[] {
        if (this._cacheRoutes) {
            return this._cacheRoutes
        }

        const routes: RouteConfig[] = []
        for (const plugin of this.plugins) {
            if (plugin.routes && plugin.routes.length > 0) {
                routes.push(...plugin.routes)
            }
        }

        this._cacheRoutes = routes
        return routes
    }

    // ---- Kernel agent capabilities (M0) ----
    // Plugins grow the agent through `PluginConfig.agent` (see
    // ai/plugin-agent/types.ts). Legacy `editorExtension[].tools/skills` are
    // adapted behind the same path so existing plugins keep working unchanged.

    /**
     * Build the context handed to plugin agent tools. Scope is derived from
     * whether an editor is published: a run with an editor is page-scoped,
     * otherwise workspace-scoped. Editor-free tools simply ignore `editor`.
     */
    private buildAgentToolContext(editor: Editor | null, scope: ResolvedAgentScope): AgentToolContext {
        return {
            scope,
            editor: editor ?? undefined,
            resolveService: (name: string) => this._serviceRegistryView.get(name as keyof Services),
        }
    }

    private agentPluginKey(plugin: KPlugin<any>): string {
        return this._pluginMeta.get(plugin.name)?.pluginKey || plugin.pluginKey || plugin.name
    }

    private agentWireNameFor(pluginKey: string, tool: AgentToolDefinition): string {
        return tool.namespace === false ? tool.name : toAgentWireName(pluginKey, tool.name)
    }

    /**
     * Per-plugin agent contributions with provenance. Explicit `agent` blocks
     * are merged with adapted legacy extension tools/skills.
     */
    resolveAgentContributions(): ResolvedAgentContribution[] {
        if (this._cacheAgentContributions) {
            return this._cacheAgentContributions
        }

        const resolved: ResolvedAgentContribution[] = []
        for (const plugin of this.plugins) {
            const explicit = plugin.agent
            const tools: AgentToolDefinition[] = [...(explicit?.tools ?? [])]
            const skills: NonNullable<AgentContribution['skills']> = [...(explicit?.skills ?? [])]

            for (const ext of plugin.editorExtensions) {
                const adapted = legacyExtensionToAgentContribution(ext)
                if (adapted.tools) tools.push(...adapted.tools)
                if (adapted.skills) skills.push(...adapted.skills)
            }

            resolved.push({
                pluginName: plugin.name,
                pluginKey: this.agentPluginKey(plugin),
                desktopOnly: plugin.desktopOnly,
                contribution: {
                    tools,
                    skills,
                    include: explicit?.include,
                    context: explicit?.context,
                    actions: explicit?.actions,
                    agents: explicit?.agents,
                    toolRenderers: explicit?.toolRenderers,
                    artifactRenderers: explicit?.artifactRenderers,
                },
            })
        }

        this._cacheAgentContributions = resolved
        return resolved
    }

    /**
     * Flatten every plugin contribution into model-facing capability sets:
     * tool names are namespaced and `include` references are resolved against
     * the core implementation registry. With `runScope`, only declarations
     * covering that scope are returned — page tools never reach a workspace run.
     */
    resolveAgentCapabilities(runScope?: ResolvedAgentScope): ResolvedAgentCapabilities {
        const capabilities: ResolvedAgentCapabilities = {
            tools: [], skills: [], context: [], actions: [], agents: [],
            toolRenderers: [], artifactRenderers: [],
        }

        for (const entry of this.resolveAgentContributions()) {
            const projected = runScope
                ? filterContributionByScope(entry.contribution, runScope)
                : entry.contribution
            const localToWire = new Map<string, string>()

            const pushTool = (
                def: AgentToolDefinition,
                scope: AgentScope | AgentScope[] | undefined,
                wireName: string,
            ) => {
                capabilities.tools.push({
                    ...def,
                    scope,
                    wireName,
                    pluginName: entry.pluginName,
                    pluginKey: entry.pluginKey,
                    desktopOnly: entry.desktopOnly,
                })
            }

            for (const tool of projected.tools ?? []) {
                if (!tool || !tool.name) {
                    logger.warn('Invalid agent tool detected, skipping')
                    continue
                }
                if (runScope && !agentScopeMatches(tool.scope, runScope)) continue
                const wireName = this.agentWireNameFor(entry.pluginKey, tool)
                localToWire.set(tool.name, wireName)
                pushTool(tool, tool.scope, wireName)
            }

            for (const raw of projected.include ?? []) {
                const ref = typeof raw === 'string' ? { name: raw } : raw
                const impl = getAgentToolImplementation(ref.name)
                if (!impl) {
                    logger.warn(`Agent tool include "${ref.name}" is not registered by the host`)
                    continue
                }
                const scope = ref.scope ?? impl.scope
                if (runScope && !agentScopeMatches(scope, runScope)) continue
                const wireName = toAgentWireName(entry.pluginKey, impl.name)
                localToWire.set(impl.name, wireName)
                pushTool(
                    {
                        name: impl.name,
                        description: impl.description,
                        inputSchema: impl.inputSchema,
                        readOnly: impl.readOnly,
                        scope,
                        artifactFromResult: impl.artifactFromResult,
                        create: impl.create,
                    },
                    scope,
                    wireName,
                )
            }

            const mapNames = (names?: string[]): string[] | undefined =>
                resolveAgentToolNames(names, localToWire)

            for (const skill of projected.skills ?? []) {
                if (!skill || !skill.name) continue
                capabilities.skills.push({
                    ...skill,
                    requiredTools: mapNames(skill.requiredTools) ?? [],
                    optionalTools: mapNames(skill.optionalTools),
                    source: 'plugin',
                    pluginName: entry.pluginName,
                    pluginKey: entry.pluginKey,
                })
            }
            for (const provider of projected.context ?? []) {
                if (runScope && !agentScopeMatches(provider.scope, runScope)) continue
                capabilities.context.push({ ...provider, pluginName: entry.pluginName, pluginKey: entry.pluginKey })
            }
            for (const action of projected.actions ?? []) {
                if (runScope && !agentScopeMatches(action.scope, runScope)) continue
                capabilities.actions.push({
                    ...action, tools: mapNames(action.tools),
                    pluginName: entry.pluginName, pluginKey: entry.pluginKey,
                })
            }
            // Plugin agents (hybrid delegation): the kernel only ever sees the
            // directory entry; the tools are resolved to wire names so a
            // delegated child run can be restricted to exactly them.
            for (const agent of projected.agents ?? []) {
                if (!agent || !agent.id || !agent.name) continue
                if (runScope && !agentScopeMatches(agent.scope, runScope)) continue
                const toolNames: string[] = []
                for (const tool of agent.tools ?? []) {
                    if (!tool || !tool.name) continue
                    const wireName = this.agentWireNameFor(entry.pluginKey, tool)
                    localToWire.set(tool.name, wireName)
                    toolNames.push(wireName)
                }
                for (const raw of agent.include ?? []) {
                    const ref = typeof raw === 'string' ? { name: raw } : raw
                    const impl = getAgentToolImplementation(ref.name)
                    if (!impl) continue
                    const wireName = toAgentWireName(entry.pluginKey, impl.name)
                    localToWire.set(impl.name, wireName)
                    toolNames.push(wireName)
                }
                capabilities.agents.push({
                    ...agent,
                    // Namespaced like tools: two plugins may both declare
                    // `page-ops`, and the model must be able to tell them apart.
                    id: toAgentWireName(entry.pluginKey, agent.id),
                    toolNames,
                    pluginName: entry.pluginName,
                    pluginKey: entry.pluginKey,
                })
            }

            // Conversation cards / sheet previews. The tool key is resolved
            // through the same local→wire table as skills, so a plugin can name
            // its own tools by their local name.
            for (const renderer of projected.toolRenderers ?? []) {
                if (!renderer || !renderer.tool || !renderer.render) continue
                capabilities.toolRenderers.push({
                    ...renderer,
                    tool: localToWire.get(renderer.tool) ?? renderer.tool,
                    pluginName: entry.pluginName,
                    pluginKey: entry.pluginKey,
                })
            }
            for (const renderer of projected.artifactRenderers ?? []) {
                if (!renderer || !renderer.kind || !renderer.render) continue
                capabilities.artifactRenderers.push({
                    kind: renderer.kind,
                    render: renderer.render,
                    pluginName: entry.pluginName,
                    pluginKey: entry.pluginKey,
                })
            }
        }

        return capabilities
    }

    /**
     * Instantiate every plugin's agent tools for `editor`, grouped by plugin.
     * The single resolution path shared by {@link resolveTools} and the
     * capability provider, so a tool can never be advertised in one place and
     * missing in the other.
     */
    resolvePluginToolGroups(editor: Editor | null): Array<{ pluginName: string; tools: Record<string, any> }> {
        const scope: ResolvedAgentScope = editor ? 'page' : 'workspace'
        const ctx = this.buildAgentToolContext(editor, scope)
        const groups: Array<{ pluginName: string; tools: Record<string, any> }> = []

        for (const entry of this.resolveAgentContributions()) {
            const projected = filterContributionByScope(entry.contribution, scope)
            const record: Record<string, any> = {}

            const instantiate = (
                wireName: string,
                create: (ctx: AgentToolContext) => unknown,
                def: { description: string; inputSchema: any; readOnly?: boolean },
            ) => {
                try {
                    const execute = create(ctx)
                    if (typeof execute !== 'function') return
                    if (record[wireName]) logger.warn(`Tool ${wireName} already exists, overwriting`)
                    record[wireName] = {
                        description: def.description,
                        inputSchema: def.inputSchema,
                        readOnly: def.readOnly,
                        execute,
                    }
                } catch (error) {
                    // A factory that needs a live editor must not take the whole
                    // catalog down with it: skip that tool and keep the rest.
                    logger.warn(`Tool ${wireName} could not be instantiated`, error)
                }
            }

            for (const tool of projected.tools ?? []) {
                if (!tool || !tool.name) continue
                instantiate(this.agentWireNameFor(entry.pluginKey, tool), tool.create, tool)
            }

            for (const raw of projected.include ?? []) {
                const ref = typeof raw === 'string' ? { name: raw } : raw
                const impl = getAgentToolImplementation(ref.name)
                if (!impl) {
                    logger.warn(`Agent tool include "${ref.name}" is not registered by the host`)
                    continue
                }
                if (!agentScopeMatches(ref.scope ?? impl.scope, scope)) continue
                instantiate(toAgentWireName(entry.pluginKey, impl.name), impl.create, impl)
            }

            // Plugin-agent tools exist for their CHILD run: instantiate them so
            // the client can execute a delegated call. filterContributionByScope
            // already gated each agent by its own scope, so a page-scoped agent's
            // tools never appear in a run without an editor.
            for (const agent of projected.agents ?? []) {
                for (const tool of agent.tools ?? []) {
                    if (!tool || !tool.name) continue
                    instantiate(this.agentWireNameFor(entry.pluginKey, tool), tool.create, tool)
                }
                for (const raw of agent.include ?? []) {
                    const ref = typeof raw === 'string' ? { name: raw } : raw
                    const impl = getAgentToolImplementation(ref.name)
                    if (!impl) continue
                    if (!agentScopeMatches(ref.scope ?? impl.scope, scope)) continue
                    instantiate(toAgentWireName(entry.pluginKey, impl.name), impl.create, impl)
                }
            }

            if (Object.keys(record).length > 0) {
                groups.push({ pluginName: entry.pluginName, tools: record })
            }
        }

        return groups
    }

    /**
     * Flat name → tool map, without provenance.
     *
     * @deprecated Prefer {@link resolvePluginToolGroups}, which keeps the
     * per-plugin grouping the capability provider needs to register metadata.
     * Kept only as a convenience view for callers that just want a flat map.
     */
    resolveTools(editor: Editor | null) {
        const res: Record<string, any> = {}
        for (const group of this.resolvePluginToolGroups(editor)) {
            Object.assign(res, group.tools)
        }
        logger.debug('Total resolved tools:', Object.keys(res).length)
        return res
    }

    resolveLocales(): any {
        if (this._cacheLocales) {
            return this._cacheLocales
        }

        let locales: any = {}
        for (const plugin of this.plugins) {
            if (plugin.locales) {
                locales = merge(locales, plugin.locales)
            }
        }

        this._cacheLocales = locales
        return locales
    }

    resolveEditorExtensions(): ExtensionWrapper[] {
        if (this._cacheExtensions) {
            return this._cacheExtensions
        }

        const editorExtensions: ExtensionWrapper[] = []
        for (const plugin of this.plugins) {
            if (plugin.editorExtensions && plugin.editorExtensions.length > 0) {
                editorExtensions.push(...plugin.editorExtensions)
            }
        }

        this._cacheExtensions = editorExtensions
        return editorExtensions
    }

    resolveMenus(): SiderMenuItemProps[] {
        if (this._cacheMenus) {
            return this._cacheMenus
        }

        const menus: SiderMenuItemProps[] = []
        for (const plugin of this.plugins) {
            if (plugin.menus && plugin.menus.length > 0) {
                menus.push(...plugin.menus)
            }
        }

        this._cacheMenus = menus
        return menus
    }

    /**
     * Resolve all plugin settings configurations
     * Returns an array of settings configs with plugin metadata
     */
    resolvePluginSettings(): Array<PluginSettingsConfig & { pluginName: string }> {
        const settings: Array<PluginSettingsConfig & { pluginName: string }> = []
        for (const plugin of this.plugins) {
            if (plugin.settings) {
                settings.push({
                    ...plugin.settings,
                    pluginName: plugin.name
                })
            }
        }
        return settings
    }

    /**
     * Resolve all tours contributed by plugins.
     * De-duplicates by tour id (first occurrence wins).
     */
    resolveTours(): TourConfig[] {
        if (this._cacheTours) {
            return this._cacheTours
        }

        const tours: TourConfig[] = []
        const seen = new Set<string>()
        for (const plugin of this.plugins) {
            for (const tour of plugin.tours) {
                if (!tour || !tour.id) {
                    logger.warn('Invalid tour detected, skipping')
                    continue
                }
                if (seen.has(tour.id)) {
                    logger.warn(`Tour ${tour.id} already registered, skipping duplicate`)
                    continue
                }
                seen.add(tour.id)
                tours.push(tour)
            }
        }

        this._cacheTours = tours
        return tours
    }

    /**
     * Register a built-in dock panel contributed by the host.
     * Mirrors registerCoreService: same contract as plugin panels, but the host
     * owns the lifecycle. Re-registering the same id replaces the panel.
     */
    registerCoreDockPanel(panel: DockPanelConfig): void {
        if (!panel?.id) {
            logger.warn('Core dock panel must have an id, skipping')
            return
        }
        this._coreDockPanels.set(panel.id, panel)
        logger.debug(`Core dock panel registered: ${panel.id}`)
        this._notifyChange()
    }

    /**
     * Remove a previously registered built-in dock panel.
     */
    unregisterCoreDockPanel(id: string): void {
        if (!this._coreDockPanels.delete(id)) return
        logger.debug(`Core dock panel unregistered: ${id}`)
        this._notifyChange()
    }

    /**
     * Resolve all dock panels (host built-ins first, then plugin contributions),
     * de-duplicated by id and sorted by `order` ascending.
     *
     * @param position Only return panels for this dock. Omit for all positions.
     */
    resolveDockPanels(position?: DockPosition): ResolvedDockPanel[] {
        if (!this._cacheDockPanels) {
            const panels: ResolvedDockPanel[] = []
            const seen = new Set<string>()

            const collect = (
                panel: DockPanelConfig,
                source: 'plugin' | 'core',
                owner: string,
                pluginKey: string,
            ) => {
                if (!panel || !panel.id || !panel.component) {
                    logger.warn(`Invalid dock panel from ${owner}, skipping`)
                    return
                }
                if (seen.has(panel.id)) {
                    logger.warn(`Dock panel ${panel.id} already registered, skipping duplicate from ${owner}`)
                    return
                }
                seen.add(panel.id)
                panels.push({ ...panel, source, owner, pluginKey })
            }

            this._coreDockPanels.forEach(panel => collect(panel, 'core', 'core', 'core'))
            for (const plugin of this.plugins) {
                // The runtime name is what the host renders under; the registry
                // key is what the plugin's injected CSS is scoped to.
                const pluginKey = this._pluginMeta.get(plugin.name)?.pluginKey || plugin.pluginKey || plugin.name
                for (const panel of plugin.dockPanels) {
                    collect(panel, 'plugin', plugin.name, pluginKey)
                }
            }

            panels.sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
            this._cacheDockPanels = panels
        }

        if (!position) return this._cacheDockPanels
        return this._cacheDockPanels.filter(p => (p.position ?? 'right') === position)
    }

    /**
     * Resolve all page types contributed by active plugins. Contributions must
     * use a namespaced id (`namespace:name`); malformed entries and later
     * duplicates are skipped. Equal-order entries retain contribution order.
     */
    resolvePageTypes(): ResolvedPageType[] {
        if (!this._cachePageTypes) {
            const pageTypes: Array<{ value: ResolvedPageType; index: number }> = []
            const seen = new Set<string>()
            let index = 0

            const isNamespacedId = (id: unknown): id is string =>
                typeof id === 'string' && /^[^\s:]+:[^\s:]+$/.test(id)
            const isValidRenderer = (renderer: unknown): renderer is PageTypeConfig['renderer'] => {
                if (!renderer || typeof renderer !== 'object') return false
                const candidate = renderer as Record<string, unknown>
                if (candidate.type === 'component') return typeof candidate.component === 'function'
                if (candidate.type === 'editor-component') return typeof candidate.createInitialDocument === 'function'
                return false
            }

            for (const plugin of this.plugins) {
                for (const pageType of plugin.pageTypes) {
                    if (!pageType
                        || !isNamespacedId(pageType.id)
                        || typeof pageType.label !== 'string'
                        || !pageType.label.trim()
                        || !isValidRenderer(pageType.renderer)) {
                        logger.warn(`Invalid page type from ${plugin.name}, skipping`)
                        continue
                    }
                    if (seen.has(pageType.id)) {
                        logger.warn(`Page type ${pageType.id} already registered, skipping duplicate from ${plugin.name}`)
                        continue
                    }
                    seen.add(pageType.id)
                    pageTypes.push({
                        value: { ...pageType, source: 'plugin', owner: plugin.name },
                        index: index++,
                    })
                }
            }

            pageTypes.sort((a, b) => {
                const aOrder = Number.isFinite(a.value.order) ? a.value.order! : 100
                const bOrder = Number.isFinite(b.value.order) ? b.value.order! : 100
                return aOrder - bOrder || a.index - b.index
            })
            this._cachePageTypes = pageTypes.map(({ value }) => value)
        }

        return this._cachePageTypes
    }

    /** Resolve one page type by its stable namespaced id. */
    resolvePageType(id: string): ResolvedPageType | undefined {
        return this.resolvePageTypes().find(pageType => pageType.id === id)
    }

    /**
     * Resolve all skills from plugin editor extensions
     * Returns an array of skill definitions with plugin metadata
     */
    resolveSkills(): Array<{
        name: string
        description: string
        requiredTools: string[]
        optionalTools?: string[]
        systemPromptFragment?: string
        tags?: string[]
        source: 'plugin'
        pluginName: string
    }> {
        const skills: Array<{
            name: string
            description: string
            requiredTools: string[]
            optionalTools?: string[]
            systemPromptFragment?: string
            tags?: string[]
            source: 'plugin'
            pluginName: string
        }> = []

        const extensions = this.resolveEditorExtensions()

        for (const ext of extensions) {
            // Process explicitly defined skills
            if (ext.skills) {
                const extSkills = Array.isArray(ext.skills) ? ext.skills : [ext.skills]

                for (const skill of extSkills) {
                    if (!skill || !skill.name) {
                        logger.warn('Invalid skill detected, skipping')
                        continue
                    }

                    skills.push({
                        ...skill,
                        source: 'plugin',
                        pluginName: ext.name
                    })
                    logger.debug('Resolved skill:', skill.name, 'from plugin:', ext.name)
                }
            }

            // Auto-generate a default skill for extensions that define tools
            // but no skills — ensures no plugin is left behind when tools[] is
            // removed from the wire payload (skills-only transmission).
            if (!ext.skills && ext.tools) {
                const extTools = Array.isArray(ext.tools) ? ext.tools : [ext.tools]
                const toolNames = extTools
                    .filter((t: any) => t && t.name)
                    .map((t: any) => t.name)

                if (toolNames.length > 0) {
                    const extName = ext.name || 'unknown'
                    skills.push({
                        name: `${extName}-default`,
                        description: `Default skill for ${extName} plugin`,
                        requiredTools: toolNames,
                        source: 'plugin',
                        pluginName: extName,
                    })
                    logger.debug('Auto-generated default skill for plugin:', extName, 'with tools:', toolNames)
                }
            }
        }

        // Kernel agent contributions (M0): explicit `agent.skills` travel with
        // names already resolved to wire names. Agent tools no skill claims get
        // an auto-generated default so skills-only catalog mode cannot drop them
        // (legacy extension tools keep their existing default-skill path above).
        const agentCapabilities = this.resolveAgentCapabilities()
        for (const skill of agentCapabilities.skills) {
            skills.push({
                name: skill.name,
                description: skill.description,
                requiredTools: skill.requiredTools,
                optionalTools: skill.optionalTools,
                systemPromptFragment: skill.systemPromptFragment,
                tags: skill.tags,
                source: 'plugin',
                pluginName: skill.pluginName,
            })
        }

        const claimedAgentTools = new Set<string>()
        for (const skill of agentCapabilities.skills) {
            for (const name of [...(skill.requiredTools ?? []), ...(skill.optionalTools ?? [])]) {
                claimedAgentTools.add(name)
            }
        }
        const unclaimedByPlugin = new Map<string, string[]>()
        for (const tool of agentCapabilities.tools) {
            if (tool.namespace === false) continue
            if (claimedAgentTools.has(tool.wireName)) continue
            const list = unclaimedByPlugin.get(tool.pluginName) ?? []
            list.push(tool.wireName)
            unclaimedByPlugin.set(tool.pluginName, list)
        }
        for (const [pluginName, toolNames] of unclaimedByPlugin) {
            if (toolNames.length === 0) continue
            skills.push({
                name: `${pluginName}-default`,
                description: `Default skill for ${pluginName} plugin`,
                requiredTools: toolNames,
                source: 'plugin',
                pluginName,
            })
        }

        logger.debug('Total resolved skills:', skills.length)
        return skills
    }

    /**
     * Load external plugins and extract their editor extensions.
     * This method is used for collaboration scenarios where we need to load
     * another user's plugins without affecting the current user's plugin list.
     *
     * @param plugins Array of plugin metadata with resourcePath and pluginKey
     * @returns Array of ExtensionWrapper from the loaded plugins
     */
    async loadExternalPluginExtensions(inputs: readonly RemotePluginInput[]): Promise<ExtensionWrapper[]> {
        const extensions: ExtensionWrapper[] = [];

        if (!inputs || inputs.length === 0) {
            return extensions;
        }

        const plugins = inputs.flatMap(input => {
            const plugin = normalizeRemotePluginDescriptor(input)
            if (plugin) return [plugin]
            logger.warn(`Skipping external plugin ${getRemotePluginInputName(input)}: missing required runtime metadata`)
            return []
        })

        const loadResults = await Promise.allSettled(plugins.map(async (plugin) => {
            try {
                // Construct the plugin URL (same logic as init)
                const pluginUrl = plugin.resourcePath.startsWith('http')
                    ? plugin.resourcePath
                    : this._buildPluginUrl(plugin);

                // Load the plugin script
                const registration = await pluginScriptLoader.load(
                    pluginUrl,
                    plugin.pluginKey,
                    plugin.name,
                    { integrity: plugin.integrity, timeout: this._loadTimeoutMs },
                );

                // Version handshake before extracting the KPlugin instance
                if (this._getApiIncompatibility(registration.meta, plugin)) {
                    return null;
                }

                const pluginInstance = this._extractPlugin(registration);

                return pluginInstance;
            } catch (error) {
                logger.warn(`Failed to load external plugin ${plugin.name}:`, error);
                return null;
            }
        }));

        // Extract extensions from successfully loaded plugins
        for (const result of loadResults) {
            if (result.status === 'fulfilled' && result.value) {
                const pluginInstance = result.value;
                if (pluginInstance.editorExtensions && pluginInstance.editorExtensions.length > 0) {
                    extensions.push(...pluginInstance.editorExtensions);
                }
            }
        }

        logger.info(`Loaded ${extensions.length} external extensions from ${plugins.length} plugins`);
        return extensions;
    }

    /** Read-only service access for hooks and plugin consumers. */
    get serviceRegistry(): ServiceRegistryView {
        return this._serviceRegistryView
    }

    /**
     * Register a host-owned core service after construction.
     *
     * Needed when a service's implementation closes over the manager itself
     * (e.g. `pluginHost`), which is impossible to express in the constructor's
     * `coreServices` object. Core services cannot be replaced by plugins.
     */
    registerCoreService<K extends keyof Services>(name: K, service: NonNullable<Services[K]>): void {
        this._serviceRegistry.register(name, service, CORE_SERVICE_OWNER)
    }

    /**
     * @deprecated Use serviceRegistry.getAll() instead
     */
    get pluginServices(): Services {
        return this._serviceRegistry.getAll()
    }

}
