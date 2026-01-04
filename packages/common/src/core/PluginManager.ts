import { merge } from "lodash";
import { ExtensionWrapper } from "./editor";
import { SiderMenuItemProps } from "./menu";
import { RouteConfig } from "./route";
import { Services } from "./types";
import { importScript } from "../utils/import-util";
import { event } from "../event";

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
        console.log('initalPlugins', this._initialPlugins);

    }

    public async init(remotePlugins: any[]) {
        console.log('remote Plugins', remotePlugins);
        if (!remotePlugins || remotePlugins.length === 0) {
            this.plugins = ([...(this._initialPlugins || [])])
            return
        }
        const res = await Promise.all(remotePlugins.map(async (plugin) => {
            const path = this._pluginStore(plugin.resourcePath) + "&cache=true"
            return await importScript(path, plugin.pluginKey, plugin.name)
        }))
        this.plugins = [...this._initialPlugins, ...(res.map(it => Object.values(it)[0]) as KPlugin<any>[])]
        this._pluginServices = merge(this.pluginServices, ...this.plugins.map(it => it.services))
        this._init = true
        console.log('plugins loaded ', this.plugins);
    }

    uninstallPlugin(key: string) {
        this.plugins = this.plugins.filter(it => it.name !== key)
        console.log('plugins uninstalled ', key);

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

    resloveLocales(): any {
        let locales: any = {}
        this.plugins.forEach(plugin => {
            if (plugin.locales) {
                locales = merge(locales, plugin.locales)
            }
        })
        console.log('pluginlocals', locales);
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