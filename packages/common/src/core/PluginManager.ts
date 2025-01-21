import { Plugins } from "../../../core/src/App";
import { ExtensionWrapper } from "./editor";
import { SiderMenuItemProps } from "./menu";
import { RouteConfig } from "./route";

export interface PluginConfig {
    name: string
    status: string
    routes?: RouteConfig[]
    globalRoutes?: RouteConfig[]
    menus?: SiderMenuItemProps[]
    editorExtension?: ExtensionWrapper[]
}

export class KPlugin<T extends PluginConfig> {

    name: string
    private _routes?: RouteConfig[]
    private _globalRoutes?: RouteConfig[]
    private _editorExtension?: ExtensionWrapper[]
    private _menus?: SiderMenuItemProps[]

    constructor(config: T) {
        this.name = config.name
        this._routes = config.routes
        this._globalRoutes = config.globalRoutes
        this._editorExtension = config.editorExtension
        this._menus = config.menus
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

}

export class PluginManager {

    plugins: Plugins = []

    register(plugin: KPlugin<any>) {
        const exists = this.plugins.find(it => it.name === plugin.name)
        if (exists) {
            console.warn("plugin " + plugin.name + "is exists")
        } else {
            this.plugins.push(plugin)
        }
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