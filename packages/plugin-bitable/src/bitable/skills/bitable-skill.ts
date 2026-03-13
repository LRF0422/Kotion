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

Supported views:
- 表格视图 (table): Standard spreadsheet-like view
- 看板视图 (kanban): Card-based kanban view
- 画廊视图 (gallery): Image gallery view
- 甘特图视图 (gantt): Timeline/gantt view`,
    tags: ['bitable', 'table', 'database', '多维表格', 'plugin']
}
