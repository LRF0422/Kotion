import { KPlugin, PluginConfig } from "@kn/common"
import { SpreadsheetExtension } from "./spreadsheet"
import { DocumentExtension } from "./document"
import { SlideExtension } from "./slide"
import "@kn/ui/globals.css"

interface OfficePluginConfig extends PluginConfig {
}

class OfficePlugin extends KPlugin<OfficePluginConfig> {
}

export const office = new OfficePlugin({
    status: '',
    name: 'Office',
    editorExtension: [SpreadsheetExtension, DocumentExtension, SlideExtension],
})
