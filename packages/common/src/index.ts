import { ExtensionWrapper } from "./core/editor";
import { MenuConfig } from "./core/menu";
import { RouteConfig } from "./core/route";

export * from "./core/editor"

export interface PluginConfig {
    name: string
    status: string
    routes?: RouteConfig[]
    menus?: MenuConfig[]
    editorExtension?: ExtensionWrapper[]
}

export class KPlugin<T extends PluginConfig> {

    _routes?: RouteConfig[]

    constructor(config: T) {
        this._routes = config.routes
    }

    get routes() {
        return this._routes
    }

}
