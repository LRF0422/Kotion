import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { NodeViewProps, NodeViewWrapper } from "@kn/editor";
import { useTranslation } from "@kn/common";
import { Button, Input } from "@kn/ui";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@kn/ui";
import {
    Plus,
    MoreVertical,
    Settings,
    Trash2,
    Table2,
    Calendar,
    KanbanSquare,
    ImageIcon,
    GanttChartSquare,
    BarChart3,
    Upload,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Search,
    Zap,
    EyeOff,
    Pencil,
    Check,
    X,
    MoreHorizontal
} from "@kn/icon";
import { BitableAttrs, ViewType, ViewConfig, FieldConfig, RecordData, ChartType, FieldType, SelectOption } from "../types";
import { TableView } from "./views/TableView";
import { KanbanView } from "./views/KanbanView";
import { GalleryView } from "./views/GalleryView";
import { TimelineView } from "./views/TimelineView";
import { CalendarView } from "./views/CalendarView";
import { ChartView } from "./views/ChartView";
import { FieldConfigPanel } from "./components/FieldConfigPanel";
import { ExcelImportDialog } from "./components/ExcelImportDialog";
import { generateRecordId, generateViewId } from "../utils/id";
import { convertFieldValue, generateSelectOptionsFromData } from "../utils/fieldConversion";
import { applyFilters, applySorts, applyGroups } from "../utils/dataProcessing";
import { SortPanel } from "./components/SortPanel";
import { FilterPanel } from "./components/FilterPanel";
import { GroupPanel } from "./components/GroupPanel";
import { RecordDetailModal } from "./components/RecordDetailModal";

export const BitableView: React.FC<NodeViewProps> = (props) => {
    const { node, updateAttributes, deleteNode, editor } = props;
    const attrs = node.attrs as BitableAttrs;
    const { t } = useTranslation();

    // Keep a ref to the latest attrs so update handlers can read current
    // data/fields/views without listing `attrs` as a dependency. Depending on
    // `attrs` would recreate every callback whenever any attribute changes and
    // cascade re-renders through all child views.
    const attrsRef = useRef(attrs);
    attrsRef.current = attrs;

    const data: RecordData[] = attrs.data || [];
    const [currentViewId, setCurrentViewId] = useState(attrs.currentView);
    const [fieldConfigOpen, setFieldConfigOpen] = useState(false);
    const [excelImportOpen, setExcelImportOpen] = useState(false);
    // 搜索状态
    const [showSearch, setShowSearch] = useState(false);
    const [searchText, setSearchText] = useState('');

    // Record detail
    const [selectedRecord, setSelectedRecord] = useState<RecordData | null>(null);

    // 视图编辑状态
    const [editingViewId, setEditingViewId] = useState<string | null>(null);
    const [editingViewName, setEditingViewName] = useState('');
    const [deleteViewId, setDeleteViewId] = useState<string | null>(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    // Synchronize local state with node attributes when they change
    useEffect(() => {
        setCurrentViewId(attrs.currentView);
    }, [attrs.currentView]);

    // 视图标签页滚动状态
    const viewTabsRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    // 检查滚动状态
    const checkScrollState = useCallback(() => {
        const container = viewTabsRef.current;
        if (container) {
            setCanScrollLeft(container.scrollLeft > 0);
            setCanScrollRight(
                container.scrollLeft < container.scrollWidth - container.clientWidth - 1
            );
        }
    }, []);

    // 监听滚动和视图变化
    useEffect(() => {
        checkScrollState();
        const container = viewTabsRef.current;
        if (container) {
            container.addEventListener('scroll', checkScrollState);
            // 使用 ResizeObserver 监听容器大小变化
            const resizeObserver = new ResizeObserver(checkScrollState);
            resizeObserver.observe(container);
            return () => {
                container.removeEventListener('scroll', checkScrollState);
                resizeObserver.disconnect();
            };
        }
    }, [checkScrollState, attrs.views.length]);

    // 滚动视图标签页
    const scrollViewTabs = useCallback((direction: 'left' | 'right') => {
        const container = viewTabsRef.current;
        if (container) {
            const scrollAmount = 150;
            container.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    }, []);

    // 获取当前视图
    const currentView: ViewConfig = useMemo(() => {
        return attrs.views.find(v => v.id === currentViewId) || attrs.views[0];
    }, [attrs.views, currentViewId]);

    // 添加记录
    const handleAddRecord = useCallback(() => {
        // Read the latest attrs from the ref to avoid stale closures.
        const { data: currentData = [], fields } = attrsRef.current;
        const newRecord: RecordData = {
            id: generateRecordId(),
            createdTime: new Date().toISOString(),
            updatedTime: new Date().toISOString(),
        };

        // 为每个字段设置默认值
        fields.forEach(field => {
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
                    const existingIds = currentData.map((r: RecordData) => Number(r[field.id]) || 0);
                    newRecord[field.id] = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
                    break;
                default:
                    newRecord[field.id] = null;
            }
        });

        const newData = [...currentData, newRecord];
        updateAttributes({ data: newData });
    }, [updateAttributes]);

    // 更新记录
    const handleUpdateRecord = useCallback((recordId: string, updates: Partial<RecordData>) => {
        // Read the latest attrs from the ref to avoid stale closures.
        const currentData = attrsRef.current.data || [];
        const newData = currentData.map((record: any) =>
            record.id === recordId
                ? { ...record, ...updates, updatedTime: new Date().toISOString() }
                : record
        );
        updateAttributes({ data: newData });

        // Keep selectedRecord in sync with updated data
        if (selectedRecord?.id === recordId) {
            const updatedRecord = newData.find((r: any) => r.id === recordId);
            if (updatedRecord) {
                setSelectedRecord(updatedRecord);
            }
        }
    }, [updateAttributes, selectedRecord?.id]);

    // 批量更新记录 - avoids race condition when multiple records are updated simultaneously
    const handleBatchUpdateRecords = useCallback((updatesMap: Map<string, Partial<RecordData>>) => {
        const currentData = attrsRef.current.data || [];
        const now = new Date().toISOString();
        const newData = currentData.map((record: any) => {
            const recordUpdates = updatesMap.get(record.id);
            if (recordUpdates) {
                return { ...record, ...recordUpdates, updatedTime: now };
            }
            return record;
        });
        updateAttributes({ data: newData });
    }, [updateAttributes]);

    // 删除记录
    const handleDeleteRecord = useCallback((recordIds: string[]) => {
        const currentData = attrsRef.current.data || [];
        const newData = currentData.filter((record: any) => !recordIds.includes(record.id));
        updateAttributes({ data: newData });
    }, [updateAttributes]);

    // 添加字段
    const handleAddField = useCallback((field: FieldConfig) => {
        const newFields = [...attrsRef.current.fields, field];
        updateAttributes({ fields: newFields });
    }, [updateAttributes]);

    // 更新字段
    const handleUpdateField = useCallback((fieldId: string, updates: Partial<FieldConfig>) => {
        const newFields = attrsRef.current.fields.map(field =>
            field.id === fieldId ? { ...field, ...updates } : field
        );
        updateAttributes({ fields: newFields });
    }, [updateAttributes]);

    // 删除字段
    const handleDeleteField = useCallback((fieldId: string) => {
        const { data: currentData = [], fields } = attrsRef.current;
        const newFields = fields.filter(field => field.id !== fieldId);
        // 同时从数据中删除该字段
        const newData: RecordData[] = currentData.map((record: any) => {
            const { [fieldId]: _, ...rest } = record;
            return rest;
        }) as RecordData[];
        updateAttributes({ fields: newFields, data: newData });
    }, [updateAttributes]);

    // 重新排列字段
    const handleReorderFields = useCallback((newOrder: FieldConfig[]) => {
        updateAttributes({ fields: newOrder });
    }, [updateAttributes]);

    // 转换字段类型
    const handleConvertFieldType = useCallback((fieldId: string, newType: FieldType, newOptions?: SelectOption[]) => {
        const { data: currentData = [], fields } = attrsRef.current;
        const field = fields.find(f => f.id === fieldId);
        if (!field) return;

        const oldType = field.type;

        // Update field configuration
        const updatedField: FieldConfig = {
            ...field,
            type: newType,
        };

        // Handle options for select types
        if (newType === FieldType.SELECT || newType === FieldType.MULTI_SELECT) {
            // If options are provided, use them
            if (newOptions && newOptions.length > 0) {
                updatedField.options = newOptions;
            } else {
                // Otherwise, auto-generate from existing data
                const generatedOptions = generateSelectOptionsFromData(currentData, fieldId, oldType);
                updatedField.options = generatedOptions.length > 0 ? generatedOptions : newOptions || [];
            }
        } else {
            // Remove options if not a select type
            delete updatedField.options;
        }

        // Update field in fields array
        const newFields = fields.map(f =>
            f.id === fieldId ? updatedField : f
        );

        // Convert all existing data
        const newData = currentData.map((record: any) => {
            const value = record[fieldId];
            const convertedValue = convertFieldValue(value, oldType, newType, updatedField);
            return {
                ...record,
                [fieldId]: convertedValue,
            };
        });

        updateAttributes({ fields: newFields, data: newData });
    }, [updateAttributes]);

    // 从 Excel 导入数据
    const handleExcelImport = useCallback((newFields: FieldConfig[], newRecords: RecordData[]) => {
        const { data: currentData = [], fields } = attrsRef.current;
        // 合并新字段
        const mergedFields = [...fields, ...newFields];

        // 为新记录添加ID字段
        const idField = fields.find(f => f.type === 'id');
        const startId = currentData.length + 1;
        const recordsWithId = newRecords.map((record, index) => ({
            ...record,
            [idField?.id || 'id']: startId + index,
        }));

        // 合并数据
        const mergedData = [...currentData, ...recordsWithId];

        updateAttributes({
            fields: mergedFields,
            data: mergedData
        });
    }, [updateAttributes]);

    // 添加视图
    const handleAddView = useCallback((viewType: ViewType) => {
        const { fields, views } = attrsRef.current;
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
                groupByField: fields.find(f => f.type === 'select')?.id || fields[0]!.id
            };
        } else if (viewType === ViewType.GALLERY) {
            newView.galleryConfig = {
                coverField: '',
                fitType: 'cover',
                cardSize: 'medium'
            };
        } else if (viewType === ViewType.TIMELINE) {
            newView.timelineConfig = {
                startDateField: fields.find(f => f.type === 'date')?.id || 'dueDate',
                endDateField: undefined,
                titleField: fields.find(f => f.type === 'text')?.id,
                progressField: fields.find(f => f.type === 'progress')?.id,
                groupByField: fields.find(f => f.type === 'select')?.id,
                scaleUnit: 'day'
            };
        } else if (viewType === ViewType.CALENDAR) {
            newView.calendarConfig = {
                dateField: fields.find(f => f.type === 'date')?.id || '',
                endDateField: undefined,
                titleField: fields.find(f => f.type === 'text')?.id
            };
        } else if (viewType === ViewType.CHART) {
            newView.chartConfig = {
                chartType: ChartType.BAR,
                xAxisField: fields.find(f => f.type === 'text' || f.type === 'select')?.id || '',
                yAxisFields: [],
                title: '',
                description: '',
                showLegend: true,
                showGrid: true,
                aggregation: 'count',
            };
        }

        const newViews = [...views, newView];
        updateAttributes({ views: newViews, currentView: newView.id });
        setCurrentViewId(newView.id);
    }, [updateAttributes, t]);

    // 删除视图
    const handleDeleteView = useCallback((viewId: string) => {
        const newViews = attrsRef.current.views.filter(v => v.id !== viewId);
        if (newViews.length === 0) {
            // 至少保留一个视图
            return;
        }
        const newCurrentView = currentViewId === viewId ? newViews[0]!.id : currentViewId;
        setCurrentViewId(newCurrentView);
        updateAttributes({ views: newViews, currentView: newCurrentView });
    }, [currentViewId, updateAttributes]);

    // 打开删除确认对话框
    const openDeleteDialog = useCallback((viewId: string) => {
        setDeleteViewId(viewId);
        setShowDeleteDialog(true);
    }, []);

    // 确认删除视图
    const confirmDeleteView = useCallback(() => {
        if (deleteViewId) {
            handleDeleteView(deleteViewId);
            setShowDeleteDialog(false);
            setDeleteViewId(null);
        }
    }, [deleteViewId, handleDeleteView]);

    // 开始编辑视图名称
    const startEditingView = useCallback((viewId: string, currentName: string) => {
        setEditingViewId(viewId);
        setEditingViewName(currentName);
    }, []);

    // 保存视图名称
    const saveViewName = useCallback(() => {
        if (editingViewId && editingViewName.trim()) {
            const newViews = attrsRef.current.views.map(v =>
                v.id === editingViewId ? { ...v, name: editingViewName.trim() } : v
            );
            updateAttributes({ views: newViews });
        }
        setEditingViewId(null);
        setEditingViewName('');
    }, [editingViewId, editingViewName, updateAttributes]);

    // 取消编辑视图名称
    const cancelEditingView = useCallback(() => {
        setEditingViewId(null);
        setEditingViewName('');
    }, []);

    // 更新视图
    const handleUpdateView = useCallback((viewId: string, updates: Partial<ViewConfig>) => {
        const newViews = attrsRef.current.views.map(v =>
            v.id === viewId ? { ...v, ...updates } : v
        );
        updateAttributes({ views: newViews });
    }, [updateAttributes]);

    // Apply filters and sorts to data
    const processedData = useMemo(() => {
        let result = data;
        if (currentView?.filters?.length) {
            result = applyFilters(result, currentView.filters, attrs.fields);
        }
        if (currentView?.sorts?.length) {
            result = applySorts(result, currentView.sorts, attrs.fields);
        }
        return result;
    }, [data, currentView?.filters, currentView?.sorts, attrs.fields]);

    // Apply groups to processed data
    const groupedData = useMemo(() => {
        if (!currentView?.groups?.length) return undefined;
        return applyGroups(processedData, currentView.groups, attrs.fields);
    }, [processedData, currentView?.groups, attrs.fields]);

    // 渲染视图内容
    const renderViewContent = () => {
        const viewProps = {
            view: currentView,
            fields: attrs.fields,
            data: processedData,
            onAddRecord: handleAddRecord,
            onUpdateRecord: handleUpdateRecord,
            onBatchUpdateRecords: handleBatchUpdateRecords,
            onDeleteRecord: handleDeleteRecord,
            onAddField: handleAddField,
            onUpdateField: handleUpdateField,
            onDeleteField: handleDeleteField,
            onUpdateView: handleUpdateView,
            editable: editor.isEditable,
            editor: editor,
            onRecordClick: (record: RecordData) => setSelectedRecord(record),
        };

        switch (currentView?.type) {
            case ViewType.TABLE:
                return <TableView {...viewProps} searchText={searchText} groups={groupedData} />;
            case ViewType.KANBAN:
                return <KanbanView {...viewProps} />;
            case ViewType.GALLERY:
                return <GalleryView {...viewProps} />;
            case ViewType.TIMELINE:
                return <TimelineView {...viewProps} />;
            case ViewType.CALENDAR:
                return <CalendarView {...viewProps} editor={editor} />;
            case ViewType.CHART:
                return <ChartView {...viewProps} />;
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
            case ViewType.CHART:
                return <BarChart3 className="h-4 w-4" />;
            default:
                return <Table2 className="h-4 w-4" />;
        }
    };

    return (
        <NodeViewWrapper className="node-bitable-wrapper">
            <div className="bitable-container min-h-[400px] w-full rounded-lg bg-transparent text-gray-900 dark:text-white">
                {/* 视图标签页和工具栏（左内边距与表格单元格内容对齐：8px） */}
                <div className="flex items-center justify-between gap-1 pl-2 pr-2 py-1.5 md:pr-4 md:py-2 border-b border-gray-200 dark:border-border">
                    {/* 左侧：视图标签 */}
                    <div className="flex items-center gap-1 min-w-0">
                        {/* 左滚动按钮 */}
                        {canScrollLeft && (
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 flex-shrink-0 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-accent"
                                onClick={() => scrollViewTabs('left')}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                        )}

                        {/* 视图标签容器 */}
                        <div
                            ref={viewTabsRef}
                            className="flex items-center gap-1 overflow-x-auto scrollbar-none"
                            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                        >
                            {attrs.views.map((view) => (
                                <div
                                    key={view.id}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer transition-all whitespace-nowrap flex-shrink-0 text-sm ${currentViewId === view.id
                                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-[#ffffff08]'
                                        }`}
                                    onClick={() => {
                                        if (editingViewId !== view.id) {
                                            setCurrentViewId(view.id);
                                            updateAttributes({ currentView: view.id });
                                        }
                                    }}
                                    onDoubleClick={() => {
                                        if (editor.isEditable && currentViewId === view.id) {
                                            startEditingView(view.id, view.name);
                                        }
                                    }}
                                >
                                    {getViewIcon(view.type)}
                                    {editingViewId === view.id ? (
                                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                            <Input
                                                value={editingViewName}
                                                onChange={(e) => setEditingViewName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        saveViewName();
                                                    } else if (e.key === 'Escape') {
                                                        cancelEditingView();
                                                    }
                                                }}
                                                onBlur={saveViewName}
                                                autoFocus
                                                className="h-6 w-32 px-2 text-sm"
                                            />
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-5 w-5"
                                                onClick={saveViewName}
                                            >
                                                <Check className="h-3 w-3" />
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-5 w-5"
                                                onClick={cancelEditingView}
                                            >
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <span>{view.name}</span>
                                    )}
                                    {editor.isEditable && currentViewId === view.id && editingViewId !== view.id && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                <MoreVertical className="h-3 w-3 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white" />
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent>
                                                <DropdownMenuItem onClick={() => startEditingView(view.id, view.name)}>
                                                    <Pencil className="h-4 w-4 mr-2" />
                                                    {t('bitable.actions.renameView')}
                                                </DropdownMenuItem>
                                                {attrs.views.length > 1 && (
                                                    <DropdownMenuItem
                                                        onClick={() => openDeleteDialog(view.id)}
                                                        className="text-red-600 dark:text-red-400"
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                        {t('bitable.actions.deleteView')}
                                                    </DropdownMenuItem>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </div>
                            ))}

                            {/* 添加视图按钮 */}
                            {editor.isEditable && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-accent">
                                            <Plus className="h-4 w-4" />
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
                                        <DropdownMenuItem onClick={() => handleAddView(ViewType.CHART)}>
                                            <BarChart3 className="h-4 w-4 mr-2" />
                                            {t('bitable.views.chart')}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>

                        {/* 右滚动按钮 */}
                        {canScrollRight && (
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 flex-shrink-0 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-accent"
                                onClick={() => scrollViewTabs('right')}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        )}
                    </div>

                    {/* 右侧：工具栏 */}
                    <div className="flex items-center gap-0.5 md:gap-1 flex-shrink-0">
                        {/* 隐藏字段（移动端并入“更多”菜单，与设置重复） */}
                        <Button
                            size="icon"
                            variant="ghost"
                            className="hidden md:inline-flex h-8 w-8 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-accent"
                            onClick={() => setFieldConfigOpen(true)}
                        >
                            <EyeOff className="h-4 w-4" />
                        </Button>

                        {/* 分组 */}
                        <GroupPanel
                            view={currentView}
                            fields={attrs.fields}
                            onUpdateView={handleUpdateView}
                        />

                        {/* 排序 */}
                        <SortPanel
                            view={currentView}
                            fields={attrs.fields}
                            onUpdateView={handleUpdateView}
                        />

                        {/* 筛选 */}
                        <FilterPanel
                            view={currentView}
                            fields={attrs.fields}
                            onUpdateView={handleUpdateView}
                        />

                        {/* 闪电（暂未开放，移动端隐藏） */}
                        <Button
                            size="icon"
                            variant="ghost"
                            className="hidden md:inline-flex h-8 w-8 text-gray-500 dark:text-gray-400 cursor-not-allowed opacity-50"
                            title={t('bitable.actions.comingSoon')}
                            disabled
                        >
                            <Zap className="h-4 w-4" />
                        </Button>

                        {/* 搜索 */}
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 md:h-8 md:w-8 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-accent"
                            onClick={() => setShowSearch(!showSearch)}
                        >
                            <Search className="h-4 w-4" />
                        </Button>

                        {/* 设置（移动端并入“更多”菜单） */}
                        <Button
                            size="icon"
                            variant="ghost"
                            className="hidden md:inline-flex h-8 w-8 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-accent"
                            onClick={() => setFieldConfigOpen(true)}
                        >
                            <Settings className="h-4 w-4" />
                        </Button>

                        {/* 导入Excel（移动端并入“更多”菜单） */}
                        {editor.isEditable && (
                            <Button
                                size="icon"
                                variant="ghost"
                                className="hidden md:inline-flex h-8 w-8 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-accent"
                                onClick={() => setExcelImportOpen(true)}
                            >
                                <Upload className="h-4 w-4" />
                            </Button>
                        )}

                        {/* New 按钮（移动端仅图标） */}
                        {editor.isEditable && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        size="sm"
                                        className="ml-1 md:ml-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-2.5 md:px-3 h-9 md:h-8"
                                    >
                                        <Plus className="h-4 w-4 md:hidden" />
                                        <span className="hidden md:inline">{t('bitable.actions.new')}</span>
                                        <ChevronDown className="hidden md:inline-block h-4 w-4 ml-1" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem onClick={handleAddRecord}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        {t('bitable.actions.addRecord')}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}

                        {/* 删除（移动端并入“更多”菜单） */}
                        {editor.isEditable && (
                            <Button
                                size="icon"
                                variant="ghost"
                                className="hidden md:inline-flex h-8 w-8 text-gray-500 dark:text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-accent"
                                onClick={deleteNode}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}

                        {/* 更多（仅移动端：聚合设置/导入/删除等次要操作） */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="md:hidden h-9 w-9 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-accent"
                                >
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setFieldConfigOpen(true)}>
                                    <Settings className="h-4 w-4 mr-2" />
                                    {t('bitable.actions.fieldSettings')}
                                </DropdownMenuItem>
                                {editor.isEditable && (
                                    <DropdownMenuItem onClick={() => setExcelImportOpen(true)}>
                                        <Upload className="h-4 w-4 mr-2" />
                                        {t('bitable.actions.importExcel')}
                                    </DropdownMenuItem>
                                )}
                                {editor.isEditable && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            onClick={deleteNode}
                                            className="text-red-600 dark:text-red-400"
                                        >
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            {t('bitable.actions.deleteTable')}
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* 搜索框 */}
                {showSearch && (
                    <div className="pl-2 pr-2 py-2 md:pr-4 border-b border-gray-200 dark:border-border">
                        <Input
                            className="w-full md:w-64 h-9 md:h-8"
                            placeholder={t('bitable.search.placeholder') || 'Search...'}
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            autoFocus
                        />
                    </div>
                )}

                {/* 视图内容 */}
                <div className="bitable-content">
                    {renderViewContent()}
                </div>

                {/* 底部统计 */}
                <div className="pl-2 pr-3 md:pr-4 py-3 text-xs text-gray-500 flex items-center justify-between border-t border-gray-200 dark:border-border">
                    <span>{t('bitable.stats.totalRecords', { count: data.length })}</span>
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
                onConvertFieldType={handleConvertFieldType}
            />

            {/* Excel 导入对话框 */}
            <ExcelImportDialog
                open={excelImportOpen}
                onOpenChange={setExcelImportOpen}
                fields={attrs.fields}
                onImport={handleExcelImport}
            />

            {/* 删除视图确认对话框 */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('bitable.dialog.deleteViewTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('bitable.dialog.deleteViewDescription')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setShowDeleteDialog(false)}>
                            {t('bitable.dialog.cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDeleteView}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {t('bitable.dialog.delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Record detail modal */}
            <RecordDetailModal
                open={selectedRecord !== null}
                record={selectedRecord}
                fields={attrs.fields}
                onClose={() => setSelectedRecord(null)}
                onUpdateRecord={handleUpdateRecord}
                editable={editor.isEditable}
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
        case ViewType.CHART:
            return t('bitable.views.chart');
        default:
            return t('bitable.views.default');
    }
}
