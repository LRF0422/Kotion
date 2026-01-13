import { PMNode as Node, ReactNodeViewRenderer, mergeAttributes } from "@kn/editor";
import { BitableView } from "./BitableView";
import { FieldType, ViewType } from "../types";
import { uuidv4 } from "lib0/random";

declare module '@kn/editor' {
    interface Commands<ReturnType> {
        bitable: {
            insertBitable: (fields?: string[]) => ReturnType;
        };
    }
}

// 默认字段配置
const getDefaultFields = (customFields?: string[]) => {
    const defaultFields = [
        {
            id: 'id',
            title: 'ID',
            type: FieldType.ID,
            width: 80,
            isShow: true,
        },
        {
            id: 'name',
            title: '名称',
            type: FieldType.TEXT,
            width: 200,
            isShow: true,
        },
        {
            id: 'status',
            title: '状态',
            type: FieldType.SELECT,
            width: 150,
            isShow: true,
            options: [
                { id: '1', label: '未开始', color: '#gray' },
                { id: '2', label: '进行中', color: '#blue' },
                { id: '3', label: '已完成', color: '#green' },
            ]
        },
        {
            id: 'priority',
            title: '优先级',
            type: FieldType.SELECT,
            width: 120,
            isShow: true,
            options: [
                { id: '1', label: '低', color: '#green' },
                { id: '2', label: '中', color: '#yellow' },
                { id: '3', label: '高', color: '#red' },
            ]
        },
        {
            id: 'assignee',
            title: '负责人',
            type: FieldType.PERSON,
            width: 150,
            isShow: true,
        },
        {
            id: 'dueDate',
            title: '截止日期',
            type: FieldType.DATE,
            width: 150,
            isShow: true,
        },
        {
            id: 'progress',
            title: '进度',
            type: FieldType.PROGRESS,
            width: 150,
            isShow: true,
        },
    ];

    // 如果提供了自定义字段名，添加它们
    if (customFields && customFields.length > 0) {
        customFields.forEach(fieldName => {
            defaultFields.push({
                id: uuidv4(),
                title: fieldName,
                type: FieldType.TEXT,
                width: 150,
                isShow: true,
            });
        });
    }

    return defaultFields;
};

// 默认视图配置
const getDefaultViews = () => [
    {
        id: uuidv4(),
        name: '表格视图',
        type: ViewType.TABLE,
        filters: [],
        sorts: [],
        groups: [],
        hiddenFields: [],
        fieldOrder: [],
    },
    {
        id: uuidv4(),
        name: '看板视图',
        type: ViewType.KANBAN,
        filters: [],
        sorts: [],
        groups: [],
        hiddenFields: [],
        fieldOrder: [],
        kanbanConfig: {
            groupByField: 'status',
        }
    },
    {
        id: uuidv4(),
        name: '画廊视图',
        type: ViewType.GALLERY,
        filters: [],
        sorts: [],
        groups: [],
        hiddenFields: [],
        fieldOrder: [],
        galleryConfig: {
            coverField: '',
            fitType: 'cover',
            cardSize: 'medium',
        }
    }
];

export const Bitable = Node.create({
    name: "bitable",
    group: "block",
    atom: true,

    addAttributes() {
        return {
            fields: {
                default: getDefaultFields(),
            },
            views: {
                default: getDefaultViews(),
            },
            currentView: {
                default: getDefaultViews()[0].id,
            },
            data: {
                default: [],
            }
        };
    },

    renderHTML({ HTMLAttributes }) {
        return ["div", mergeAttributes(HTMLAttributes, { class: "node-bitable" }), 0];
    },

    parseHTML() {
        return [
            {
                tag: 'div[class=node-bitable]'
            }
        ];
    },

    addNodeView() {
        return ReactNodeViewRenderer(BitableView, {
            stopEvent: () => true
        });
    },

    addCommands() {
        return {
            insertBitable: (customFields?: string[]) => ({ commands }) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: {
                        fields: getDefaultFields(customFields),
                        views: getDefaultViews(),
                        currentView: getDefaultViews()[0].id,
                        data: []
                    }
                });
            }
        };
    }
});
