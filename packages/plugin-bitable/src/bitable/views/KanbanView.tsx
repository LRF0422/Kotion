import React, { useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@kn/ui";
import { Button, Badge } from "@kn/ui";
import { Plus } from "@kn/icon";
import { FieldConfig, RecordData, ViewConfig, SelectOption } from "../../types";
import { getFieldRenderer } from "../fields/FieldRenderers";
import {
    KanbanDndProvider,
    DraggableCard,
    DroppableColumn,
    type KanbanDragItem
} from "../components/kanban/dnd";

interface KanbanViewProps {
    view: ViewConfig;
    fields: FieldConfig[];
    data: RecordData[];
    onAddRecord: () => void;
    onUpdateRecord: (recordId: string, updates: Partial<RecordData>) => void;
    onDeleteRecord: (recordIds: string[]) => void;
    editable: boolean;
}

export const KanbanView: React.FC<KanbanViewProps> = (props) => {
    const { view, fields, data, onAddRecord, onUpdateRecord, editable } = props;

    const groupByField = fields.find(f => f.id === view.kanbanConfig?.groupByField);

    // Handle card drop to change status
    const handleCardDrop = useCallback((item: KanbanDragItem, targetColumnId: string) => {
        if (!groupByField) return;

        const record = item.record;
        // Update the record's group field value
        // For 'unassigned', set to null; otherwise set to the target column id
        const newValue = targetColumnId === 'unassigned' ? null : targetColumnId;
        onUpdateRecord(record.id, { [groupByField.id]: newValue });
    }, [groupByField, onUpdateRecord]);

    // 分组数据
    const groupedData = useMemo(() => {
        if (!groupByField || groupByField.type !== 'select') {
            return {};
        }

        const groups: Record<string, RecordData[]> = {};

        // 初始化分组
        (groupByField.options || []).forEach((option: SelectOption) => {
            groups[option.id] = [];
        });

        // 添加未分组
        groups['unassigned'] = [];

        // 分配记录到分组
        data.forEach(record => {
            const groupValue = record[groupByField.id];
            if (groupValue && groups[groupValue]) {
                groups[groupValue].push(record);
            } else {
                groups['unassigned']?.push(record);
            }
        });

        return groups;
    }, [data, groupByField]);

    const getGroupColor = (optionId: string) => {
        if (optionId === 'unassigned') return 'gray';
        const option = (groupByField?.options || []).find((o: SelectOption) => o.id === optionId);
        return option?.color || 'gray';
    };

    const getGroupLabel = (optionId: string) => {
        if (optionId === 'unassigned') return '未分组';
        const option = (groupByField?.options || []).find((o: SelectOption) => o.id === optionId);
        return option?.label || optionId;
    };

    if (!groupByField) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                请配置看板视图的分组字段
            </div>
        );
    }

    // Render card content
    const renderCardContent = (record: RecordData) => (
        <Card className="hover:shadow-md transition-shadow bg-background">
            <CardContent className="p-3 space-y-2">
                {fields
                    .filter(f => f.isShow !== false && f.id !== groupByField?.id)
                    .slice(0, 4)
                    .map(field => {
                        const Renderer = getFieldRenderer(field.type);
                        return (
                            <div key={field.id} className="text-sm">
                                <div className="text-muted-foreground text-xs mb-1">{field.title}</div>
                                <Renderer value={record[field.id]} field={field} />
                            </div>
                        );
                    })}
            </CardContent>
        </Card>
    );

    return (
        <KanbanDndProvider>
            <div className="flex gap-4 overflow-x-auto pb-4">
                {Object.entries(groupedData).map(([groupId, records]) => (
                    <div key={groupId} className="flex-shrink-0 w-80">
                        <DroppableColumn
                            columnId={groupId}
                            onDrop={handleCardDrop}
                            disabled={!editable}
                        >
                            <div className="bg-muted/50 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" style={{ borderColor: getGroupColor(groupId) }}>
                                            {getGroupLabel(groupId)}
                                        </Badge>
                                        <span className="text-sm text-muted-foreground">{records.length}</span>
                                    </div>
                                    {editable && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => {
                                                onAddRecord();
                                                // 可以在这里设置默认分组
                                            }}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    {records.map(record => (
                                        <DraggableCard
                                            key={record.id}
                                            record={record}
                                            columnId={groupId}
                                            disabled={!editable}
                                        >
                                            {renderCardContent(record)}
                                        </DraggableCard>
                                    ))}
                                </div>
                            </div>
                        </DroppableColumn>
                    </div>
                ))}
            </div>
        </KanbanDndProvider>
    );
};
