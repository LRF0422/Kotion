import React, { useState, useCallback, useEffect, useRef } from "react";
import { format, isWithinInterval, differenceInDays } from "date-fns";
import { Badge } from "@kn/ui";
import { useTranslation } from "@kn/common";
import type { RecordData, FieldConfig, SelectOption } from "../../../types";
import type { DragState, DragPreview, BarPosition, Dependency } from "./types";
import { TimelineBar } from "./TimelineBar";

interface TimelineGridProps {
    timeScale: Date[];
    columnWidth: number;
    timeRange: { start: Date; end: Date };
    groupedRecords: Record<string, RecordData[]>;
    positionById: Map<string, BarPosition | null>;
    dependencies: Dependency[];
    calculateDependencyPath: (from: string, to: string) => string | null;
    criticalTaskIds: Set<string>;
    startDateField?: FieldConfig;
    endDateField?: FieldConfig | null;
    titleField?: FieldConfig;
    progressField?: FieldConfig;
    milestoneField?: FieldConfig | null;
    groupByField?: FieldConfig | null;
    groupOptionById: Map<string, SelectOption>;
    getGroupLabel: (groupId: string) => string;
    getGroupColor: (groupId: string) => string;
    getTaskColor: (record: RecordData, groupId: string) => string;
    dragState: DragState | null;
    dragPreview: DragPreview | null;
    handleDragStart: (
        e: React.MouseEvent,
        record: RecordData,
        type: "move" | "resize-left" | "resize-right",
        position: BarPosition
    ) => void;
    handleDragMove: (e: React.MouseEvent) => void;
    handleDragEnd: () => void;
    editable: boolean;
    onRecordClick: (record: RecordData) => void;
    validRecordsCount: number;
    totalCount: number;
}

export function TimelineGrid({
    timeScale,
    columnWidth,
    timeRange,
    groupedRecords,
    positionById,
    dependencies,
    calculateDependencyPath,
    criticalTaskIds,
    titleField,
    progressField,
    milestoneField,
    groupByField,
    getGroupLabel,
    getGroupColor,
    getTaskColor,
    dragState,
    dragPreview,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    editable,
    onRecordClick,
    validRecordsCount,
    totalCount,
}: TimelineGridProps) {
    const { t } = useTranslation();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

    // Scroll to today on mount
    const scrollToTodayRef = useRef(true);
    useEffect(() => {
        if (!scrollToTodayRef.current) return;
        scrollToTodayRef.current = false;
        const container = scrollRef.current;
        if (container && isWithinInterval(new Date(), { start: timeRange.start, end: timeRange.end })) {
            const offset = differenceInDays(new Date(), timeRange.start) * columnWidth;
            container.scrollTo({ left: Math.max(0, offset - container.clientWidth / 2), behavior: "smooth" });
        }
    }, [timeRange, columnWidth]);

    // Ctrl+scroll to zoom, plain scroll to pan
    const handleWheel = useCallback(
        (e: React.WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                // Zoom: cycle day -> week -> month
                // Actual scale change is handled by parent via callback
            }
        },
        []
    );

    const toggleGroup = (groupId: string) => {
        setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    const todayLeft = isWithinInterval(new Date(), { start: timeRange.start, end: timeRange.end })
        ? differenceInDays(new Date(), timeRange.start) * columnWidth
        : null;

    const formatScaleLabel = (date: Date) => {
        // Column width determines format
        if (columnWidth >= 100) return format(date, "MM/dd");
        if (columnWidth >= 80) return format(date, "MM");
        return format(date, "d");
    };

    return (
        <div
            className="bitable-tl-body"
            onMouseMove={dragState ? handleDragMove : undefined}
            onMouseUp={dragState ? handleDragEnd : undefined}
            onMouseLeave={dragState ? handleDragEnd : undefined}
        >
            {/* Left: Task list sidebar */}
            <div className="bitable-tl-sidebar">
                <div className="bitable-tl-sidebar__header">
                    {t("bitable.timelineView.taskName")}
                </div>
                <div className="bitable-tl-sidebar__body">
                    {Object.entries(groupedRecords).map(([groupId, records]) => (
                        <div key={groupId}>
                            {groupByField && (
                                <div
                                    className="bitable-tl-sidebar__group"
                                    onClick={() => toggleGroup(groupId)}
                                >
                                    <Badge
                                        variant="outline"
                                        style={{ borderColor: getGroupColor(groupId) }}
                                    >
                                        {groupId === "default"
                                            ? t("bitable.timelineView.allTasks")
                                            : groupId === "unassigned"
                                            ? t("bitable.timelineView.uncategorized")
                                            : getGroupLabel(groupId)}
                                    </Badge>
                                    <span className="bitable-tl-sidebar__group-count">
                                        ({records.length})
                                    </span>
                                </div>
                            )}
                            {!collapsedGroups.has(groupId) &&
                                records.map((record) => (
                                    <div
                                        key={record.id}
                                        className="bitable-tl-sidebar__row"
                                        onClick={() => onRecordClick(record)}
                                    >
                                        <span className="bitable-tl-sidebar__task-name">
                                            {titleField
                                                ? String(record[titleField.id] ?? record.id)
                                                : record.id}
                                        </span>
                                    </div>
                                ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* Right: Time axis */}
            <div
                className="bitable-tl-axis"
                ref={scrollRef}
                onWheel={handleWheel}
            >
                <div style={{ minWidth: `${timeScale.length * columnWidth}px` }}>
                    {/* Time scale header */}
                    <div className="bitable-tl-axis__header">
                        {timeScale.map((date, idx) => (
                            <div
                                key={idx}
                                className="bitable-tl-axis__header-cell"
                                style={{ width: columnWidth, minWidth: columnWidth }}
                            >
                                {formatScaleLabel(date)}
                            </div>
                        ))}
                    </div>

                    {/* Bars area */}
                    <div className="bitable-tl-axis__body">
                        {/* Background grid */}
                        <div className="bitable-tl-grid">
                            {timeScale.map((date, idx) => (
                                <div
                                    key={idx}
                                    className="bitable-tl-grid__cell"
                                    style={{ width: columnWidth, minWidth: columnWidth }}
                                />
                            ))}
                        </div>

                        {/* Snap overlay during drag */}
                        {dragState && (
                            <div className="bitable-tl-grid bitable-tl-grid--snap">
                                {timeScale.map((_, idx) => (
                                    <div
                                        key={idx}
                                        className="bitable-tl-grid__cell bitable-tl-grid__cell--snap"
                                        style={{ width: columnWidth, minWidth: columnWidth }}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Dependency lines */}
                        {dependencies.length > 0 && (
                            <svg className="bitable-tl-deps" style={{ zIndex: 5 }}>
                                {dependencies.map((dep, idx) => {
                                    const path = calculateDependencyPath(dep.from, dep.to);
                                    if (!path) return null;
                                    return (
                                        <path
                                            key={idx}
                                            d={path}
                                            stroke="#94a3b8"
                                            strokeWidth="2"
                                            fill="none"
                                            strokeDasharray="5,5"
                                        />
                                    );
                                })}
                            </svg>
                        )}

                        {/* Today marker */}
                        {todayLeft !== null && (
                            <div
                                className="bitable-tl-today"
                                style={{ left: todayLeft }}
                            />
                        )}

                        {/* Task bars */}
                        <div className="bitable-tl-rows">
                            {Object.entries(groupedRecords).map(([groupId, records]) => (
                                <div key={groupId}>
                                    {groupByField && (
                                        <div className="bitable-tl-row bitable-tl-row--group-header" />
                                    )}
                                    {!collapsedGroups.has(groupId) &&
                                        records.map((record) => {
                                            const position = positionById.get(record.id);
                                            if (!position) return null;

                                            const isMilestone = !!(
                                                milestoneField && record[milestoneField.id]
                                            );

                                            return (
                                                <div
                                                    key={record.id}
                                                    className="bitable-tl-row"
                                                >
                                                    <TimelineBar
                                                        record={record}
                                                        position={position}
                                                        color={getTaskColor(record, groupId)}
                                                        titleField={titleField}
                                                        progressField={progressField}
                                                        isMilestone={isMilestone}
                                                        isCritical={criticalTaskIds.has(record.id)}
                                                        editable={editable}
                                                        isDragging={dragState?.recordId === record.id}
                                                        dragPreview={dragPreview}
                                                        onDragStart={handleDragStart}
                                                        onRecordClick={onRecordClick}
                                                    />
                                                </div>
                                            );
                                        })}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom stats */}
            <div className="bitable-tl-footer">
                <span>
                    {validRecordsCount} {totalCount > validRecordsCount && `(${totalCount - validRecordsCount} ${t("bitable.timelineView.noDate")})`}
                </span>
            </div>
        </div>
    );
}
