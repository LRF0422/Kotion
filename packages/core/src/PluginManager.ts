import { KPlugin, PluginConfig } from "@repo/common";
import { Plugins } from "./App";
import { RouteConfig } from "@repo/common";

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
}