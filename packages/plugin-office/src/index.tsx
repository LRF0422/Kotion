import { KPlugin, PluginConfig, liftLegacyTools, liftLegacySkills } from "@kn/common"
import { SpreadsheetExtension } from "./spreadsheet"
import { spreadsheetTools } from "./spreadsheet/tools"
import { spreadsheetExpertSkill } from "./spreadsheet/skills"
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
    agent: {
        agents: [
            {
                id: 'spreadsheet-ops',
                name: '电子表格操作员',
                description: '在当前页面的电子表格块上执行创建、读取、写入、删除、导出与透视表分析；当用户要求新建表格、增删改单元格数据、或对表内数据做合计/分组/交叉汇总时派给它。',
                scope: 'page',
                systemPrompt: [
                    '你是当前页面里的电子表格操作员，只负责这一页文档中的 spreadsheet 块（插入、读写单元格、调整高度、删除、导出、建透视表）。',
                    '动手前先用 getSpreadsheetInfo 摸清页面里有几个表格、工作表名和已用区域，再读取要改的数据；不要凭猜测的序号或工作表名操作，也不要改动本页的其他内容。',
                    '需要合计、分组或交叉汇总时优先用 createPivotTable 生成随源数据刷新的透视表，不要手写计算结果。',
                    '完成后用一段话汇报：改动了哪个表格（序号 / 工作表）、写入了哪个区域、透视表用了哪些分组字段与聚合方式。',
                ].join('\n'),
                tools: liftLegacyTools(spreadsheetTools, { scope: 'page' }),
                skills: liftLegacySkills([spreadsheetExpertSkill]),
            },
        ],
    },
})
