import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Label,
} from "@kn/ui";
import { useTranslation } from "@kn/common";
import type { FieldConfig, RecordData, ViewConfig } from "../../../types";
import { useTimelineLayout } from "./useTimelineLayout";
import { useTimelineDrag } from "./useTimelineDrag";
import { TimelineHeader } from "./TimelineHeader";
import { TimelineGrid } from "./TimelineGrid";
import type { TimelineScale } from "./types";

interface TimelineViewProps {
    view: ViewConfig;
    fields: FieldConfig[];
    data: RecordData[];
    onUpdateRecord: (recordId: string, updates: Partial<RecordData>) => void;
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
    editable: boolean;
    onRecordClick?: (record: RecordData) => void;
}

export const TimelineView: React.FC<TimelineViewProps> = (props) => {
    const { view, fields, data, onUpdateRecord, onUpdateView, editable, onRecordClick } = props;
    const { t } = useTranslation();

    // Available field types for configuration
    const dateFields = useMemo(() => fields.filter((f) => f.type === "date"), [fields]);
    const textFields = useMemo(() => fields.filter((f) => f.type === "text"), [fields]);
    const selectFields = useMemo(() => fields.filter((f) => f.type === "select"), [fields]);
    const progressFields = useMemo(() => fields.filter((f) => f.type === "progress"), [fields]);

    // Auto-detect fields if not configured
    const autoDetectedConfig = useMemo(
        () => ({
            startDateField: dateFields[0]?.id || "",
            endDateField: dateFields[1]?.id || undefined,
            titleField: textFields[0]?.id || undefined,
            progressField: progressFields[0]?.id || undefined,
            groupByField: selectFields[0]?.id || undefined,
            scaleUnit: "day" as const,
        }),
        [dateFields, textFields, selectFields, progressFields]
    );

    const config = useMemo(
        () => ({ ...autoDetectedConfig, ...view.timelineConfig }),
        [view.timelineConfig, autoDetectedConfig]
    );

    const [currentDate, setCurrentDate] = useState(new Date());
    const [scaleUnit, setScaleUnit] = useState<TimelineScale>(config.scaleUnit || "day");

    useEffect(() => {
        setScaleUnit(config.scaleUnit || "day");
    }, [view.id, config.scaleUnit]);

    // Handle config change
    const handleConfigChange = useCallback(
        (key: string, value: string | boolean | undefined) => {
            const newConfig = {
                ...config,
                [key]: value,
            };
            onUpdateView(view.id, { timelineConfig: newConfig });
        },
        [config, onUpdateView, view.id]
    );

    const handleScaleChange = useCallback(
        (nextScale: TimelineScale) => {
            setScaleUnit(nextScale);
            handleConfigChange("scaleUnit", nextScale);
        },
        [handleConfigChange]
    );

    // Navigation
    const goToPrevious = useCallback(() => {
        setCurrentDate((prev) => {
            const d = new Date(prev);
            d.setMonth(d.getMonth() - 1);
            return d;
        });
    }, []);

    const goToNext = useCallback(() => {
        setCurrentDate((prev) => {
            const d = new Date(prev);
            d.setMonth(d.getMonth() + 1);
            return d;
        });
    }, []);

    const goToToday = useCallback(() => setCurrentDate(new Date()), []);

    // Ctrl+scroll to zoom scale
    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const nextScale =
                    scaleUnit === "day" ? "week" : scaleUnit === "week" ? "month" : "day";
                handleScaleChange(nextScale);
            }
        };
        el.addEventListener("wheel", handler, { passive: false });
        return () => el.removeEventListener("wheel", handler);
    }, [scaleUnit, handleScaleChange]);

    // Layout calculations
    const layout = useTimelineLayout({
        currentDate,
        scaleUnit,
        config,
        fields,
        data,
    });

    // Drag handlers
    const drag = useTimelineDrag({
        editable,
        geometry: layout.geometry,
        startDateField: layout.startDateField,
        endDateField: layout.endDateField,
        onUpdateRecord,
    });

    const handleRecordClick = useCallback(
        (record: RecordData) => {
            if (onRecordClick) onRecordClick(record);
        },
        [onRecordClick]
    );

    // No date fields available
    if (dateFields.length === 0) {
        return (
            <div className="bitable-tl-empty">
                <p className="bitable-tl-empty__title">
                    {t("bitable.timelineView.noDateFields")}
                </p>
                <p className="bitable-tl-empty__desc">
                    {t("bitable.timelineView.noDateFieldsDesc")}
                </p>
            </div>
        );
    }

    // Start date field not configured
    if (!config.startDateField || !layout.startDateField) {
        return (
            <div className="bitable-tl-empty">
                <p className="bitable-tl-empty__title">
                    {t("bitable.timelineView.settings")}
                </p>
                <p className="bitable-tl-empty__desc">
                    {t("bitable.timelineView.startDateField")}
                </p>
                <div className="bitable-tl-empty__config">
                    <Label>{t("bitable.timelineView.startDateField")}</Label>
                    <Select
                        value={config.startDateField || ""}
                        onValueChange={(v) => handleConfigChange("startDateField", v)}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder={t("bitable.timelineView.selectField")} />
                        </SelectTrigger>
                        <SelectContent>
                            {dateFields.map((f) => (
                                <SelectItem key={f.id} value={f.id}>
                                    {f.title}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
        );
    }

    return (
        <div className="bitable-tl" ref={containerRef}>
            <TimelineHeader
                currentDate={currentDate}
                scaleUnit={scaleUnit}
                onPrev={goToPrevious}
                onNext={goToNext}
                onToday={goToToday}
                onScaleChange={handleScaleChange}
                editable={editable}
                config={config}
                onConfigChange={handleConfigChange}
                dateFields={dateFields}
                textFields={textFields}
                selectFields={selectFields}
                progressFields={progressFields}
                taskCount={layout.validRecords.length}
            />
            <TimelineGrid
                timeScale={layout.timeScale}
                columnWidth={layout.columnWidth}
                geometry={layout.geometry}
                scaleUnit={scaleUnit}
                groupedRecords={layout.groupedRecords}
                positionById={layout.positionById}
                dependencies={layout.dependencies}
                calculateDependencyPath={layout.calculateDependencyPath}
                criticalTaskIds={layout.criticalTaskIds}
                startDateField={layout.startDateField}
                endDateField={layout.endDateField}
                titleField={layout.titleField}
                progressField={layout.progressField}
                milestoneField={layout.milestoneField}
                groupByField={layout.groupByField}
                groupOptionById={layout.groupOptionById || new Map()}
                getGroupLabel={layout.getGroupLabel}
                getGroupColor={layout.getGroupColor}
                getTaskColor={layout.getTaskColor}
                dragState={drag.dragState}
                dragPreview={drag.dragPreview}
                handleDragStart={drag.handleDragStart}
                handleDragMove={drag.handleDragMove}
                handleDragEnd={drag.handleDragEnd}
                editable={editable}
                onRecordClick={handleRecordClick}
                validRecordsCount={layout.validRecords.length}
                totalCount={data.length}
            />
        </div>
    );
};
