import { merge } from "lodash";
import { ExtensionWrapper } from "./editor";
import { SiderMenuItemProps } from "./menu";
import { RouteConfig } from "./route";
import { Services } from "./types";
import { importScript } from "../utils/import-util";
import { event } from "../event";
import { Editor } from "@tiptap/core";
import { logger } from "../utils/logger";

export interface PluginConfig {
    name: string
    status: string
    routes?: RouteConfig[]
    globalRoutes?: RouteConfig[]
    menus?: SiderMenuItemProps[]
    editorExtension?: ExtensionWrapper[]
    locales?: any
    services?: Services
}


export class KPlugin<T extends PluginConfig> {

    name: string
    private _routes?: RouteConfig[]
    private _globalRoutes?: RouteConfig[]
    private _editorExtension?: ExtensionWrapper[]
    private _menus?: SiderMenuItemProps[]
    private _locales?: any
    private _services?: Services

    constructor(config: T) {
        this.name = config.name
        this._routes = config.routes
        this._globalRoutes = config.globalRoutes
        this._editorExtension = config.editorExtension
        this._menus = config.menus
        this._locales = config.locales
        this._services = config.services
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

}

export class PluginManager {

    plugins: KPlugin<any>[] = []
    _initialPlugins: KPlugin<any>[] = []
    _pluginServices: Services = {} as Services
    _pluginStore: (path: string) => string
    _init: boolean = false

    constructor(pluginStore: (path: string) => string, initalPlugins: KPlugin<any>[]) {
        this._pluginStore = pluginStore
        this._initialPlugins = initalPlugins
        logger.debug('Initial plugins loaded:', this._initialPlugins);
    }

    public async init(remotePlugins: any[]) {
        logger.info('Initializing remote plugins:', remotePlugins);
        if (!remotePlugins || remotePlugins.length === 0) {
            this.plugins = ([...(this._initialPlugins || [])])
            this._pluginServices = merge(this.pluginServices, ...this.plugins.map(it => it.services))
            logger.info('Plugins loaded:', this.plugins.length);
            logger.debug('Services loaded:', this._pluginServices);
            this._init = true
            return
        }
        const res = await Promise.all(remotePlugins.map(async (plugin) => {
            const path = this._pluginStore(plugin.resourcePath) + "&cache=true"
            return await importScript(path, plugin.pluginKey, plugin.name)
        }))
        this.plugins = [...this._initialPlugins, ...(res.map(it => Object.values(it)[0]) as KPlugin<any>[])]
        this._pluginServices = merge(this.pluginServices, ...this.plugins.map(it => it.services))
        this._init = true
        logger.info('All plugins loaded:', this.plugins.length);
        logger.debug('All services loaded:', this._pluginServices);
    }

    uninstallPlugin(key: string) {
        this.plugins = this.plugins.filter(it => it.name !== key)
        logger.info('Plugin uninstalled:', key);
        event.emit("REFRESH_PLUSINS")
    }

    async installPlugin(plugin: any, callBack?: () => void) {
        const path = this._pluginStore(plugin.resourcePath) + "&cache=true"
        const pluginInstance = await importScript(path, plugin.pluginKey, plugin.name)
        this.plugins = [...this.plugins, Object.values(pluginInstance)[0] as KPlugin<any>]
        this._pluginServices = merge(this._pluginServices, pluginInstance[Object.keys(pluginInstance)[0]].services)
        event.emit("REFRESH_PLUSINS")
        callBack && callBack()
    }

    remove(name: string) {
        this.plugins = this.plugins.filter(it => it.name !== name)
    }

    get initStatus() {
        return this._init
    }

    resloveRoutes(): RouteConfig[] {
        let routes: RouteConfig[] = []
        this.plugins.forEach(it => {
            if (it.routes) {
                routes = [...routes, ...it.routes]
            }
        })
        return routes;
    }

    resloveTools(editor: Editor) {
        const res: any = {}
        this.resloveEditorExtension().filter(it => it.tools).map(it => it.tools).flat().forEach((it: any) => {
            logger.info('Resolved tool:', it);
            res[it.name] = it
            res[it.name].execute = it?.execute(editor)
        })
        logger.debug('Resolved tools:', Object.keys(res));
        return res;
    }

    resloveLocales(): any {
        let locales: any = {}
        this.plugins.forEach(plugin => {
            if (plugin.locales) {
                locales = merge(locales, plugin.locales)
            }
        })
        return locales;
    }

    resloveEditorExtension(): ExtensionWrapper[] {
        let editorExtensions: ExtensionWrapper[] = []
        this.plugins.forEach(plugin => {
            if (plugin.editorExtensions) {
                editorExtensions = [...editorExtensions, ...plugin.editorExtensions]
            }
        })
        return editorExtensions;

    }

    resloveMenus(): SiderMenuItemProps[] {
        let menus: SiderMenuItemProps[] = []
        this.plugins.forEach(plugin => {
            if (plugin.menus) {
                menus = [...menus, ...plugin.menus]
            }
        })
        return menus;
    }

    get pluginServices(): Services {
        return this._pluginServices
    }
}