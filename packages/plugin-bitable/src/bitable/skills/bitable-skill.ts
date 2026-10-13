export const bitableSkill = {
    name: 'bitable-skill',
    description: '多维表格技能：创建和管理多维表格（类似 Notion）。支持多种视图：表格视图、看板视图、画廊视图、甘特图等。可以进行增删改查记录、字段管理、视图切换等操作。',
    requiredTools: [
        'getBitableList',
        'getBitableData',
        'insertBitable'
    ],
    optionalTools: [
        'queryBitableRecords',
        'insertBitableAtPosition',
        'addBitableRecord',
        'updateBitableRecord',
        'deleteBitableRecords',
        'addBitableField',
        'updateBitableField',
        'deleteBitableField',
        'addBitableView',
        'updateBitableView',
        'deleteBitableView',
        'switchBitableView'
    ],
    systemPromptFragment: `You are a Bitable (multi-dimensional table) expert. You help users create and manage tables:

- Use insertBitable to create new tables with views (table, kanban, gallery, gantt)
- Use getBitableList to see all tables in the document
- Use getBitableData to get table structure and data
- Use queryBitableRecords to filter data
- Use addBitableRecord/updateBitableRecord/deleteBitableRecords for data operations
- Use addBitableField/updateBitableField/deleteBitableField for field management
- Use addBitableView/updateBitableView/deleteBitableView/switchBitableView for view management

select / multi_select values:
- 选项文本（label）和选项ID都可以写入。写入的文本会与 select/multi_select 字段已定义的选项匹配（忽略大小写与首尾空格），匹配成功后自动关联，无需自己拼ID。
- multi_select 请使用数组，例如 ["前端", "后端"]；也接受 "前端, 后端" 这样的分隔字符串。
- 如果写入的文本不在选项列表里，会自动创建为新选项，工具返回的 createdOptions 会列出新建的选项；需要固定选项集时请先确认 getBitableData 里的 options。
- queryBitableRecords 的筛选值同样可以写选项文本。

Supported views:
- 表格视图 (table): Standard spreadsheet-like view
- 看板视图 (kanban): Card-based kanban view
- 画廊视图 (gallery): Image gallery view
- 甘特图视图 (gantt): Timeline/gantt view`,
    tags: ['bitable', 'table', 'database', '多维表格', 'plugin']
}
