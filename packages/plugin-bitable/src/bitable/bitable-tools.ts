import { z } from "@kn/ui";
import { Editor } from "@kn/editor";
import { FieldType, ViewType, ChartType, FieldConfig, ViewConfig, RecordData, BitableAttrs } from "../types";
import { generateFieldId, generateViewId } from "../utils/id";

/**
 * Bitable Tool Definitions for AI Agent
 * 
 * These tools allow AI agents to:
 * - Query bitable information and data
 * - Manage records (CRUD operations)
 * - Manage fields/columns
 * - Manage views
 * - Insert new bitables
 */

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find all bitable nodes in the document
 */
const findBitableNodes = (editor: Editor) => {
    const bitables: Array<{ pos: number; attrs: BitableAttrs; nodeSize: number }> = [];

    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'bitable') {
            bitables.push({
                pos,
                attrs: node.attrs as BitableAttrs,
                nodeSize: node.nodeSize
            });
        }
    });

    return bitables;
};

/**
 * Find bitable node by index (0-based)
 */
const findBitableByIndex = (editor: Editor, index: number) => {
    const bitables = findBitableNodes(editor);
    if (index < 0 || index >= bitables.length) {
        return null;
    }
    return bitables[index];
};

/**
 * Update bitable attributes at position
 */
const updateBitableAttrs = (editor: Editor, pos: number, newAttrs: Partial<BitableAttrs>) => {
    const { tr } = editor.state;
    const node = editor.state.doc.nodeAt(pos);

    if (!node || node.type.name !== 'bitable') {
        return false;
    }

    tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        ...newAttrs
    });

    editor.view.dispatch(tr);
    return true;
};

// ============================================================================
// Schema Definitions
// ============================================================================

const FieldTypeEnum = z.enum([
    'text', 'number', 'select', 'multi_select', 'date', 'checkbox',
    'person', 'attachment', 'url', 'email', 'phone', 'rating', 'progress',
    'formula', 'relation', 'created_time', 'updated_time', 'created_by', 'updated_by', 'auto_number', 'id'
]);

const ViewTypeEnum = z.enum(['table', 'kanban', 'gallery', 'calendar', 'timeline', 'form', 'chart']);

const ChartTypeEnum = z.enum(['bar', 'line', 'pie', 'area', 'radar', 'scatter', 'radial_bar', 'donut', 'stacked_bar', 'stacked_area']);

const SelectOptionSchema = z.object({
    id: z.string().optional().describe("选项ID，不提供则自动生成"),
    label: z.string().describe("选项显示名称"),
    color: z.string().optional().describe("选项颜色，如 #red, #blue, #green")
});

const FieldConfigSchema = z.object({
    id: z.string().optional().describe("字段ID，不提供则自动生成"),
    title: z.string().describe("字段标题/列名"),
    type: FieldTypeEnum.describe("字段类型"),
    width: z.number().optional().describe("列宽度，默认150"),
    isShow: z.boolean().optional().describe("是否显示，默认true"),
    options: z.array(SelectOptionSchema).optional().describe("选项列表，用于select/multi_select类型"),
    description: z.string().optional().describe("字段描述")
});

const RecordDataSchema = z.record(z.string(), z.any()).describe("记录数据，key为字段ID，value为字段值");

// ============================================================================
// Tool Definitions
// ============================================================================

export const bitableTools = [
    // ========================================================================
    // Query Tools
    // ========================================================================
    {
        name: 'getBitableList',
        description: '获取文档中所有多维表格的列表信息，包括位置、字段、视图和记录数量',
        inputSchema: z.object({}),
        execute: (editor: Editor) => async () => {
            const bitables = findBitableNodes(editor);

            if (bitables.length === 0) {
                return {
                    success: true,
                    count: 0,
                    message: "文档中没有多维表格",
                    bitables: []
                };
            }

            return {
                success: true,
                count: bitables.length,
                bitables: bitables.map((bt, index) => ({
                    index,
                    pos: bt.pos,
                    fieldCount: bt.attrs.fields?.length || 0,
                    viewCount: bt.attrs.views?.length || 0,
                    recordCount: bt.attrs.data?.length || 0,
                    currentView: bt.attrs.currentView,
                    fields: bt.attrs.fields?.map(f => ({
                        id: f.id,
                        title: f.title,
                        type: f.type
                    })),
                    views: bt.attrs.views?.map(v => ({
                        id: v.id,
                        name: v.name,
                        type: v.type
                    }))
                }))
            };
        }
    },

    {
        name: 'getBitableData',
        description: '获取指定多维表格的完整数据，包括字段配置、视图配置和所有记录',
        inputSchema: z.object({
            bitableIndex: z.number().describe("多维表格索引（从0开始），使用 getBitableList 获取"),
            includeRecords: z.boolean().optional().describe("是否包含记录数据，默认true"),
            recordLimit: z.number().optional().describe("返回的记录数量限制，默认全部")
        }),
        execute: (editor: Editor) => async (params: {
            bitableIndex: number;
            includeRecords?: boolean;
            recordLimit?: number;
        }) => {
            const bitable = findBitableByIndex(editor, params.bitableIndex);

            if (!bitable) {
                return {
                    success: false,
                    error: `找不到索引为 ${params.bitableIndex} 的多维表格`
                };
            }

            const { attrs } = bitable;
            const includeRecords = params.includeRecords !== false;
            const records = attrs.data || [];
            const limitedRecords = params.recordLimit
                ? records.slice(0, params.recordLimit)
                : records;

            return {
                success: true,
                bitableIndex: params.bitableIndex,
                pos: bitable.pos,
                fields: attrs.fields,
                views: attrs.views,
                currentView: attrs.currentView,
                recordCount: records.length,
                ...(includeRecords && { records: limitedRecords })
            };
        }
    },

    {
        name: 'queryBitableRecords',
        description: '查询多维表格中的记录，支持按字段值筛选',
        inputSchema: z.object({
            bitableIndex: z.number().describe("多维表格索引"),
            filters: z.array(z.object({
                fieldId: z.string().describe("字段ID"),
                operator: z.enum(['equals', 'contains', 'gt', 'lt', 'gte', 'lte', 'isEmpty', 'isNotEmpty']).describe("比较操作符"),
                value: z.any().optional().describe("比较值")
            })).optional().describe("筛选条件"),
            sortBy: z.object({
                fieldId: z.string().describe("排序字段ID"),
                direction: z.enum(['asc', 'desc']).describe("排序方向")
            }).optional().describe("排序配置"),
            limit: z.number().optional().describe("返回数量限制")
        }),
        execute: (editor: Editor) => async (params: {
            bitableIndex: number;
            filters?: Array<{ fieldId: string; operator: string; value?: any }>;
            sortBy?: { fieldId: string; direction: 'asc' | 'desc' };
            limit?: number;
        }) => {
            const bitable = findBitableByIndex(editor, params.bitableIndex);

            if (!bitable) {
                return {
                    success: false,
                    error: `找不到索引为 ${params.bitableIndex} 的多维表格`
                };
            }

            let records = [...(bitable.attrs.data || [])];

            // Apply filters
            if (params.filters && params.filters.length > 0) {
                records = records.filter(record => {
                    return params.filters!.every(filter => {
                        const value = record[filter.fieldId];
                        switch (filter.operator) {
                            case 'equals':
                                return value === filter.value;
                            case 'contains':
                                return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
                            case 'gt':
                                return value > filter.value;
                            case 'lt':
                                return value < filter.value;
                            case 'gte':
                                return value >= filter.value;
                            case 'lte':
                                return value <= filter.value;
                            case 'isEmpty':
                                return value === null || value === undefined || value === '';
                            case 'isNotEmpty':
                                return value !== null && value !== undefined && value !== '';
                            default:
                                return true;
                        }
                    });
                });
            }

            // Apply sorting
            if (params.sortBy) {
                records.sort((a, b) => {
                    const aVal = a[params.sortBy!.fieldId];
                    const bVal = b[params.sortBy!.fieldId];
                    const direction = params.sortBy!.direction === 'asc' ? 1 : -1;

                    if (aVal < bVal) return -1 * direction;
                    if (aVal > bVal) return 1 * direction;
                    return 0;
                });
            }

            // Apply limit
            if (params.limit) {
                records = records.slice(0, params.limit);
            }

            return {
                success: true,
                totalMatched: records.length,
                records
            };
        }
    },

    // ========================================================================
    // Insert Bitable Tool
    // ========================================================================
    {
        name: 'insertBitable',
        description: '在文档中插入一个新的多维表格，可以指定字段和初始数据。数据的key应使用字段标题（如"名称"、"状态"）',
        inputSchema: z.object({
            fields: z.array(FieldConfigSchema).optional().describe("自定义字段配置，不提供则使用默认字段"),
            initialData: z.array(RecordDataSchema).optional().describe("初始数据记录，key为字段标题"),
            defaultViewType: ViewTypeEnum.optional().describe("默认视图类型，默认为table")
        }),
        execute: (editor: Editor) => async (params: {
            fields?: Array<{
                id?: string;
                title: string;
                type: string;
                width?: number;
                isShow?: boolean;
                options?: Array<{ id?: string; label: string; color?: string }>;
                description?: string;
            }>;
            initialData?: Array<Record<string, any>>;
            defaultViewType?: string;
        }) => {
            // Build fields configuration
            // If custom fields are provided, use ONLY those (plus required ID field)
            // Otherwise, use the default fields
            const fields: FieldConfig[] = [];
            const titleToIdMap: Record<string, string> = {};

            // Always add the ID field first
            fields.push({ id: 'id', title: 'ID', type: FieldType.ID, width: 80, isShow: true });
            titleToIdMap['ID'] = 'id';

            if (params.fields && params.fields.length > 0) {
                // Use custom fields only (clear default columns)
                params.fields.forEach(fieldConfig => {
                    // Use provided ID or use title as ID for easy data mapping
                    const fieldId = fieldConfig.id || fieldConfig.title;

                    // Process options for select fields
                    const options = fieldConfig.options?.map((opt, idx) => ({
                        id: opt.id || String(idx + 1),
                        label: opt.label,
                        color: opt.color || '#gray'
                    }));

                    fields.push({
                        id: fieldId,
                        title: fieldConfig.title,
                        type: fieldConfig.type as FieldType,
                        width: fieldConfig.width || 150,
                        isShow: fieldConfig.isShow !== false,
                        ...(options && { options }),
                        ...(fieldConfig.description && { description: fieldConfig.description })
                    });

                    // Add to mapping
                    titleToIdMap[fieldConfig.title] = fieldId;
                });
            } else {
                // Use default fields when no custom fields provided
                const defaultFieldConfigs = [
                    { id: 'name', title: '名称', type: FieldType.TEXT, width: 200, isShow: true },
                    {
                        id: 'status', title: '状态', type: FieldType.SELECT, width: 150, isShow: true,
                        options: [
                            { id: '1', label: '未开始', color: '#gray' },
                            { id: '2', label: '进行中', color: '#blue' },
                            { id: '3', label: '已完成', color: '#green' },
                        ]
                    },
                    {
                        id: 'priority', title: '优先级', type: FieldType.SELECT, width: 120, isShow: true,
                        options: [
                            { id: '1', label: '低', color: '#green' },
                            { id: '2', label: '中', color: '#yellow' },
                            { id: '3', label: '高', color: '#red' },
                        ]
                    },
                    { id: 'assignee', title: '负责人', type: FieldType.PERSON, width: 150, isShow: true },
                    { id: 'dueDate', title: '截止日期', type: FieldType.DATE, width: 150, isShow: true },
                    { id: 'progress', title: '进度', type: FieldType.PROGRESS, width: 150, isShow: true },
                ];

                defaultFieldConfigs.forEach(f => {
                    fields.push(f as FieldConfig);
                    titleToIdMap[f.title] = f.id;
                });
            }

            // Build default views
            // For kanban view, try to find a select field to group by
            const selectField = fields.find(f => f.type === FieldType.SELECT);
            const defaultViews: ViewConfig[] = [
                {
                    id: generateViewId(),
                    name: '表格视图',
                    type: ViewType.TABLE,
                    filters: [], sorts: [], groups: [], hiddenFields: [], fieldOrder: []
                },
                ...(selectField ? [{
                    id: generateViewId(),
                    name: '看板视图',
                    type: ViewType.KANBAN,
                    filters: [], sorts: [], groups: [], hiddenFields: [], fieldOrder: [],
                    kanbanConfig: { groupByField: selectField.id }
                }] : [])
            ];

            // Process initial data - transform field titles to field IDs
            const now = new Date().toISOString();
            const processedData = (params.initialData || []).map((record, idx) => {
                const transformedRecord: Record<string, any> = {
                    id: idx + 1,  // Auto-incrementing ID
                    createdTime: now,
                    updatedTime: now
                };

                // Transform each field: if key matches a title, use the corresponding ID
                Object.entries(record).forEach(([key, value]) => {
                    const fieldId = titleToIdMap[key] || key;  // Use mapped ID or original key
                    transformedRecord[fieldId] = value;
                });

                return transformedRecord;
            });

            // Insert bitable directly with proper configuration
            editor.commands.insertContent({
                type: 'bitable',
                attrs: {
                    fields: fields,
                    views: defaultViews,
                    currentView: defaultViews[0]?.id,
                    data: processedData
                }
            });

            return {
                success: true,
                message: "多维表格已插入",
                fieldCount: fields.length,
                recordCount: processedData.length,
                recordIds: processedData.map(r => r.id),
                fieldMapping: titleToIdMap
            };
        }
    },

    // ========================================================================
    // Insert Bitable At Position Tool
    // ========================================================================
    {
        name: 'insertBitableAtPosition',
        description: '在文档的指定位置插入一个新的多维表格，可以指定字段和初始数据。数据的key应使用字段标题（如"名称"、"状态"）',
        inputSchema: z.object({
            position: z.number().describe("插入位置的文档坐标"),
            fields: z.array(FieldConfigSchema).optional().describe("自定义字段配置，不提供则使用默认字段"),
            initialData: z.array(RecordDataSchema).optional().describe("初始数据记录，key为字段标题"),
            defaultViewType: ViewTypeEnum.optional().describe("默认视图类型，默认为table")
        }),
        execute: (editor: Editor) => async (params: {
            position: number;
            fields?: Array<{
                id?: string;
                title: string;
                type: string;
                width?: number;
                isShow?: boolean;
                options?: Array<{ id?: string; label: string; color?: string }>;
                description?: string;
            }>;
            initialData?: Array<Record<string, any>>;
            defaultViewType?: string;
        }) => {
            // Build fields configuration
            // If custom fields are provided, use ONLY those (plus required ID field)
            // Otherwise, use the default fields
            const fields: FieldConfig[] = [];
            const titleToIdMap: Record<string, string> = {};

            // Always add the ID field first
            fields.push({ id: 'id', title: 'ID', type: FieldType.ID, width: 80, isShow: true });
            titleToIdMap['ID'] = 'id';

            if (params.fields && params.fields.length > 0) {
                // Use custom fields only (clear default columns)
                params.fields.forEach(fieldConfig => {
                    // Use provided ID or use title as ID for easy data mapping
                    const fieldId = fieldConfig.id || fieldConfig.title;

                    // Process options for select fields
                    const options = fieldConfig.options?.map((opt, idx) => ({
                        id: opt.id || String(idx + 1),
                        label: opt.label,
                        color: opt.color || '#gray'
                    }));

                    fields.push({
                        id: fieldId,
                        title: fieldConfig.title,
                        type: fieldConfig.type as FieldType,
                        width: fieldConfig.width || 150,
                        isShow: fieldConfig.isShow !== false,
                        ...(options && { options }),
                        ...(fieldConfig.description && { description: fieldConfig.description })
                    });

                    // Add to mapping
                    titleToIdMap[fieldConfig.title] = fieldId;
                });
            } else {
                // Use default fields when no custom fields provided
                const defaultFieldConfigs = [
                    { id: 'name', title: '名称', type: FieldType.TEXT, width: 200, isShow: true },
                    {
                        id: 'status', title: '状态', type: FieldType.SELECT, width: 150, isShow: true,
                        options: [
                            { id: '1', label: '未开始', color: '#gray' },
                            { id: '2', label: '进行中', color: '#blue' },
                            { id: '3', label: '已完成', color: '#green' },
                        ]
                    },
                    {
                        id: 'priority', title: '优先级', type: FieldType.SELECT, width: 120, isShow: true,
                        options: [
                            { id: '1', label: '低', color: '#green' },
                            { id: '2', label: '中', color: '#yellow' },
                            { id: '3', label: '高', color: '#red' },
                        ]
                    },
                    { id: 'assignee', title: '负责人', type: FieldType.PERSON, width: 150, isShow: true },
                    { id: 'dueDate', title: '截止日期', type: FieldType.DATE, width: 150, isShow: true },
                    { id: 'progress', title: '进度', type: FieldType.PROGRESS, width: 150, isShow: true },
                ];

                defaultFieldConfigs.forEach(f => {
                    fields.push(f as FieldConfig);
                    titleToIdMap[f.title] = f.id;
                });
            }

            // Build default views
            // For kanban view, try to find a select field to group by
            const selectField = fields.find(f => f.type === FieldType.SELECT);
            const defaultViews: ViewConfig[] = [
                {
                    id: generateViewId(),
                    name: '表格视图',
                    type: ViewType.TABLE,
                    filters: [], sorts: [], groups: [], hiddenFields: [], fieldOrder: []
                },
                ...(selectField ? [{
                    id: generateViewId(),
                    name: '看板视图',
                    type: ViewType.KANBAN,
                    filters: [], sorts: [], groups: [], hiddenFields: [], fieldOrder: [],
                    kanbanConfig: { groupByField: selectField.id }
                }] : [])
            ];

            // Process initial data - transform field titles to field IDs
            const now = new Date().toISOString();
            const processedData = (params.initialData || []).map((record, idx) => {
                const transformedRecord: Record<string, any> = {
                    id: idx + 1,  // Auto-incrementing ID
                    createdTime: now,
                    updatedTime: now
                };

                // Transform each field: if key matches a title, use the corresponding ID
                Object.entries(record).forEach(([key, value]) => {
                    const fieldId = titleToIdMap[key] || key;  // Use mapped ID or original key
                    transformedRecord[fieldId] = value;
                });

                return transformedRecord;
            });

            // Insert bitable at the specified position with proper configuration
            const bitableNode = {
                type: 'bitable',
                attrs: {
                    fields: fields,
                    views: defaultViews,
                    currentView: defaultViews[0]?.id,
                    data: processedData
                }
            };

            // Use insertContentAt to insert at the specified position
            editor.commands.insertContentAt(params.position, bitableNode);

            return {
                success: true,
                message: `多维表格已插入到位置 ${params.position}`,
                fieldCount: fields.length,
                recordCount: processedData.length,
                recordIds: processedData.map(r => r.id),
                fieldMapping: titleToIdMap,
                position: params.position
            };
        }
    },

    // ========================================================================
    // Record Management Tools
    // ========================================================================
    {
        name: 'addBitableRecord',
        description: '向多维表格添加一条或多条新记录，数据的key可以使用字段标题或字段ID',
        inputSchema: z.object({
            bitableIndex: z.number().describe("多维表格索引"),
            records: z.array(RecordDataSchema).describe("要添加的记录数据列表，key可以是字段标题或ID")
        }),
        execute: (editor: Editor) => async (params: {
            bitableIndex: number;
            records: Array<Record<string, any>>;
        }) => {
            const bitable = findBitableByIndex(editor, params.bitableIndex);

            if (!bitable) {
                return {
                    success: false,
                    error: `找不到索引为 ${params.bitableIndex} 的多维表格`
                };
            }

            const { attrs } = bitable;
            const existingData = attrs.data || [];
            const now = new Date().toISOString();
            const startId = existingData.length + 1;

            // Build title to ID mapping from existing fields
            const titleToIdMap: Record<string, string> = {};
            (attrs.fields || []).forEach((f: FieldConfig) => {
                titleToIdMap[f.title] = f.id;
            });

            // Transform and generate record IDs
            const newRecords = params.records.map((record, idx) => {
                const transformedRecord: Record<string, any> = {
                    id: startId + idx,  // Auto-incrementing ID
                    createdTime: now,
                    updatedTime: now
                };

                // Transform each field: if key matches a title, use the corresponding ID
                Object.entries(record).forEach(([key, value]) => {
                    const fieldId = titleToIdMap[key] || key;  // Use mapped ID or original key
                    transformedRecord[fieldId] = value;
                });

                return transformedRecord;
            });

            const newData = [...existingData, ...newRecords];

            updateBitableAttrs(editor, bitable.pos, { data: newData });

            return {
                success: true,
                addedCount: newRecords.length,
                newRecordIds: newRecords.map(r => r.id),
                totalRecords: newData.length
            };
        }
    },

    {
        name: 'updateBitableRecord',
        description: '更新多维表格中的记录，更新数据的key可以使用字段标题或字段ID',
        inputSchema: z.object({
            bitableIndex: z.number().describe("多维表格索引"),
            recordId: z.union([z.string(), z.number()]).describe("要更新的记录ID（通常是数字）"),
            updates: RecordDataSchema.describe("要更新的字段值，key可以是字段标题或ID")
        }),
        execute: (editor: Editor) => async (params: {
            bitableIndex: number;
            recordId: string | number;
            updates: Record<string, any>;
        }) => {
            const bitable = findBitableByIndex(editor, params.bitableIndex);

            if (!bitable) {
                return {
                    success: false,
                    error: `找不到索引为 ${params.bitableIndex} 的多维表格`
                };
            }

            const { attrs } = bitable;
            const existingData = attrs.data || [];
            // Support both string and number record IDs
            const recordIndex = existingData.findIndex((r: any) =>
                r.id === params.recordId || r.id === Number(params.recordId) || String(r.id) === String(params.recordId)
            );

            if (recordIndex === -1) {
                return {
                    success: false,
                    error: `找不到ID为 ${params.recordId} 的记录`
                };
            }

            // Build title to ID mapping from existing fields
            const titleToIdMap: Record<string, string> = {};
            (attrs.fields || []).forEach((f: FieldConfig) => {
                titleToIdMap[f.title] = f.id;
            });

            // Transform updates: convert field titles to field IDs
            const transformedUpdates: Record<string, any> = {};
            Object.entries(params.updates).forEach(([key, value]) => {
                const fieldId = titleToIdMap[key] || key;
                transformedUpdates[fieldId] = value;
            });

            const newData = existingData.map((record: any, idx: number) => {
                if (idx === recordIndex) {
                    return {
                        ...record,
                        ...transformedUpdates,
                        updatedTime: new Date().toISOString()
                    };
                }
                return record;
            });

            updateBitableAttrs(editor, bitable.pos, { data: newData });

            return {
                success: true,
                recordId: params.recordId,
                updatedFields: Object.keys(params.updates)
            };
        }
    },

    {
        name: 'deleteBitableRecords',
        description: '删除多维表格中的一条或多条记录',
        inputSchema: z.object({
            bitableIndex: z.number().describe("多维表格索引"),
            recordIds: z.array(z.union([z.string(), z.number()])).describe("要删除的记录ID列表（通常是数字）")
        }),
        execute: (editor: Editor) => async (params: {
            bitableIndex: number;
            recordIds: (string | number)[];
        }) => {
            const bitable = findBitableByIndex(editor, params.bitableIndex);

            if (!bitable) {
                return {
                    success: false,
                    error: `找不到索引为 ${params.bitableIndex} 的多维表格`
                };
            }

            const { attrs } = bitable;
            const existingData = attrs.data || [];
            // Support both string and number record IDs
            const recordIdsSet = new Set(params.recordIds.map(id => String(id)));
            const newData = existingData.filter((r: any) => !recordIdsSet.has(String(r.id)));
            const deletedCount = existingData.length - newData.length;

            updateBitableAttrs(editor, bitable.pos, { data: newData });

            return {
                success: true,
                deletedCount,
                remainingRecords: newData.length
            };
        }
    },

    // ========================================================================
    // Field Management Tools
    // ========================================================================
    {
        name: 'addBitableField',
        description: '向多维表格添加新字段/列',
        inputSchema: z.object({
            bitableIndex: z.number().describe("多维表格索引"),
            field: FieldConfigSchema.describe("字段配置")
        }),
        execute: (editor: Editor) => async (params: {
            bitableIndex: number;
            field: {
                id?: string;
                title: string;
                type: string;
                width?: number;
                isShow?: boolean;
                options?: Array<{ id?: string; label: string; color?: string }>;
                description?: string;
            };
        }) => {
            const bitable = findBitableByIndex(editor, params.bitableIndex);

            if (!bitable) {
                return {
                    success: false,
                    error: `找不到索引为 ${params.bitableIndex} 的多维表格`
                };
            }

            const { attrs } = bitable;
            const fieldId = params.field.id || generateFieldId();

            // Process options for select fields
            const options = params.field.options?.map((opt, idx) => ({
                id: opt.id || String(idx + 1),
                label: opt.label,
                color: opt.color || '#gray'
            }));

            const newField: FieldConfig = {
                id: fieldId,
                title: params.field.title,
                type: params.field.type as FieldType,
                width: params.field.width || 150,
                isShow: params.field.isShow !== false,
                ...(options && { options }),
                ...(params.field.description && { description: params.field.description })
            };

            const newFields = [...(attrs.fields || []), newField];

            updateBitableAttrs(editor, bitable.pos, { fields: newFields });

            return {
                success: true,
                fieldId,
                fieldTitle: params.field.title,
                fieldType: params.field.type
            };
        }
    },

    {
        name: 'updateBitableField',
        description: '更新多维表格的字段配置',
        inputSchema: z.object({
            bitableIndex: z.number().describe("多维表格索引"),
            fieldId: z.string().describe("字段ID"),
            updates: z.object({
                title: z.string().optional().describe("新标题"),
                width: z.number().optional().describe("新宽度"),
                isShow: z.boolean().optional().describe("是否显示"),
                options: z.array(SelectOptionSchema).optional().describe("新选项列表"),
                description: z.string().optional().describe("字段描述")
            }).describe("要更新的属性")
        }),
        execute: (editor: Editor) => async (params: {
            bitableIndex: number;
            fieldId: string;
            updates: Partial<FieldConfig>;
        }) => {
            const bitable = findBitableByIndex(editor, params.bitableIndex);

            if (!bitable) {
                return {
                    success: false,
                    error: `找不到索引为 ${params.bitableIndex} 的多维表格`
                };
            }

            const { attrs } = bitable;
            const fieldIndex = attrs.fields?.findIndex(f => f.id === params.fieldId);

            if (fieldIndex === undefined || fieldIndex === -1) {
                return {
                    success: false,
                    error: `找不到ID为 ${params.fieldId} 的字段`
                };
            }

            const newFields = attrs.fields!.map((field, idx) => {
                if (idx === fieldIndex) {
                    return { ...field, ...params.updates };
                }
                return field;
            });

            updateBitableAttrs(editor, bitable.pos, { fields: newFields });

            return {
                success: true,
                fieldId: params.fieldId,
                updatedProperties: Object.keys(params.updates)
            };
        }
    },

    {
        name: 'deleteBitableField',
        description: '删除多维表格的字段/列（ID字段不可删除）',
        inputSchema: z.object({
            bitableIndex: z.number().describe("多维表格索引"),
            fieldId: z.string().describe("要删除的字段ID")
        }),
        execute: (editor: Editor) => async (params: {
            bitableIndex: number;
            fieldId: string;
        }) => {
            const bitable = findBitableByIndex(editor, params.bitableIndex);

            if (!bitable) {
                return {
                    success: false,
                    error: `找不到索引为 ${params.bitableIndex} 的多维表格`
                };
            }

            const { attrs } = bitable;
            const field = attrs.fields?.find(f => f.id === params.fieldId);

            if (!field) {
                return {
                    success: false,
                    error: `找不到ID为 ${params.fieldId} 的字段`
                };
            }

            if (field.type === FieldType.ID) {
                return {
                    success: false,
                    error: "ID字段不可删除"
                };
            }

            const newFields = attrs.fields!.filter(f => f.id !== params.fieldId);

            // Also remove field data from records
            const newData = (attrs.data || []).map((record: any) => {
                const { [params.fieldId]: _, ...rest } = record;
                return rest;
            });

            updateBitableAttrs(editor, bitable.pos, {
                fields: newFields,
                data: newData
            });

            return {
                success: true,
                deletedFieldId: params.fieldId,
                deletedFieldTitle: field.title
            };
        }
    },

    // ========================================================================
    // View Management Tools
    // ========================================================================
    {
        name: 'addBitableView',
        description: '向多维表格添加新视图',
        inputSchema: z.object({
            bitableIndex: z.number().describe("多维表格索引"),
            viewType: ViewTypeEnum.describe("视图类型"),
            viewName: z.string().optional().describe("视图名称，不提供则使用默认名称"),
            config: z.object({
                kanbanGroupByField: z.string().optional().describe("看板视图分组字段ID"),
                calendarDateField: z.string().optional().describe("日历视图日期字段ID"),
                timelineStartField: z.string().optional().describe("甘特图开始日期字段ID"),
                timelineEndField: z.string().optional().describe("甘特图结束日期字段ID"),
                chartType: ChartTypeEnum.optional().describe("图表类型"),
                chartXField: z.string().optional().describe("图表X轴字段ID"),
                chartAggregation: z.enum(['sum', 'count', 'avg', 'min', 'max']).optional().describe("聚合方式")
            }).optional().describe("视图特定配置")
        }),
        execute: (editor: Editor) => async (params: {
            bitableIndex: number;
            viewType: string;
            viewName?: string;
            config?: {
                kanbanGroupByField?: string;
                calendarDateField?: string;
                timelineStartField?: string;
                timelineEndField?: string;
                chartType?: string;
                chartXField?: string;
                chartAggregation?: string;
            };
        }) => {
            const bitable = findBitableByIndex(editor, params.bitableIndex);

            if (!bitable) {
                return {
                    success: false,
                    error: `找不到索引为 ${params.bitableIndex} 的多维表格`
                };
            }

            const { attrs } = bitable;
            const viewId = generateViewId();
            const viewType = params.viewType as ViewType;

            const viewTypeNames: Record<ViewType, string> = {
                [ViewType.TABLE]: '表格视图',
                [ViewType.KANBAN]: '看板视图',
                [ViewType.GALLERY]: '画廊视图',
                [ViewType.CALENDAR]: '日历视图',
                [ViewType.TIMELINE]: '甘特图视图',
                [ViewType.FORM]: '表单视图',
                [ViewType.CHART]: '图表视图'
            };

            const newView: ViewConfig = {
                id: viewId,
                name: params.viewName || viewTypeNames[viewType] || '新视图',
                type: viewType,
                filters: [],
                sorts: [],
                groups: [],
                hiddenFields: [],
                fieldOrder: []
            };

            // Add view-specific config
            if (viewType === ViewType.KANBAN && params.config?.kanbanGroupByField) {
                newView.kanbanConfig = {
                    groupByField: params.config.kanbanGroupByField
                };
            } else if (viewType === ViewType.CALENDAR && params.config?.calendarDateField) {
                newView.calendarConfig = {
                    dateField: params.config.calendarDateField
                };
            } else if (viewType === ViewType.TIMELINE) {
                newView.timelineConfig = {
                    startDateField: params.config?.timelineStartField || 'dueDate',
                    endDateField: params.config?.timelineEndField,
                    scaleUnit: 'day'
                };
            } else if (viewType === ViewType.CHART) {
                newView.chartConfig = {
                    chartType: (params.config?.chartType as ChartType) || ChartType.BAR,
                    xAxisField: params.config?.chartXField || '',
                    yAxisFields: [],
                    aggregation: (params.config?.chartAggregation as any) || 'count',
                    showLegend: true,
                    showGrid: true
                };
            } else if (viewType === ViewType.GALLERY) {
                newView.galleryConfig = {
                    coverField: '',
                    fitType: 'cover',
                    cardSize: 'medium'
                };
            }

            const newViews = [...(attrs.views || []), newView];

            updateBitableAttrs(editor, bitable.pos, {
                views: newViews,
                currentView: viewId
            });

            return {
                success: true,
                viewId,
                viewName: newView.name,
                viewType: params.viewType
            };
        }
    },

    {
        name: 'updateBitableView',
        description: '更新多维表格的视图配置',
        inputSchema: z.object({
            bitableIndex: z.number().describe("多维表格索引"),
            viewId: z.string().describe("视图ID"),
            updates: z.object({
                name: z.string().optional().describe("视图名称"),
                hiddenFields: z.array(z.string()).optional().describe("隐藏的字段ID列表"),
                fieldOrder: z.array(z.string()).optional().describe("字段显示顺序")
            }).describe("要更新的属性")
        }),
        execute: (editor: Editor) => async (params: {
            bitableIndex: number;
            viewId: string;
            updates: Partial<ViewConfig>;
        }) => {
            const bitable = findBitableByIndex(editor, params.bitableIndex);

            if (!bitable) {
                return {
                    success: false,
                    error: `找不到索引为 ${params.bitableIndex} 的多维表格`
                };
            }

            const { attrs } = bitable;
            const viewIndex = attrs.views?.findIndex(v => v.id === params.viewId);

            if (viewIndex === undefined || viewIndex === -1) {
                return {
                    success: false,
                    error: `找不到ID为 ${params.viewId} 的视图`
                };
            }

            const newViews = attrs.views!.map((view, idx) => {
                if (idx === viewIndex) {
                    return { ...view, ...params.updates };
                }
                return view;
            });

            updateBitableAttrs(editor, bitable.pos, { views: newViews });

            return {
                success: true,
                viewId: params.viewId,
                updatedProperties: Object.keys(params.updates)
            };
        }
    },

    {
        name: 'deleteBitableView',
        description: '删除多维表格的视图（至少保留一个视图）',
        inputSchema: z.object({
            bitableIndex: z.number().describe("多维表格索引"),
            viewId: z.string().describe("要删除的视图ID")
        }),
        execute: (editor: Editor) => async (params: {
            bitableIndex: number;
            viewId: string;
        }) => {
            const bitable = findBitableByIndex(editor, params.bitableIndex);

            if (!bitable) {
                return {
                    success: false,
                    error: `找不到索引为 ${params.bitableIndex} 的多维表格`
                };
            }

            const { attrs } = bitable;

            if ((attrs.views?.length || 0) <= 1) {
                return {
                    success: false,
                    error: "至少需要保留一个视图"
                };
            }

            const viewToDelete = attrs.views?.find(v => v.id === params.viewId);
            if (!viewToDelete) {
                return {
                    success: false,
                    error: `找不到ID为 ${params.viewId} 的视图`
                };
            }

            const newViews = attrs.views!.filter(v => v.id !== params.viewId);
            const newCurrentView = attrs.currentView === params.viewId
                ? newViews[0]?.id
                : attrs.currentView;

            updateBitableAttrs(editor, bitable.pos, {
                views: newViews,
                currentView: newCurrentView
            });

            return {
                success: true,
                deletedViewId: params.viewId,
                deletedViewName: viewToDelete.name,
                remainingViews: newViews.length
            };
        }
    },

    {
        name: 'switchBitableView',
        description: '切换多维表格的当前视图',
        inputSchema: z.object({
            bitableIndex: z.number().describe("多维表格索引"),
            viewId: z.string().describe("要切换到的视图ID")
        }),
        execute: (editor: Editor) => async (params: {
            bitableIndex: number;
            viewId: string;
        }) => {
            const bitable = findBitableByIndex(editor, params.bitableIndex);

            if (!bitable) {
                return {
                    success: false,
                    error: `找不到索引为 ${params.bitableIndex} 的多维表格`
                };
            }

            const { attrs } = bitable;
            const view = attrs.views?.find(v => v.id === params.viewId);

            if (!view) {
                return {
                    success: false,
                    error: `找不到ID为 ${params.viewId} 的视图`
                };
            }

            updateBitableAttrs(editor, bitable.pos, { currentView: params.viewId });

            return {
                success: true,
                currentViewId: params.viewId,
                currentViewName: view.name,
                currentViewType: view.type
            };
        }
    }
];
