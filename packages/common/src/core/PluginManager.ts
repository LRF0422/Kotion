import { Plugins } from "../../../core/src/App";
import { ExtensionWrapper } from "./editor";
import { MenuConfig } from "./menu";
import { RouteConfig } from "./route";

export interface PluginConfig {
    name: string
    status: string
    routes?: RouteConfig[]
    globalRoutes?: RouteConfig[]
    menus?: MenuConfig[]
    editorExtension?: ExtensionWrapper[]
}

export class KPlugin<T extends PluginConfig> {

    name: string
    private _routes?: RouteConfig[]
    private _globalRoutes?: RouteConfig[]
    private _editorExtension?: ExtensionWrapper[]

    constructor(config: T) {
        this.name = config.name
        this._routes = config.routes
        this._globalRoutes = config.globalRoutes
        this._editorExtension = config.editorExtension
    }

    get routes(): RouteConfig[] {
        return this._routes || []
    }

    get editorExtensions(): ExtensionWrapper[] {
        return this._editorExtension || []
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
}