
import { KPlugin, PluginConfig } from "@repo/common"
import { Button } from "@repo/ui"
import React from "react"
import "./index.css"

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
                <Button className=" text-red-400" >Leong</Button>
            </div>
        }
    ]
})