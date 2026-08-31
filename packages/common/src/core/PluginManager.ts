import { isFunction, merge } from "lodash";
import { ExtensionWrapper } from "./editor";
import { DockPanelConfig, DockPosition, ResolvedDockPanel } from "./dock";
import { SiderMenuItemProps } from "./menu";
import { TourConfig } from "./tour";
import { RouteConfig } from "./route";
import { Services } from "./types";
import {
    ServiceRegistry,
    type ServiceRegistryView,
    pluginServiceOwner,
} from "./ServiceRegistry";
import { PluginMeta, PluginRegistration } from "./global-namespace";
import {
    getRemotePluginInputName,
    normalizeRemotePluginDescriptor,
    type RemotePluginDescriptor,
    type RemotePluginInput,
} from "./plugin-runtime";
import { pluginScriptLoader } from "../utils/import-util";
import { logger } from "../utils/logger";
import { event, PLUGIN_INCOMPATIBLE } from "../event";
import { Editor } from "@tiptap/core";

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

}

export interface PluginManagerOptions {
    /** Maps a plugin's resourcePath to the (public, no-auth) download URL */
    resolveUrl: (resourcePath: string) => string
    /** The plugin API version the host was built with (from @kn/plugin-api) */
    hostApiVersion: string
    /** Application-owned services that plugins cannot replace. */
    coreServices?: Partial<Services>
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
    private _pluginMap: Map<string, KPlugin<any>> = new Map()
    private _incompatiblePlugins = new Map<string, PluginApiIncompatibility>()

    // Built-in dock panels contributed by the host itself (e.g. the AI agent
    // panel). Same contract as plugin-contributed panels; they simply cannot be
    // uninstalled. Keyed by panel id, insertion-ordered.
    private _coreDockPanels: Map<string, DockPanelConfig> = new Map()

    constructor(options: PluginManagerOptions, initalPlugins: KPlugin<any>[]) {
        this._resolveUrl = options.resolveUrl
        this._hostApiVersion = options.hostApiVersion
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

    private _buildPluginMap(plugins: KPlugin<any>[]) {
        plugins.forEach(plugin => {
            this._pluginMap.set(plugin.name, plugin)
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
        } catch (error) {
            logger.error('Plugin contract getters are not accessible:', error)
            return null
        }
        return plugin
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

            const loadResults = await Promise.allSettled(loadableRemotePlugins.map(async (plugin) => {
                try {
                    const path = this._buildPluginUrl(plugin)
                    const registration = await pluginScriptLoader.load(path, plugin.pluginKey, plugin.name, {
                        integrity: plugin.integrity || undefined
                    })
                    return { plugin, registration }
                } catch (error) {
                    logger.error(`Failed to load plugin ${plugin.name}:`, error)
                    throw error
                }
            }))
            console.log('Load results:', loadResults);

            const incompatiblePlugins = new Map<string, PluginApiIncompatibility>()
            loadResults.forEach((result, index) => {
                if (result.status === 'rejected') {
                    failedPlugins.add(loadableRemotePlugins[index]?.name || loadableRemotePlugins[index]?.pluginKey || 'unknown')
                }
            })

            const successfulPlugins: KPlugin<any>[] = []
            const activatedPluginKeys = new Set<string>()
            const seenPluginNames = new Set(this._initialPlugins.map(plugin => plugin.name))
            for (const result of loadResults) {
                if (result.status !== 'fulfilled') continue
                const { plugin, registration } = result.value
                const incompatibility = this._getApiIncompatibility(registration.meta, plugin)
                if (incompatibility) {
                    incompatiblePlugins.set(this._pluginIdentity(plugin), incompatibility)
                    continue
                }
                const instance = this._extractPlugin(registration)
                if (!instance) {
                    logger.warn(`Invalid plugin ${plugin.name} detected, skipping`)
                    failedPlugins.add(plugin.name || plugin.pluginKey)
                    continue
                }
                if (seenPluginNames.has(instance.name)) {
                    logger.info(`Skipping plugin ${instance.name}: a plugin with the same runtime name is already active`)
                    continue
                }
                seenPluginNames.add(instance.name)
                successfulPlugins.push(instance)
                if (plugin.pluginKey) activatedPluginKeys.add(plugin.pluginKey)
            }

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
                integrity: plugin.integrity || undefined
            })

            if (!registration) {
                logger.error(`Failed to load plugin instance for ${plugin.name}`)
                return false
            }

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
            this._clearPluginIncompatibility(plugin)

            logger.info(`Plugin ${loadedPlugin.name} installed successfully`)
            // Notify listeners (does NOT emit global events – callers do that)
            this._notifyChange()
            callBack && callBack()
            return true
        } catch (error) {
            logger.error(`Error installing plugin ${plugin?.name}:`, error)
            return false
        }
    }

    remove(name: string) {
        const plugin = this._pluginMap.get(name)
        const existed = Boolean(plugin)
        if (plugin) {
            this.plugins = this.plugins.filter(it => it.name !== name)
            this._pluginMap.delete(name)
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

    resolveTools(editor: Editor) {
        const res: any = {}
        const extensions = this.resolveEditorExtensions()

        for (const ext of extensions) {
            if (!ext.tools) continue

            const tools = Array.isArray(ext.tools) ? ext.tools : [ext.tools]

            for (const tool of tools) {
                if (!tool || !tool.name) {
                    logger.warn('Invalid tool detected, skipping')
                    continue
                }

                if (tool.execute && isFunction(tool.execute)) {
                    if (res[tool.name]) {
                        logger.warn(`Tool ${tool.name} already exists, overwriting`)
                    }
                    res[tool.name] = {
                        ...tool,
                        execute: tool.execute(editor)
                    }
                    logger.debug('Resolved tool:', tool.name)
                }
            }
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

            const collect = (panel: DockPanelConfig, source: 'plugin' | 'core', owner: string) => {
                if (!panel || !panel.id || !panel.component) {
                    logger.warn(`Invalid dock panel from ${owner}, skipping`)
                    return
                }
                if (seen.has(panel.id)) {
                    logger.warn(`Dock panel ${panel.id} already registered, skipping duplicate from ${owner}`)
                    return
                }
                seen.add(panel.id)
                panels.push({ ...panel, source, owner })
            }

            this._coreDockPanels.forEach(panel => collect(panel, 'core', 'core'))
            for (const plugin of this.plugins) {
                for (const panel of plugin.dockPanels) {
                    collect(panel, 'plugin', plugin.name)
                }
            }

            panels.sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
            this._cacheDockPanels = panels
        }

        if (!position) return this._cacheDockPanels
        return this._cacheDockPanels.filter(p => (p.position ?? 'right') === position)
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
                    { integrity: plugin.integrity },
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
     * @deprecated Use serviceRegistry.getAll() instead
     */
    get pluginServices(): Services {
        return this._serviceRegistry.getAll()
    }

    // ---- Deprecated method aliases (old typo names) ----

    /** @deprecated Use resolveRoutes() instead */
    resloveRoutes(): RouteConfig[] { return this.resolveRoutes() }

    /** @deprecated Use resolveTools() instead */
    resloveTools(editor: Editor) { return this.resolveTools(editor) }

    /** @deprecated Use resolveLocales() instead */
    resloveLocales(): any { return this.resolveLocales() }

    /** @deprecated Use resolveEditorExtensions() instead */
    resloveEditorExtension(): ExtensionWrapper[] { return this.resolveEditorExtensions() }

    /** @deprecated Use resolveMenus() instead */
    resloveMenus(): SiderMenuItemProps[] { return this.resolveMenus() }
}
