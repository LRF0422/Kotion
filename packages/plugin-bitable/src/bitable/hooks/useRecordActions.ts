import { useCallback } from "react";
import type { MutableRefObject } from "react";
import { NodeViewProps } from "@kn/editor";
import {
    BitableAttrs,
    RecordData,
    FieldConfig,
    Person,
} from "../../types";
import { createEmptyRecord, updatedByPatch } from "../../utils/record";
import { generateRecordId } from "../../utils/id";

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
        (values: Partial<RecordData>) => {
            const { data: currentData = [], fields } = attrsRef.current;
            const newRecord = {
                ...createEmptyRecord(fields, currentData, currentPersonRef.current),
                ...values,
            };
            updateAttributes({ data: [...currentData, newRecord] });
        },
        [attrsRef, updateAttributes, currentPersonRef]
    );

    const handleUpdateRecord = useCallback(
        (recordId: string, updates: Partial<RecordData>) => {
            const currentData = attrsRef.current.data || [];
            const byUpdater = updatedByPatch(attrsRef.current.fields, currentPersonRef.current);
            const newData = currentData.map((record: any) =>
                record.id === recordId
                    ? { ...record, ...updates, ...byUpdater, updatedTime: new Date().toISOString() }
                    : record
            );
            updateAttributes({ data: newData });

            if (selectedRecord?.id === recordId) {
                const updatedRecord = newData.find((r: any) => r.id === recordId);
                if (updatedRecord) setSelectedRecord(updatedRecord);
            }
        },
        [attrsRef, updateAttributes, currentPersonRef, selectedRecord?.id, setSelectedRecord]
    );

    const handleBatchUpdateRecords = useCallback(
        (updatesMap: Map<string, Partial<RecordData>>) => {
            const currentData = attrsRef.current.data || [];
            const now = new Date().toISOString();
            const byUpdater = updatedByPatch(attrsRef.current.fields, currentPersonRef.current);
            const newData = currentData.map((record: any) => {
                const recordUpdates = updatesMap.get(record.id);
                if (recordUpdates) {
                    return { ...record, ...recordUpdates, ...byUpdater, updatedTime: now };
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
            const newData = currentData.filter((record: any) => !recordIds.includes(record.id));
            updateAttributes({ data: newData });
        },
        [attrsRef, updateAttributes]
    );

    const handleExcelImport = useCallback(
        (newFields: FieldConfig[], newRecords: RecordData[]) => {
            const { data: currentData = [], fields } = attrsRef.current;
            const mergedFields = [...fields, ...newFields];
            const idField = fields.find((f) => f.type === "id");
            const startId = currentData.length + 1;
            const recordsWithId = newRecords.map((record, index) => ({
                ...record,
                [idField?.id || "id"]: startId + index,
            }));
            const mergedData = [...currentData, ...recordsWithId];
            updateAttributes({ fields: mergedFields, data: mergedData });
        },
        [attrsRef, updateAttributes]
    );

    const handleDuplicateRecord = useCallback(
        (recordIds: string[]) => {
            const currentData = attrsRef.current.data || [];
            const now = new Date().toISOString();
            const byUpdater = updatedByPatch(attrsRef.current.fields, currentPersonRef.current);
            const duplicatedRecords = currentData
                .filter((record: any) => recordIds.includes(record.id))
                .map((record: any) => {
                    const { id, createdTime, updatedTime, ...rest } = record;
                    return {
                        ...rest,
                        ...byUpdater,
                        id: generateRecordId(),
                        createdTime: now,
                        updatedTime: now,
                    };
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
