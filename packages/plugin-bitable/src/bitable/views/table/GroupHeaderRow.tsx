import React from "react";
import { ChevronDown, ChevronRight } from "@kn/icon";
import type { FieldConfig } from "../../../types";
import { FieldType } from "../../../types";
import { getGroupLabel } from "../../../utils/dataProcessing";
import type { GroupedRow } from "./types";

interface GroupHeaderRowProps {
    row: GroupedRow;
    collapsed: boolean;
    onToggle: () => void;
    groupField?: FieldConfig;
}

/**
 * Renders a collapsible group header row inside the DataGrid.
 * Shows a chevron, group label (with color badge for select fields), and count.
 */
export const GroupHeaderRow: React.FC<GroupHeaderRowProps> = ({
    row,
    collapsed,
    onToggle,
    groupField,
}) => {
    const groupKey = row._groupKey || "";
    const label = getGroupLabel(groupKey, groupField);
    const isSelectField =
        groupField?.type === FieldType.SELECT ||
        groupField?.type === FieldType.MULTI_SELECT;
    const selectOption = isSelectField
        ? groupField?.options?.find((o) => o.label === groupKey)
        : undefined;

    return (
        <div
            className="rdg-row bitable-group-header-row"
            style={{ height: 36, lineHeight: "36px", position: "relative" }}
            onClick={onToggle}
        >
            <div className="bitable-group-header-content">
                {collapsed ? (
                    <ChevronRight
                        style={{ width: 16, height: 16 }}
                        className="text-muted-foreground flex-shrink-0"
                    />
                ) : (
                    <ChevronDown
                        style={{ width: 16, height: 16 }}
                        className="text-muted-foreground flex-shrink-0"
                    />
                )}
                {selectOption ? (
                    <span
                        className="bitable-group-header-badge"
                        style={{
                            backgroundColor: selectOption.color + "20",
                            color: selectOption.color,
                        }}
                    >
                        {label}
                    </span>
                ) : (
                    <span className="bitable-group-header-label">{label}</span>
                )}
                <span className="bitable-group-header-count">
                    ({row._groupCount})
                </span>
            </div>
        </div>
    );
};
