import React, { useMemo } from "react";
import { Card, CardContent, CardHeader } from "@kn/ui";
import { Button, Badge } from "@kn/ui";
import { Plus } from "@kn/icon";
import { FieldConfig, Record, ViewConfig, SelectOption } from "../../types";
import { getFieldRenderer } from "../fields/FieldRenderers";

interface KanbanViewProps {
    view: ViewConfig;
    fields: FieldConfig[];
    data: Record[];
    onAddRecord: () => void;
    onUpdateRecord: (recordId: string, updates: Partial<Record>) => void;
    onDeleteRecord: (recordIds: string[]) => void;
    editable: boolean;
}

export const KanbanView: React.FC<KanbanViewProps> = (props) => {
    const { view, fields, data, onAddRecord, onUpdateRecord, editable } = props;

    const groupByField = fields.find(f => f.id === view.kanbanConfig?.groupByField);

    // 分组数据
    const groupedData = useMemo(() => {
        if (!groupByField || groupByField.type !== 'select') {
            return {};
        }

        const groups: Record<string, Record[]> = {};

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
                groups['unassigned'].push(record);
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

    return (
        <div className="flex gap-4 overflow-x-auto pb-4">
            {Object.entries(groupedData).map(([groupId, records]) => (
                <div key={groupId} className="flex-shrink-0 w-80">
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
                                <Card key={record.id} className="cursor-pointer hover:shadow-md transition-shadow">
                                    <CardContent className="p-3 space-y-2">
                                        {fields
                                            .filter(f => f.isShow !== false && f.id !== groupByField.id)
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
                            ))}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};
