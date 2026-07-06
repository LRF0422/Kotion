import React, { useMemo, useCallback } from "react";
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui";
import { useTranslation } from "@kn/common";
import { FieldConfig, ViewConfig } from "../../../types";
import { isKanbanGroupable } from "../../../utils/kanbanGroups";

interface KanbanToolbarProps {
    view: ViewConfig;
    fields: FieldConfig[];
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
    editable: boolean;
}

/**
 * Compact toolbar for Kanban view: group-by field selector.
 */
export const KanbanToolbar: React.FC<KanbanToolbarProps> = ({
    view,
    fields,
    onUpdateView,
    editable,
}) => {
    const { t } = useTranslation();

    const groupByField = fields.find((f) => f.id === view.kanbanConfig?.groupByField);
    const groupableFields = useMemo(
        () => fields.filter((f) => isKanbanGroupable(f.type)),
        [fields]
    );

    const setGroupByField = useCallback(
        (fieldId: string) => {
            onUpdateView(view.id, {
                kanbanConfig: { ...view.kanbanConfig, groupByField: fieldId },
            });
        },
        [onUpdateView, view.id, view.kanbanConfig]
    );

    if (!editable && !groupByField) return null;

    return (
        <div className="bitable-kanban__toolbar">
            <Label className="bitable-kanban__toolbar-label">
                {t("bitable.kanbanView.groupBy")}
            </Label>
            <Select value={groupByField?.id || ""} onValueChange={setGroupByField} disabled={!editable}>
                <SelectTrigger className="h-8 w-44">
                    <SelectValue placeholder={t("bitable.kanbanView.selectGroupField")} />
                </SelectTrigger>
                <SelectContent>
                    {groupableFields.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                            {f.title}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
};
