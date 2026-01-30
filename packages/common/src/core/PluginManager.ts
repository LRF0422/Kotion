import { isFunction, merge } from "lodash";
import { ExtensionWrapper } from "./editor";
import { SiderMenuItemProps } from "./menu";
import { RouteConfig } from "./route";
import { Services } from "./types";
import { importScript } from "../utils/import-util";
import { event } from "../event";
import { Editor } from "@tiptap/core";
import { logger } from "../utils/logger";

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
     * Settings component to render
     */
    component: React.ComponentType<any>;
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

    constructor(config: T) {
        this.name = config.name
        this._routes = config.routes
        this._globalRoutes = config.globalRoutes
        this._editorExtension = config.editorExtension
        this._menus = config.menus
        this._locales = config.locales
        this._services = config.services
        this._settings = config.settings
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

}

export class PluginManager {

    plugins: KPlugin<any>[] = []
    _initialPlugins: KPlugin<any>[] = []
    _pluginServices: Services = {} as Services
    _pluginStore: (path: string) => string
    _init: boolean = false

    // Cache for resolved plugin data to improve performance
    private _cacheRoutes: RouteConfig[] | null = null
    private _cacheMenus: SiderMenuItemProps[] | null = null
    private _cacheExtensions: ExtensionWrapper[] | null = null
    private _cacheLocales: any | null = null
    private _pluginMap: Map<string, KPlugin<any>> = new Map()

    constructor(pluginStore: (path: string) => string, initalPlugins: KPlugin<any>[]) {
        this._pluginStore = pluginStore
        this._initialPlugins = initalPlugins
        this._buildPluginMap(initalPlugins)
        logger.debug('Initial plugins loaded:', this._initialPlugins);
    }

    private _buildPluginMap(plugins: KPlugin<any>[]) {
        plugins.forEach(plugin => {
            this._pluginMap.set(plugin.name, plugin)
        })
    }

    private _clearCache() {
        this._cacheRoutes = null
        this._cacheMenus = null
        this._cacheExtensions = null
        this._cacheLocales = null
    }

    private _validatePlugin(plugin: any): boolean {
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

    public async init(remotePlugins: any[]) {
        logger.info('Initializing remote plugins:', remotePlugins);
        logger.info('Current init status:', this._init);

        try {
            // Reset state if reinitializing to ensure clean state
            if (this._init) {
                logger.info('PluginManager already initialized, resetting state for reinitialization');
                this._init = false;
                // Keep initial plugins but clear remote plugins
                this.plugins = [...this._initialPlugins];
                // Rebuild plugin map with only initial plugins
                this._pluginMap.clear();
                this._buildPluginMap(this._initialPlugins);
                this._clearCache();
            }

            if (!remotePlugins || remotePlugins.length === 0) {
                this.plugins = ([...(this._initialPlugins || [])])
                this._clearCache()
                this._mergeServices()
                this._init = true
                logger.info('Plugins loaded:', this.plugins.length);
                logger.debug('Services loaded:', this._pluginServices);
                return
            }

            const loadResults = await Promise.allSettled(remotePlugins.map(async (plugin) => {
                try {
                    const path = this._pluginStore(plugin.resourcePath) + "&cache=true"
                    const result = await importScript(path, plugin.pluginKey, plugin.name)
                    return result
                } catch (error) {
                    logger.error(`Failed to load plugin ${plugin.name}:`, error)
                    throw error
                }
            }))
            console.log('Load results:', loadResults);

            const successfulPlugins = loadResults
                .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
                .map(result => Object.values(result.value)[0] as KPlugin<any>)
                .filter(plugin => {
                    if (!plugin || !plugin.name) {
                        logger.warn('Invalid plugin detected, skipping')
                        return false
                    }
                    return true
                })

            this.plugins = [...this._initialPlugins, ...successfulPlugins]
            this._buildPluginMap(successfulPlugins)
            this._clearCache()
            this._mergeServices()
            this._init = true

            logger.info(`All plugins loaded: ${this.plugins.length} (${successfulPlugins.length} remote)`);
            logger.debug('Services loaded:', this._pluginServices);

            const failedCount = loadResults.filter(r => r.status === 'rejected').length
            if (failedCount > 0) {
                logger.warn(`${failedCount} plugins failed to load`)
            }
        } catch (error) {
            logger.error('Fatal error during plugin initialization:', error)
            this.plugins = [...this._initialPlugins]
            this._init = true
            throw error
        }
    }

    private _mergeServices() {
        const servicesArray = this.plugins
            .map(it => it.services)
            .filter(service => service !== undefined)

        if (servicesArray.length > 0) {
            this._pluginServices = merge({}, ...servicesArray)
        }
    }

    uninstallPlugin(key: string) {
        logger.info('pluginStore ', this._pluginMap);
        const plugin = this._pluginMap.get(key)
        if (!plugin) {
            logger.warn(`Plugin ${key} not found, cannot uninstall`)
            return false
        }

        this.plugins = this.plugins.filter(it => it.name !== key)
        this._pluginMap.delete(key)
        this._clearCache()

        // Rebuild services without the uninstalled plugin
        this._mergeServices()

        logger.info('Plugin uninstalled:', key);
        event.emit("REFRESH_PLUSINS")
        return true
    }

    async installPlugin(plugin: any, callBack?: () => void) {
        try {
            if (!this._validatePlugin(plugin)) {
                logger.error('Plugin validation failed')
                return false
            }

            const path = this._pluginStore(plugin.resourcePath) + "&cache=true"
            const pluginInstance = await importScript(path, plugin.pluginKey, plugin.name)

            if (!pluginInstance) {
                logger.error(`Failed to load plugin instance for ${plugin.name}`)
                return false
            }

            const pluginKey = Object.keys(pluginInstance)[0]
            const loadedPlugin = Object.values(pluginInstance)[0] as KPlugin<any>

            if (!loadedPlugin || !loadedPlugin.name) {
                logger.error(`Invalid plugin structure for ${plugin.name}`)
                return false
            }

            this.plugins = [...this.plugins, loadedPlugin]
            this._pluginMap.set(loadedPlugin.name, loadedPlugin)
            this._clearCache()

            // Merge services if available
            if (pluginInstance[pluginKey]?.services) {
                this._pluginServices = merge(this._pluginServices, pluginInstance[pluginKey].services)
            }

            logger.info(`Plugin ${loadedPlugin.name} installed successfully`)
            event.emit("REFRESH_PLUSINS")
            callBack && callBack()
            return true
        } catch (error) {
            logger.error(`Error installing plugin ${plugin?.name}:`, error)
            return false
        }
    }

    remove(name: string) {
        const existed = this._pluginMap.has(name)
        if (existed) {
            this.plugins = this.plugins.filter(it => it.name !== name)
            this._pluginMap.delete(name)
            this._clearCache()
            logger.debug(`Plugin ${name} removed from manager`)
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

    resloveRoutes(): RouteConfig[] {
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

    resloveTools(editor: Editor) {
        const res: any = {}
        const extensions = this.resloveEditorExtension()

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

    resloveLocales(): any {
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

    resloveEditorExtension(): ExtensionWrapper[] {
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

    resloveMenus(): SiderMenuItemProps[] {
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
     * Load external plugins and extract their editor extensions.
     * This method is used for collaboration scenarios where we need to load
     * another user's plugins without affecting the current user's plugin list.
     * 
     * @param plugins Array of plugin metadata with resourcePath and pluginKey
     * @returns Array of ExtensionWrapper from the loaded plugins
     */
    async loadExternalPluginExtensions(plugins: Array<{ resourcePath: string; pluginKey: string; name: string }>): Promise<ExtensionWrapper[]> {
        const extensions: ExtensionWrapper[] = [];

        if (!plugins || plugins.length === 0) {
            return extensions;
        }

        const loadResults = await Promise.allSettled(plugins.map(async (plugin) => {
            try {
                if (!plugin.resourcePath || !plugin.pluginKey) {
                    logger.warn(`Skipping plugin ${plugin.name}: missing resourcePath or pluginKey`);
                    return null;
                }

                // Construct the plugin URL (same logic as init)
                const pluginUrl = plugin.resourcePath.startsWith('http')
                    ? plugin.resourcePath
                    : this._pluginStore(plugin.resourcePath) + "&cache=true";

                // Load the plugin script
                const loadedPlugin = await importScript(pluginUrl, plugin.pluginKey, plugin.name);

                // Extract the KPlugin instance
                const pluginInstance = Object.values(loadedPlugin)[0] as KPlugin<any>;

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

    get pluginServices(): Services {
        return this._pluginServices
    }
}