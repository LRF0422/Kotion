import { useMemo } from "react";
import {
    startOfMonth,
    endOfMonth,
    eachDayOfInterval,
    eachWeekOfInterval,
    eachMonthOfInterval,
    addMonths,
    subMonths,
    differenceInDays,
    parseISO,
} from "date-fns";
import type { FieldConfig, RecordData, SelectOption } from "../../../types";
import type { BarPosition, MilestonePosition, Dependency, TimelineScale } from "./types";

interface UseTimelineLayoutArgs {
    currentDate: Date;
    scaleUnit: TimelineScale;
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
        customColorsEnabled?: boolean;
    };
    fields: FieldConfig[];
    data: RecordData[];
}

export function useTimelineLayout({
    currentDate,
    scaleUnit,
    config,
    fields,
    data,
}: UseTimelineLayoutArgs) {
    // Resolve field configs
    const startDateField = fields.find((f) => f.id === config.startDateField);
    const endDateField = config.endDateField
        ? fields.find((f) => f.id === config.endDateField)
        : null;
    const titleField = config.titleField
        ? fields.find((f) => f.id === config.titleField)
        : fields.find((f) => f.type === "text");
    const progressField = config.progressField
        ? fields.find((f) => f.id === config.progressField)
        : fields.find((f) => f.type === "progress");
    const groupByField = config.groupByField
        ? fields.find((f) => f.id === config.groupByField)
        : null;
    const milestoneField = config.milestoneField
        ? fields.find((f) => f.id === config.milestoneField)
        : null;
    const dependencyField = config.dependencyField
        ? fields.find((f) => f.id === config.dependencyField)
        : null;

    // Time range (3 months before to 3 months after current date)
    const timeRange = useMemo(() => {
        const start = startOfMonth(subMonths(currentDate, 1));
        const end = endOfMonth(addMonths(currentDate, 2));
        return { start, end };
    }, [currentDate]);

    // Generate time scale ticks
    const timeScale = useMemo(() => {
        const { start, end } = timeRange;
        switch (scaleUnit) {
            case "week":
                return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
            case "month":
                return eachMonthOfInterval({ start, end });
            default:
                return eachDayOfInterval({ start, end });
        }
    }, [timeRange, scaleUnit]);

    // Column width per scale unit
    const columnWidth = useMemo(() => {
        switch (scaleUnit) {
            case "week":
                return 100;
            case "month":
                return 120;
            default:
                return 40;
        }
    }, [scaleUnit]);

    // Days per pixel for drag calculations
    const daysPerPixel = useMemo(() => {
        switch (scaleUnit) {
            case "week":
                return 7 / columnWidth;
            case "month":
                return 30 / columnWidth;
            default:
                return 1 / columnWidth;
        }
    }, [scaleUnit, columnWidth]);

    // Filter records with valid start dates
    const validRecords = useMemo(() => {
        return data.filter((record) => {
            const startDate = record[config.startDateField];
            return startDate && startDate !== null;
        });
    }, [data, config.startDateField]);

    // Group records by groupByField
    const groupedRecords = useMemo(() => {
        if (!groupByField || groupByField.type !== "select") {
            return { default: validRecords };
        }

        const groups: Record<string, RecordData[]> = {};
        (groupByField.options || []).forEach((option: SelectOption) => {
            groups[option.id] = [];
        });
        groups["unassigned"] = [];

        validRecords.forEach((record) => {
            const groupValue = record[groupByField.id];
            if (groupValue && groups[groupValue]) {
                groups[groupValue].push(record);
            } else {
                groups["unassigned"]?.push(record);
            }
        });

        return groups;
    }, [validRecords, groupByField]);

    // recordById lookup table
    const recordById = useMemo(() => {
        const map = new Map<string, RecordData>();
        data.forEach((r) => map.set(r.id, r));
        return map;
    }, [data]);

    // groupOptionById lookup table
    const groupOptionById = useMemo(() => {
        const map = new Map<string, SelectOption>();
        (groupByField?.options || []).forEach((o: SelectOption) => map.set(o.id, o));
        return map;
    }, [groupByField]);

    // Calculate bar position for a record
    const calculateBarPosition = (record: RecordData): BarPosition | null => {
        try {
            const startDateStr = record[config.startDateField];
            if (!startDateStr) return null;

            const startDate =
                typeof startDateStr === "string"
                    ? parseISO(startDateStr)
                    : startDateStr instanceof Date
                    ? startDateStr
                    : null;
            if (!startDate) return null;

            const endDateStr = endDateField ? record[endDateField.id] : null;
            const endDate = endDateStr
                ? typeof endDateStr === "string"
                    ? parseISO(endDateStr)
                    : endDateStr instanceof Date
                    ? endDateStr
                    : startDate
                : startDate;

            const daysSinceStart = differenceInDays(startDate, timeRange.start);
            const duration = differenceInDays(endDate, startDate) + 1;

            const left = daysSinceStart * columnWidth;
            const width = Math.max(duration * columnWidth, columnWidth);

            return { left, width, startDate, endDate };
        } catch {
            return null;
        }
    };

    // Pre-compute all positions
    const positionById = useMemo(() => {
        const map = new Map<string, BarPosition | null>();
        Object.values(groupedRecords).forEach((records) => {
            records.forEach((record) => {
                map.set(record.id, calculateBarPosition(record));
            });
        });
        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupedRecords, config.startDateField, endDateField, timeRange, columnWidth]);

    // Calculate milestone position
    const calculateMilestonePosition = (record: RecordData): MilestonePosition | null => {
        try {
            const dateStr = record[config.startDateField];
            if (!dateStr) return null;

            const date =
                typeof dateStr === "string"
                    ? parseISO(dateStr)
                    : dateStr instanceof Date
                    ? dateStr
                    : null;
            if (!date) return null;

            const daysSinceStart = differenceInDays(date, timeRange.start);
            const left = daysSinceStart * columnWidth;

            return { left, date };
        } catch {
            return null;
        }
    };

    // Group label helper
    const getGroupLabel = (groupId: string) => {
        if (groupId === "default") return "allTasks";
        if (groupId === "unassigned") return "uncategorized";
        return groupOptionById.get(groupId)?.label || groupId;
    };

    // Group color helper
    const getGroupColor = (groupId: string) => {
        if (groupId === "default" || groupId === "unassigned") return "#6b7280";
        return groupOptionById.get(groupId)?.color || "#6b7280";
    };

    // Task color helper
    const getTaskColor = (record: RecordData, groupId: string) => {
        if (config.colorField) {
            const cf = fields.find((f) => f.id === config.colorField);
            const val = cf ? record[cf.id] : undefined;
            if (cf && val) {
                if (cf.type === "select") {
                    const opt = (cf.options || []).find((o: SelectOption) => o.id === val);
                    if (opt?.color) return opt.color;
                } else {
                    return val as string;
                }
            }
        } else if (config.customColorsEnabled) {
            const colorField = fields.find(
                (f) => f.type === "text" && f.title.toLowerCase().includes("color")
            );
            if (colorField && record[colorField.id]) {
                return record[colorField.id] as string;
            }
        }
        return getGroupColor(groupId);
    };

    // Dependencies
    const dependencies = useMemo(() => {
        if (!dependencyField) return [] as Dependency[];

        const deps: Dependency[] = [];
        Object.values(groupedRecords).forEach((records) => {
            records.forEach((record) => {
                const dependencyValue = record[dependencyField.id];
                if (dependencyValue) {
                    const depIds = Array.isArray(dependencyValue)
                        ? dependencyValue
                        : [dependencyValue];
                    depIds.forEach((depId) => {
                        const dependentRecord = recordById.get(depId as string);
                        if (dependentRecord) {
                            deps.push({ from: dependentRecord.id, to: record.id });
                        }
                    });
                }
            });
        });

        return deps;
    }, [dependencyField, groupedRecords, recordById]);

    // Critical path task IDs
    const criticalTaskIds = useMemo(() => {
        const set = new Set<string>();
        if (!config.criticalPathEnabled || !dependencyField) return set;
        dependencies.forEach((dep) => {
            set.add(dep.from);
            set.add(dep.to);
        });
        return set;
    }, [config.criticalPathEnabled, dependencyField, dependencies]);

    // Calculate dependency path
    const calculateDependencyPath = (fromRecordId: string, toRecordId: string) => {
        const fromPosition = positionById.get(fromRecordId);
        const toPosition = positionById.get(toRecordId);
        if (!fromPosition || !toPosition) return null;

        const fromX = fromPosition.left + fromPosition.width;
        const toX = toPosition.left;

        let fromY = 0;
        let toY = 0;
        let rowIndex = 0;
        let foundFrom = false;
        let foundTo = false;

        for (const [, records] of Object.entries(groupedRecords)) {
            for (const record of records) {
                if (record.id === fromRecordId) {
                    fromY = rowIndex * 48 + 36;
                    foundFrom = true;
                }
                if (record.id === toRecordId) {
                    toY = rowIndex * 48 + 36;
                    foundTo = true;
                }
                rowIndex++;
                if (foundFrom && foundTo) break;
            }
            if (foundFrom && foundTo) break;
        }

        const midX = (fromX + toX) / 2;
        return `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
    };

    return {
        startDateField,
        endDateField,
        groupOptionById,
        titleField,
        progressField,
        groupByField,
        milestoneField,
        dependencyField,
        timeRange,
        timeScale,
        columnWidth,
        daysPerPixel,
        validRecords,
        groupedRecords,
        positionById,
        calculateMilestonePosition,
        getGroupLabel,
        getGroupColor,
        getTaskColor,
        dependencies,
        criticalTaskIds,
        calculateDependencyPath,
    };
}
