import { useCallback } from "react";
import {
    BitableAttrs,
    FieldConfig,
    FieldType,
    SelectOption,
    RecordData,
} from "../../types";
import { convertFieldValue, prepareSelectOptions } from "../../utils/fieldConversion";
import type { ActionDeps } from "./useRecordActions";

/**
 * Field CRUD operations: add, update, delete, reorder, and type conversion.
 */
export function useFieldActions(deps: ActionDeps) {
    const { attrsRef, updateAttributes } = deps;

    const handleAddField = useCallback(
        (field: FieldConfig) => {
            const newFields = [...attrsRef.current.fields, field];
            updateAttributes({ fields: newFields });
        },
        [attrsRef, updateAttributes]
    );

    const handleUpdateField = useCallback(
        (fieldId: string, updates: Partial<FieldConfig>) => {
            const newFields = attrsRef.current.fields.map((field) =>
                field.id === fieldId ? { ...field, ...updates } : field
            );
            updateAttributes({ fields: newFields });
        },
        [attrsRef, updateAttributes]
    );

    const handleDeleteField = useCallback(
        (fieldId: string) => {
            const { data: currentData = [], fields } = attrsRef.current;
            const field = fields.find((candidate) => candidate.id === fieldId);
            if (!field || field.type === FieldType.ID || fieldId === "id") return;

            const newFields = fields.filter((candidate) => candidate.id !== fieldId);
            const newData: RecordData[] = currentData.map((record: any) => {
                const { [fieldId]: _, ...rest } = record;
                return rest;
            }) as RecordData[];
            updateAttributes({ fields: newFields, data: newData });
        },
        [attrsRef, updateAttributes]
    );

    const handleReorderFields = useCallback(
        (newOrder: FieldConfig[]) => {
            updateAttributes({ fields: newOrder });
        },
        [updateAttributes]
    );

    const handleConvertFieldType = useCallback(
        (fieldId: string, newType: FieldType, newOptions?: SelectOption[]) => {
            const { data: currentData = [], fields } = attrsRef.current;
            const field = fields.find((f) => f.id === fieldId);
            if (!field || field.type === FieldType.ID || fieldId === "id") return;

            const oldType = field.type;
            const updatedField: FieldConfig = { ...field, type: newType };

            if (newType === FieldType.SELECT || newType === FieldType.MULTI_SELECT) {
                updatedField.options = prepareSelectOptions(currentData, field, newOptions || []);
            } else {
                delete updatedField.options;
            }

            const newFields = fields.map((f) => (f.id === fieldId ? updatedField : f));
            const newData = currentData.map((record: any) => {
                const value = record[fieldId];
                const convertedValue = convertFieldValue(
                    value,
                    oldType,
                    newType,
                    updatedField,
                    field
                );
                return { ...record, [fieldId]: convertedValue };
            });

            updateAttributes({ fields: newFields, data: newData });
        },
        [attrsRef, updateAttributes]
    );

    return {
        handleAddField,
        handleUpdateField,
        handleDeleteField,
        handleReorderFields,
        handleConvertFieldType,
    };
}
