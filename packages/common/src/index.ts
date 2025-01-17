import { ExtensionWrapper } from "./core/editor";
import { MenuConfig } from "./core/menu";
import { RouteConfig } from "./core/route";

export * from "./core/editor"

interface PluginConfig {
    name: string
    status: string
    routes?: RouteConfig[]
    menus?: MenuConfig[]
    editorExtension?: ExtensionWrapper[]
}

class KPlugin<T extends PluginConfig> {

    constructor(config: T) {

    }

}
