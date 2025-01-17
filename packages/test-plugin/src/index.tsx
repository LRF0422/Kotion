
import { KPlugin, PluginConfig } from "@repo/common"
import React from "react"

export interface TestPluginConfig extends PluginConfig {



}
export class TestPlugin extends KPlugin<TestPluginConfig> {
}

export const testPlugin = () => {

    return new TestPlugin({
        status: '',
        name: 'test',
        routes: [
            {
                name: '',
                path: '',
                element: <div></div>
            }
        ]
    })
}