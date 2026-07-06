import React from "react";
import { format } from "date-fns";
import { cn } from "@kn/ui";
import type { RecordData, FieldConfig } from "../../../types";
import type { BarPosition, DragState, DragPreview } from "./types";

interface TimelineBarProps {
    record: RecordData;
    position: BarPosition;
    color: string;
    titleField?: FieldConfig;
    progressField?: FieldConfig;
    isMilestone: boolean;
    isCritical: boolean;
    editable: boolean;
    isDragging: boolean;
    dragPreview: DragPreview | null;
    onDragStart: (
        e: React.MouseEvent,
        record: RecordData,
        type: "move" | "resize-left" | "resize-right",
        position: BarPosition
    ) => void;
    onRecordClick: (record: RecordData) => void;
}

export const TimelineBar: React.FC<TimelineBarProps> = ({
    record,
    position,
    color,
    titleField,
    progressField,
    isMilestone,
    isCritical,
    editable,
    isDragging,
    dragPreview,
    onDragStart,
    onRecordClick,
}) => {
    const title = titleField
        ? String(record[titleField.id] ?? record.name ?? record.id)
        : String(record.name ?? record.id);

    const progress = progressField ? (Number(record[progressField.id]) || 0) : 0;

    const left = isDragging && dragPreview ? dragPreview.left : position.left;
    const width = isDragging && dragPreview ? dragPreview.width : position.width;

    if (isMilestone) {
        return (
            <div className="bitable-tl-row__bar-wrapper">
                <div
                    className={cn(
                        "bitable-tl-milestone",
                        isCritical && "bitable-tl-milestone--critical"
                    )}
                    style={{ left: `${left}px`, backgroundColor: color }}
                    onClick={() => onRecordClick(record)}
                >
                    <span className="bitable-tl-milestone__icon">◆</span>
                </div>
                <div className="bitable-tl-tooltip">
                    <div className="bitable-tl-tooltip__title">{title}</div>
                    <div className="bitable-tl-tooltip__date">
                        {format(position.startDate, "yyyy-MM-dd")}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bitable-tl-row__bar-wrapper">
            <div
                className={cn(
                    "bitable-tl-bar",
                    isDragging && "bitable-tl-bar--dragging",
                    isCritical && "bitable-tl-bar--critical",
                    editable && "bitable-tl-bar--editable"
                )}
                style={{
                    left: `${left}px`,
                    width: `${width}px`,
                    backgroundColor: color,
                }}
                onMouseDown={(e) => editable && onDragStart(e, record, "move", position)}
                onClick={() => !isDragging && onRecordClick(record)}
            >
                {/* Left resize handle */}
                {editable && (
                    <div
                        className="bitable-tl-bar__handle bitable-tl-bar__handle--left"
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            onDragStart(e, record, "resize-left", position);
                        }}
                    />
                )}

                {/* Right resize handle */}
                {editable && (
                    <div
                        className="bitable-tl-bar__handle bitable-tl-bar__handle--right"
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            onDragStart(e, record, "resize-right", position);
                        }}
                    />
                )}

                {/* Progress overlay */}
                {progressField && progress > 0 && (
                    <div
                        className="bitable-tl-bar__progress"
                        style={{ width: `${progress}%` }}
                    />
                )}

                {/* Title */}
                <span className="bitable-tl-bar__title">{title}</span>
            </div>

            {/* Tooltip */}
            <div className="bitable-tl-tooltip">
                <div className="bitable-tl-tooltip__title">{title}</div>
                <div className="bitable-tl-tooltip__date">
                    {format(position.startDate, "yyyy-MM-dd")}
                    {position.endDate &&
                        position.endDate.getTime() !== position.startDate.getTime() &&
                        ` — ${format(position.endDate, "yyyy-MM-dd")}`}
                </div>
                {progressField && progress > 0 && (
                    <div className="bitable-tl-tooltip__progress">{progress}%</div>
                )}
            </div>
        </div>
    );
};
