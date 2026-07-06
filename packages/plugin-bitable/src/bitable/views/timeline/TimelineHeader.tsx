import React, { useMemo } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Settings2 } from "@kn/icon";
import {
    Button,
    Badge,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Label,
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@kn/ui";
import { useTranslation } from "@kn/common";
import type { FieldConfig } from "../../../types";
import type { TimelineScale } from "./types";

interface TimelineHeaderProps {
    currentDate: Date;
    scaleUnit: TimelineScale;
    onPrev: () => void;
    onNext: () => void;
    onToday: () => void;
    onScaleChange: (scale: TimelineScale) => void;
    editable: boolean;
    config: {
        startDateField: string;
        endDateField?: string;
        titleField?: string;
        progressField?: string;
        groupByField?: string;
        milestoneField?: string;
        dependencyField?: string;
        colorField?: string;
        criticalPathEnabled?: boolean;
    };
    onConfigChange: (key: string, value: string | boolean) => void;
    dateFields: FieldConfig[];
    textFields: FieldConfig[];
    selectFields: FieldConfig[];
    progressFields: FieldConfig[];
    taskCount: number;
}

export function TimelineHeader({
    currentDate,
    scaleUnit,
    onPrev,
    onNext,
    onToday,
    onScaleChange,
    editable,
    config,
    onConfigChange,
    dateFields,
    textFields,
    selectFields,
    progressFields,
    taskCount,
}: TimelineHeaderProps) {
    const { t } = useTranslation();

    const dateLabel = useMemo(
        () => format(currentDate, "yyyy-MM"),
        [currentDate]
    );

    const scales: TimelineScale[] = ["day", "week", "month"];

    const configFields = useMemo(
        () => [
            {
                key: "startDateField",
                label: t("bitable.timelineView.startDateField"),
                value: config.startDateField || "",
                options: dateFields,
                placeholder: t("bitable.timelineView.selectField"),
                allowEmpty: false,
            },
            {
                key: "endDateField",
                label: t("bitable.timelineView.endDateField"),
                value: config.endDateField || "",
                options: dateFields,
                placeholder: t("bitable.timelineView.selectOptional"),
                allowEmpty: true,
            },
            {
                key: "titleField",
                label: t("bitable.timelineView.titleField"),
                value: config.titleField || "",
                options: textFields,
                placeholder: t("bitable.timelineView.selectOptional"),
                allowEmpty: true,
            },
            {
                key: "progressField",
                label: t("bitable.timelineView.progressField"),
                value: config.progressField || "",
                options: progressFields,
                placeholder: t("bitable.timelineView.selectOptional"),
                allowEmpty: true,
            },
            {
                key: "groupByField",
                label: t("bitable.timelineView.groupByField"),
                value: config.groupByField || "",
                options: selectFields,
                placeholder: t("bitable.timelineView.selectOptional"),
                allowEmpty: true,
            },
            {
                key: "milestoneField",
                label: t("bitable.timelineView.milestoneField"),
                value: config.milestoneField || "",
                options: selectFields,
                placeholder: t("bitable.timelineView.selectOptional"),
                allowEmpty: true,
            },
            {
                key: "dependencyField",
                label: t("bitable.timelineView.dependencyField"),
                value: config.dependencyField || "",
                options: textFields,
                placeholder: t("bitable.timelineView.selectOptional"),
                allowEmpty: true,
            },
            {
                key: "colorField",
                label: t("bitable.timelineView.customColors"),
                value: config.colorField || "",
                options: selectFields,
                placeholder: t("bitable.timelineView.selectOptional"),
                allowEmpty: true,
            },
        ],
        [config, dateFields, textFields, selectFields, progressFields, t]
    );

    return (
        <div className="bitable-tl-header">
            <div className="bitable-tl-header__nav">
                <Button
                    variant="outline"
                    size="icon"
                    className="bitable-tl-header__btn"
                    onClick={onPrev}
                >
                    <ChevronLeft />
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    className="bitable-tl-header__btn"
                    onClick={onToday}
                >
                    {t("bitable.timelineView.today")}
                </Button>
                <Button
                    variant="outline"
                    size="icon"
                    className="bitable-tl-header__btn"
                    onClick={onNext}
                >
                    <ChevronRight />
                </Button>
                <span className="bitable-tl-header__date">{dateLabel}</span>
                <Badge variant="outline" className="bitable-tl-header__count">
                    {taskCount}
                </Badge>
            </div>

            <div className="bitable-tl-header__actions">
                <div className="bitable-tl-scale-switcher">
                    {scales.map((s) => (
                        <Button
                            key={s}
                            variant={scaleUnit === s ? "default" : "outline"}
                            size="sm"
                            className="bitable-tl-scale-switcher__btn"
                            onClick={() => onScaleChange(s)}
                        >
                            {t(`bitable.timelineView.${s}`)}
                        </Button>
                    ))}
                </div>
                {editable && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                size="icon"
                                className="bitable-tl-header__btn"
                                aria-label={t("bitable.timelineView.settings")}
                            >
                                <Settings2 className="h-4 w-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80">
                            <div className="bitable-tl-settings">
                                <h3 className="bitable-tl-settings__title">
                                    {t("bitable.timelineView.settings")}
                                </h3>
                                {configFields.map((field) => (
                                    <div
                                        key={field.key}
                                        className="bitable-tl-settings__field"
                                    >
                                        <Label>{field.label}</Label>
                                        <Select
                                            value={field.value}
                                            onValueChange={(v) =>
                                                onConfigChange(field.key, v)
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder={field.placeholder} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {field.allowEmpty && (
                                                    <SelectItem value="">
                                                        {t("bitable.timelineView.none")}
                                                    </SelectItem>
                                                )}
                                                {field.options.map((f) => (
                                                    <SelectItem key={f.id} value={f.id}>
                                                        {f.title}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                ))}
                                <div className="bitable-tl-settings__field">
                                    <Label>{t("bitable.timelineView.criticalPath")}</Label>
                                    <Select
                                        value={config.criticalPathEnabled ? "true" : "false"}
                                        onValueChange={(v) =>
                                            onConfigChange("criticalPathEnabled", v === "true")
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="false">
                                                {t("bitable.timelineView.none")}
                                            </SelectItem>
                                            <SelectItem value="true">
                                                {t("bitable.timelineView.criticalPath")}
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                )}
            </div>
        </div>
    );
}
