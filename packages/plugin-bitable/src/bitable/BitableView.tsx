import React, { useState, useCallback, useMemo } from "react";
import { NodeViewProps, NodeViewWrapper } from "@kn/editor";
import { useTranslation } from "@kn/common";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@kn/ui";
import { Button, IconButton } from "@kn/ui";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@kn/ui";
import {
    Plus,
    MoreVertical,
    Settings,
    Trash2,
    Table2,
    LayoutGrid,
    Calendar,
    KanbanSquare,
    ImageIcon,
    GanttChartSquare
} from "@kn/icon";
import { BitableAttrs, ViewType, ViewConfig, FieldConfig, RecordData } from "../types";
import { TableView } from "./views/TableView";
import { KanbanView } from "./views/KanbanView";
import { GalleryView } from "./views/GalleryView";
import { TimelineView } from "./views/TimelineView";
import { CalendarView } from "./views/CalendarView";
import { FieldConfigPanel } from "./components/FieldConfigPanel";
import { generateRecordId, generateViewId } from "../utils/id";

export const BitableView: React.FC<NodeViewProps> = (props) => {
    const { node, updateAttributes, deleteNode, editor } = props;
    const attrs = node.attrs as BitableAttrs;
    const { t } = useTranslation();

    const [data, setData] = useState<RecordData[]>(attrs.data || []);
    const [currentViewId, setCurrentViewId] = useState(attrs.currentView);
    const [fieldConfigOpen, setFieldConfigOpen] = useState(false);

    // 获取当前视图
    const currentView: any = useMemo(() => {
        return attrs.views.find(v => v.id === currentViewId) || attrs.views[0];
    }, [attrs.views, currentViewId]);

    // 添加记录
    const handleAddRecord = useCallback(() => {
        const newRecord: RecordData = {
            id: generateRecordId(),
            createdTime: new Date().toISOString(),
            updatedTime: new Date().toISOString(),
        };

        // 为每个字段设置默认值
        attrs.fields.forEach(field => {
            switch (field.type) {
                case 'checkbox':
                    newRecord[field.id] = false;
                    break;
                case 'progress':
                case 'number':
                case 'rating':
                    newRecord[field.id] = 0;
                    break;
                case 'multi_select':
                    newRecord[field.id] = [];
                    break;
                case 'id':
                    newRecord[field.id] = data.length + 1;
                    break;
                default:
                    newRecord[field.id] = null;
            }
        });

        const newData = [...data, newRecord];
        setData(newData);
        updateAttributes({ ...attrs, data: newData });
    }, [data, attrs, updateAttributes]);

    // 更新记录
    const handleUpdateRecord = useCallback((recordId: string, updates: Partial<RecordData>) => {
        const newData = data.map(record =>
            record.id === recordId
                ? { ...record, ...updates, updatedTime: new Date().toISOString() }
                : record
        );
        setData(newData);
        updateAttributes({ ...attrs, data: newData });
    }, [data, attrs, updateAttributes]);

    // 删除记录
    const handleDeleteRecord = useCallback((recordIds: string[]) => {
        const newData = data.filter(record => !recordIds.includes(record.id));
        setData(newData);
        updateAttributes({ ...attrs, data: newData });
    }, [data, attrs, updateAttributes]);

    // 添加字段
    const handleAddField = useCallback((field: FieldConfig) => {
        const newFields = [...attrs.fields, field];
        updateAttributes({ ...attrs, fields: newFields });
    }, [attrs, updateAttributes]);

    // 更新字段
    const handleUpdateField = useCallback((fieldId: string, updates: Partial<FieldConfig>) => {
        const newFields = attrs.fields.map(field =>
            field.id === fieldId ? { ...field, ...updates } : field
        );
        updateAttributes({ ...attrs, fields: newFields });
    }, [attrs, updateAttributes]);

    // 删除字段
    const handleDeleteField = useCallback((fieldId: string) => {
        const newFields = attrs.fields.filter(field => field.id !== fieldId);
        // 同时从数据中删除该字段
        const newData: RecordData[] = data.map(record => {
            const { [fieldId]: _, ...rest } = record;
            return rest;
        }) as RecordData[];
        setData(newData);
        updateAttributes({ ...attrs, fields: newFields, data: newData });
    }, [attrs, data, updateAttributes]);

    // 重新排列字段
    const handleReorderFields = useCallback((newOrder: FieldConfig[]) => {
        updateAttributes({ ...attrs, fields: newOrder });
    }, [attrs, updateAttributes]);

    // 添加视图
    const handleAddView = useCallback((viewType: ViewType) => {
        const newView: ViewConfig = {
            id: generateViewId(),
            name: getViewTypeName(viewType, t),
            type: viewType,
            filters: [],
            sorts: [],
            groups: [],
            hiddenFields: [],
            fieldOrder: [],
        };

        if (viewType === ViewType.KANBAN) {
            newView.kanbanConfig = {
                groupByField: attrs.fields.find(f => f.type === 'select')?.id || attrs.fields[0]!.id
            };
        } else if (viewType === ViewType.GALLERY) {
            newView.galleryConfig = {
                coverField: '',
                fitType: 'cover',
                cardSize: 'medium'
            };
        } else if (viewType === ViewType.TIMELINE) {
            newView.timelineConfig = {
                startDateField: attrs.fields.find(f => f.type === 'date')?.id || 'dueDate',
                endDateField: undefined,
                titleField: attrs.fields.find(f => f.type === 'text')?.id,
                progressField: attrs.fields.find(f => f.type === 'progress')?.id,
                groupByField: attrs.fields.find(f => f.type === 'select')?.id,
                scaleUnit: 'day'
            };
        } else if (viewType === ViewType.CALENDAR) {
            newView.calendarConfig = {
                dateField: attrs.fields.find(f => f.type === 'date')?.id || '',
                endDateField: undefined,
                titleField: attrs.fields.find(f => f.type === 'text')?.id
            };
        }

        const newViews = [...attrs.views, newView];
        updateAttributes({ ...attrs, views: newViews, currentView: newView.id });
        setCurrentViewId(newView.id);
    }, [attrs, updateAttributes]);

    // 删除视图
    const handleDeleteView = useCallback((viewId: string) => {
        const newViews = attrs.views.filter(v => v.id !== viewId);
        if (newViews.length === 0) {
            // 至少保留一个视图
            return;
        }
        const newCurrentView = currentViewId === viewId ? newViews[0]!.id : currentViewId;
        setCurrentViewId(newCurrentView);
        updateAttributes({ ...attrs, views: newViews, currentView: newCurrentView });
    }, [attrs, currentViewId, updateAttributes]);

    // 更新视图
    const handleUpdateView = useCallback((viewId: string, updates: Partial<ViewConfig>) => {
        const newViews = attrs.views.map(v =>
            v.id === viewId ? { ...v, ...updates } : v
        );
        updateAttributes({ ...attrs, views: newViews });
    }, [attrs, updateAttributes]);

    // 渲染视图内容
    const renderViewContent = () => {
        const viewProps = {
            view: currentView,
            fields: attrs.fields,
            data: data,
            onAddRecord: handleAddRecord,
            onUpdateRecord: handleUpdateRecord,
            onDeleteRecord: handleDeleteRecord,
            onAddField: handleAddField,
            onUpdateField: handleUpdateField,
            onDeleteField: handleDeleteField,
            onUpdateView: handleUpdateView,
            editable: editor.isEditable,
        };

        switch (currentView?.type) {
            case ViewType.TABLE:
                return <TableView {...viewProps} />;
            case ViewType.KANBAN:
                return <KanbanView {...viewProps} />;
            case ViewType.GALLERY:
                return <GalleryView {...viewProps} />;
            case ViewType.TIMELINE:
                return <TimelineView {...viewProps} />;
            case ViewType.CALENDAR:
                return <CalendarView {...viewProps} editor={editor} />;
            default:
                return <TableView {...viewProps} />;
        }
    };

    // 获取视图类型图标
    const getViewIcon = (type: ViewType) => {
        switch (type) {
            case ViewType.TABLE:
                return <Table2 className="h-4 w-4" />;
            case ViewType.KANBAN:
                return <KanbanSquare className="h-4 w-4" />;
            case ViewType.GALLERY:
                return <ImageIcon className="h-4 w-4" />;
            case ViewType.CALENDAR:
                return <Calendar className="h-4 w-4" />;
            case ViewType.TIMELINE:
                return <GanttChartSquare className="h-4 w-4" />;
            default:
                return <Table2 className="h-4 w-4" />;
        }
    };

    return (
        <NodeViewWrapper className="node-bitable-wrapper" contentEditable={false}>
            <div className="min-h-[400px] w-full rounded-md border bg-background p-4">
                <div className="flex items-center justify-between mb-4">
                    {/* 视图标签页 */}
                    <div className="flex items-center gap-2">
                        {attrs.views.map((view) => (
                            <div
                                key={view.id}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors ${currentViewId === view.id
                                    ? 'bg-primary text-primary-foreground'
                                    : 'hover:bg-muted'
                                    }`}
                                onClick={() => {
                                    setCurrentViewId(view.id);
                                    updateAttributes({ ...attrs, currentView: view.id });
                                }}
                            >
                                {getViewIcon(view.type)}
                                <span className="text-sm font-medium">{view.name}</span>
                                {editor.isEditable && attrs.views.length > 1 && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                            <MoreVertical className="h-3 w-3" />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuItem onClick={() => handleDeleteView(view.id)}>
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                {t('bitable.actions.deleteView')}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>
                        ))}

                        {/* 添加视图按钮 */}
                        {editor.isEditable && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button size="icon" variant="outline" className="h-5 w-5">
                                        <Plus className="h-3 w-3" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuLabel>{t('bitable.actions.addView')}</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => handleAddView(ViewType.TABLE)}>
                                        <Table2 className="h-4 w-4 mr-2" />
                                        {t('bitable.views.table')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleAddView(ViewType.KANBAN)}>
                                        <KanbanSquare className="h-4 w-4 mr-2" />
                                        {t('bitable.views.kanban')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleAddView(ViewType.GALLERY)}>
                                        <ImageIcon className="h-4 w-4 mr-2" />
                                        {t('bitable.views.gallery')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleAddView(ViewType.TIMELINE)}>
                                        <GanttChartSquare className="h-4 w-4 mr-2" />
                                        {t('bitable.views.timeline')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleAddView(ViewType.CALENDAR)}>
                                        <Calendar className="h-4 w-4 mr-2" />
                                        {t('bitable.views.calendar')}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>

                    {/* 操作按钮 */}
                    {editor.isEditable && (
                        <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => setFieldConfigOpen(true)}>
                                <Settings className="h-4 w-4 mr-1" />
                                {t('bitable.actions.configureColumns')}
                            </Button>
                            <Button size="sm" variant="outline" onClick={handleAddRecord}>
                                <Plus className="h-4 w-4 mr-1" />
                                {t('bitable.actions.addRecord')}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={deleteNode}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </div>

                {/* 视图内容 */}
                <div className="mt-4">
                    {renderViewContent()}
                </div>

                {/* 底部统计 */}
                <div className="mt-4 text-sm text-muted-foreground">
                    {t('bitable.stats.totalRecords', { count: data.length })}
                </div>
            </div>

            {/* 字段配置面板 */}
            <FieldConfigPanel
                open={fieldConfigOpen}
                onOpenChange={setFieldConfigOpen}
                fields={attrs.fields}
                onUpdateField={handleUpdateField}
                onDeleteField={handleDeleteField}
                onAddField={handleAddField}
                onReorderFields={handleReorderFields}
            />
        </NodeViewWrapper>
    );
};

// 辅助函数
function getViewTypeName(type: ViewType, t: (key: string) => string): string {
    switch (type) {
        case ViewType.TABLE:
            return t('bitable.views.table');
        case ViewType.KANBAN:
            return t('bitable.views.kanban');
        case ViewType.GALLERY:
            return t('bitable.views.gallery');
        case ViewType.CALENDAR:
            return t('bitable.views.calendar');
        case ViewType.TIMELINE:
            return t('bitable.views.timeline');
        default:
            return t('bitable.views.default');
    }
}
