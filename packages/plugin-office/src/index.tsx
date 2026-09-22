import { KPlugin, PluginConfig } from "@kn/common"
import { SpreadsheetExtension } from "./spreadsheet"
import "@kn/ui/globals.css"

/**
 * Office plugin — currently ships a single, intentionally focused feature set:
 * Excel-compatible spreadsheets (VTableSheet).
 *
 * Word documents and slide decks were removed on purpose: only the spreadsheet
 * path is maintained and validated, so everything that ships here is expected
 * to work reliably.
 */
interface OfficePluginConfig extends PluginConfig {
}

class OfficePlugin extends KPlugin<OfficePluginConfig> {
}

export const office = new OfficePlugin({
    status: '',
    name: 'Office',
    editorExtension: [SpreadsheetExtension],
})
