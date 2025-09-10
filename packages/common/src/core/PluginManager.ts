import { Plugins } from "../../../core/src/App";
import { ExtensionWrapper } from "./editor";
import { SiderMenuItemProps } from "./menu";
import { RouteConfig } from "./route";
import { KeysWithTypeOf, Services } from "./types";

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
    private _services?: Services = {}

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

    plugins: Plugins = []

    register(plugin: KPlugin<any>) {
        if (plugin) {
            const exists = this.plugins.find(it => it.name === plugin?.name)
            if (exists) {
                console.warn("plugin " + plugin.name + " is exists")
            } else {
                this.plugins = [...this.plugins, plugin]
            }
        }
    }

    setPlugins(plugins: Plugins) {
        this.plugins = plugins
    }

    remove(name: string) {
        this.plugins = this.plugins.filter(it => it.name !== name)
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
                locales = { ...locales, ...plugin.locales }
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
}