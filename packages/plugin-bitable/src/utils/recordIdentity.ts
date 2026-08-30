import { DEFAULT_RECORD_NUMBER_FIELD_ID } from "../bitable/constants/defaults";
import type { FieldConfig, RecordData, ViewConfig } from "../types";
import { FieldType } from "../types";
import { generateRecordId } from "./id";

export const STRUCTURAL_RECORD_ID_FIELD_ID = "id";

export interface RecordIdentityNormalizationResult {
    changed: boolean;
    fields: FieldConfig[];
    views: ViewConfig[];
    data: RecordData[];
}

function chooseRecordNumberFieldId(fields: FieldConfig[], legacyFieldId: string): string {
    const occupied = new Set(fields.filter((field) => field.id !== legacyFieldId).map((field) => field.id));
    if (!occupied.has(DEFAULT_RECORD_NUMBER_FIELD_ID)) {
        return DEFAULT_RECORD_NUMBER_FIELD_ID;
    }

    let suffix = 2;
    while (occupied.has(`${DEFAULT_RECORD_NUMBER_FIELD_ID}_${suffix}`)) {
        suffix += 1;
    }
    return `${DEFAULT_RECORD_NUMBER_FIELD_ID}_${suffix}`;
}

function remapFieldId(value: string | undefined, from: string, to: string): string | undefined {
    return value === from ? to : value;
}

function remapFieldIds(values: string[] | undefined, from: string, to: string): string[] | undefined {
    return values?.map((value) => (value === from ? to : value));
}

function remapViewFieldReferences(view: ViewConfig, from: string, to: string): ViewConfig {
    return {
        ...view,
        filters: view.filters?.map((filter) => ({
            ...filter,
            fieldId: remapFieldId(filter.fieldId, from, to)!,
        })),
        sorts: view.sorts?.map((sort) => ({
            ...sort,
            fieldId: remapFieldId(sort.fieldId, from, to)!,
        })),
        groups: view.groups?.map((group) => ({
            ...group,
            fieldId: remapFieldId(group.fieldId, from, to)!,
        })),
        hiddenFields: remapFieldIds(view.hiddenFields, from, to),
        fieldOrder: remapFieldIds(view.fieldOrder, from, to),
        kanbanConfig: view.kanbanConfig
            ? {
                  ...view.kanbanConfig,
                  groupByField: remapFieldId(view.kanbanConfig.groupByField, from, to)!,
                  cardCoverField: remapFieldId(view.kanbanConfig.cardCoverField, from, to),
                  displayFields: remapFieldIds(view.kanbanConfig.displayFields, from, to),
              }
            : undefined,
        galleryConfig: view.galleryConfig
            ? {
                  ...view.galleryConfig,
                  coverField: remapFieldId(view.galleryConfig.coverField, from, to)!,
                  displayFields: remapFieldIds(view.galleryConfig.displayFields, from, to),
              }
            : undefined,
        calendarConfig: view.calendarConfig
            ? {
                  ...view.calendarConfig,
                  dateField: remapFieldId(view.calendarConfig.dateField, from, to)!,
                  endDateField: remapFieldId(view.calendarConfig.endDateField, from, to),
                  titleField: remapFieldId(view.calendarConfig.titleField, from, to),
              }
            : undefined,
        timelineConfig: view.timelineConfig
            ? {
                  ...view.timelineConfig,
                  startDateField: remapFieldId(view.timelineConfig.startDateField, from, to)!,
                  endDateField: remapFieldId(view.timelineConfig.endDateField, from, to),
                  titleField: remapFieldId(view.timelineConfig.titleField, from, to),
                  progressField: remapFieldId(view.timelineConfig.progressField, from, to),
                  groupByField: remapFieldId(view.timelineConfig.groupByField, from, to),
                  milestoneField: remapFieldId(view.timelineConfig.milestoneField, from, to),
                  dependencyField: remapFieldId(view.timelineConfig.dependencyField, from, to),
                  colorField: remapFieldId(view.timelineConfig.colorField, from, to),
              }
            : undefined,
        formConfig: view.formConfig
            ? {
                  ...view.formConfig,
                  fieldIds: remapFieldIds(view.formConfig.fieldIds, from, to),
              }
            : undefined,
        chartConfig: view.chartConfig
            ? {
                  ...view.chartConfig,
                  xAxisField: remapFieldId(view.chartConfig.xAxisField, from, to)!,
                  yAxisFields: view.chartConfig.yAxisFields.map((axis) => ({
                      ...axis,
                      fieldId: remapFieldId(axis.fieldId, from, to)!,
                  })),
                  groupByField: remapFieldId(view.chartConfig.groupByField, from, to),
              }
            : undefined,
    };
}

function asAutoNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const numberValue = Number(value);
    if (!Number.isSafeInteger(numberValue) || numberValue <= 0) return null;
    return numberValue;
}

/**
 * Normalizes the legacy schema where the visible ID field and structural row
 * identity both occupied `record.id`. The result is safe to use immediately
 * and idempotent so callers can persist it with a single attribute update.
 */
export function normalizeRecordIdentity(
    fields: FieldConfig[],
    views: ViewConfig[],
    data: RecordData[]
): RecordIdentityNormalizationResult {
    const legacyIdField = fields.find(
        (field) => field.type === FieldType.ID && field.id === STRUCTURAL_RECORD_ID_FIELD_ID
    );
    const recordNumberFieldId = legacyIdField
        ? chooseRecordNumberFieldId(fields, legacyIdField.id)
        : undefined;

    let changed = false;
    const normalizedFields = legacyIdField
        ? fields.map((field) => {
              if (field !== legacyIdField) return field;
              changed = true;
              return { ...field, id: recordNumberFieldId! };
          })
        : fields;
    const normalizedViews = legacyIdField
        ? views.map((view) => remapViewFieldReferences(view, legacyIdField.id, recordNumberFieldId!))
        : views;

    const legacyDisplayValues = data.map((record) => (record as Record<string, unknown>).id);
    const usedIdentities = new Set<string>();
    let normalizedData = data.map((record) => {
        const rawId = (record as Record<string, unknown>).id;
        let normalizedId = rawId === null || rawId === undefined || rawId === ""
            ? generateRecordId()
            : String(rawId);

        if (usedIdentities.has(normalizedId)) {
            normalizedId = generateRecordId();
        }
        usedIdentities.add(normalizedId);

        if (rawId !== normalizedId) {
            changed = true;
            return { ...record, id: normalizedId };
        }
        return record;
    });

    const numberFields = normalizedFields.filter(
        (field) =>
            field.id !== STRUCTURAL_RECORD_ID_FIELD_ID &&
            (field.type === FieldType.ID || field.type === FieldType.AUTO_NUMBER)
    );

    numberFields.forEach((field) => {
        const candidates = normalizedData.map((record, index) =>
            legacyIdField && field.id === recordNumberFieldId
                ? legacyDisplayValues[index]
                : record[field.id]
        );
        let nextNumber = candidates.reduce((max, value) => {
            const numberValue = asAutoNumber(value);
            return numberValue === null ? max : Math.max(max, numberValue);
        }, 0) + 1;
        const usedNumbers = new Set<number>();

        normalizedData = normalizedData.map((record, index) => {
            const candidate = asAutoNumber(candidates[index]);
            let numberValue: number;
            if (candidate === null || usedNumbers.has(candidate)) {
                while (usedNumbers.has(nextNumber)) nextNumber += 1;
                numberValue = nextNumber;
                nextNumber += 1;
            } else {
                numberValue = candidate;
            }
            usedNumbers.add(numberValue);

            if (record[field.id] !== numberValue) {
                changed = true;
                return { ...record, [field.id]: numberValue };
            }
            return record;
        });
    });

    return {
        changed,
        fields: normalizedFields,
        views: normalizedViews,
        data: normalizedData,
    };
}
