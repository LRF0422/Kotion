import { ExtensionWrapper } from "./core/editor";
import { MenuConfig } from "./core/menu";
import { RouteConfig } from "./core/route";

export * from "./core/editor"
export * from "./core/route"

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

}
