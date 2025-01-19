
import { KPlugin, PluginConfig } from "@repo/common"
import { Button } from "@repo/ui"
import React from "react"

interface TestPluginConfig extends PluginConfig {



}
class TestPlugin extends KPlugin<TestPluginConfig> {
}

export const testPlugin = new TestPlugin({
    status: '',
    name: 'test',
    routes: [
        {
            name: '',
            path: '',
            element: <div>
                <Button>1231231321</Button>
            </div>
        }
    ]
})