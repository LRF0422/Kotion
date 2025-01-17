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

    constructor(config: T) {

    }

}
