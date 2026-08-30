import { useCallback } from "react";
import type { MutableRefObject } from "react";
import { NodeViewProps } from "@kn/editor";
import {
    BitableAttrs,
    RecordData,
    FieldConfig,
    Person,
} from "../../types";
import {
    createEmptyRecord,
    createRecord,
    createRecords,
    sanitizeRecordValues,
    updatedByPatch,
} from "../../utils/record";

/** Common dependencies shared across all action hooks. */
export interface ActionDeps {
    attrsRef: MutableRefObject<BitableAttrs>;
    updateAttributes: NodeViewProps["updateAttributes"];
    currentPersonRef: MutableRefObject<Person | undefined>;
}

/**
 * Record CRUD operations: add, create, update, batch update, delete, and
 * Excel import.
 */
export function useRecordActions(
    deps: ActionDeps,
    selectedRecord: RecordData | null,
    setSelectedRecord: (r: RecordData | null) => void
) {
    const { attrsRef, updateAttributes, currentPersonRef } = deps;

    const handleAddRecord = useCallback(() => {
        const { data: currentData = [], fields } = attrsRef.current;
        const newRecord = createEmptyRecord(fields, currentData, currentPersonRef.current);
        updateAttributes({ data: [...currentData, newRecord] });
    }, [attrsRef, updateAttributes, currentPersonRef]);

    const handleCreateRecord = useCallback(
        (values: Partial<RecordData>): RecordData => {
            const { data: currentData = [], fields } = attrsRef.current;
            const newRecord = createRecord(fields, currentData, values, currentPersonRef.current);
            updateAttributes({ data: [...currentData, newRecord] });
            return newRecord;
        },
        [attrsRef, updateAttributes, currentPersonRef]
    );

    const handleUpdateRecord = useCallback(
        (recordId: string, updates: Partial<RecordData>) => {
            const currentData = attrsRef.current.data || [];
            const fields = attrsRef.current.fields;
            const safeUpdates = sanitizeRecordValues(fields, updates);
            const byUpdater = updatedByPatch(fields, currentPersonRef.current);
            const newData = currentData.map((record: RecordData) =>
                String(record.id) === String(recordId)
                    ? { ...record, ...safeUpdates, ...byUpdater, updatedTime: new Date().toISOString() }
                    : record
            );
            updateAttributes({ data: newData });

            if (String(selectedRecord?.id) === String(recordId)) {
                const updatedRecord = newData.find((record) => String(record.id) === String(recordId));
                if (updatedRecord) setSelectedRecord(updatedRecord);
            }
        },
        [attrsRef, updateAttributes, currentPersonRef, selectedRecord?.id, setSelectedRecord]
    );

    const handleBatchUpdateRecords = useCallback(
        (updatesMap: Map<string, Partial<RecordData>>) => {
            const currentData = attrsRef.current.data || [];
            const now = new Date().toISOString();
            const fields = attrsRef.current.fields;
            const byUpdater = updatedByPatch(fields, currentPersonRef.current);
            const newData = currentData.map((record: RecordData) => {
                const recordUpdates = updatesMap.get(String(record.id));
                if (recordUpdates) {
                    const safeUpdates = sanitizeRecordValues(fields, recordUpdates);
                    return { ...record, ...safeUpdates, ...byUpdater, updatedTime: now };
                }
                return record;
            });
            updateAttributes({ data: newData });
        },
        [attrsRef, updateAttributes, currentPersonRef]
    );

    const handleDeleteRecord = useCallback(
        (recordIds: string[]) => {
            const currentData = attrsRef.current.data || [];
            const ids = new Set(recordIds.map(String));
            const newData = currentData.filter((record) => !ids.has(String(record.id)));
            updateAttributes({ data: newData });
        },
        [attrsRef, updateAttributes]
    );

    const handleExcelImport = useCallback(
        (newFields: FieldConfig[], newRecords: Array<Partial<RecordData>>) => {
            const { data: currentData = [], fields } = attrsRef.current;
            const mergedFields = [...fields, ...newFields];
            const importedRecords = createRecords(
                mergedFields,
                currentData,
                newRecords,
                currentPersonRef.current
            );
            updateAttributes({
                fields: mergedFields,
                data: [...currentData, ...importedRecords],
            });
        },
        [attrsRef, updateAttributes]
    );

    const handleDuplicateRecord = useCallback(
        (recordIds: string[]) => {
            const { data: currentData = [], fields } = attrsRef.current;
            const ids = new Set(recordIds.map(String));
            const sourceRecords = currentData.filter((record) => ids.has(String(record.id)));
            const duplicatedRecords: RecordData[] = [];
            sourceRecords.forEach((record) => {
                duplicatedRecords.push(
                    createRecord(
                        fields,
                        [...currentData, ...duplicatedRecords],
                        record,
                        currentPersonRef.current
                    )
                );
            });
            if (duplicatedRecords.length > 0) {
                updateAttributes({ data: [...currentData, ...duplicatedRecords] });
            }
        },
        [attrsRef, updateAttributes, currentPersonRef]
    );

    return {
        handleAddRecord,
        handleCreateRecord,
        handleUpdateRecord,
        handleBatchUpdateRecords,
        handleDeleteRecord,
        handleDuplicateRecord,
        handleExcelImport,
    };
}
