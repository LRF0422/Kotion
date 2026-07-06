import React, { useState, useCallback } from "react";
import { FieldConfig, RecordData, FieldType } from "../../../types";
import { GalleryCard } from "./GalleryCard";

interface GalleryGridProps {
    records: RecordData[];
    coverField?: FieldConfig;
    titleField?: FieldConfig;
    displayFields: FieldConfig[];
    fitType: "cover" | "contain";
    cardSize: "small" | "medium" | "large";
    canReorder: boolean;
    onRecordClick?: (record: RecordData) => void;
    onReorder?: (sourceId: string, targetId: string) => void;
}

/** Get cover image URL from a record's cover field. */
function getCoverImageUrl(record: RecordData, coverField?: FieldConfig): string | null {
    if (!coverField) return null;
    const value = record[coverField.id];
    if (!value) return null;

    if (coverField.type === FieldType.IMAGE) {
        if (Array.isArray(value)) return value[0] || null;
        return value as string;
    }
    if (coverField.type === FieldType.URL) return value as string;
    if (coverField.type === FieldType.TEXT && typeof value === "string") {
        if (
            value.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i) ||
            value.startsWith("data:image/")
        ) {
            return value;
        }
    }
    return null;
}

/**
 * Gallery grid with optional drag-to-reorder.
 * When `canReorder` is true (no active sort), cards can be dragged to reorder.
 */
export const GalleryGrid: React.FC<GalleryGridProps> = ({
    records,
    coverField,
    titleField,
    displayFields,
    fitType,
    cardSize,
    canReorder,
    onRecordClick,
    onReorder,
}) => {
    const [dragSourceId, setDragSourceId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);

    const handleDragStart = useCallback(
        (recordId: string) => (e: React.DragEvent) => {
            if (!canReorder) return;
            setDragSourceId(recordId);
            e.dataTransfer.effectAllowed = "move";
        },
        [canReorder]
    );

    const handleDragOver = useCallback(
        (recordId: string) => (e: React.DragEvent) => {
            if (!canReorder || !dragSourceId || dragSourceId === recordId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDragOverId(recordId);
        },
        [canReorder, dragSourceId]
    );

    const handleDrop = useCallback(
        (recordId: string) => (e: React.DragEvent) => {
            if (!canReorder || !dragSourceId || dragSourceId === recordId) return;
            e.preventDefault();
            onReorder?.(dragSourceId, recordId);
            setDragSourceId(null);
            setDragOverId(null);
        },
        [canReorder, dragSourceId, onReorder]
    );

    const handleDragEnd = useCallback((_e: React.DragEvent) => {
        setDragSourceId(null);
        setDragOverId(null);
    }, []);

    return (
        <div className={`bitable-gallery__grid bitable-gallery__grid--${cardSize}`}>
            {records.map((record) => (
                <div
                    key={record.id}
                    className={`bitable-gallery__card-slot${
                        dragOverId === record.id && dragSourceId !== record.id
                            ? " bitable-gallery__card-slot--drop-target"
                            : ""
                    }${dragSourceId === record.id ? " bitable-gallery__card-slot--dragging" : ""}`}
                >
                    <GalleryCard
                        record={record}
                        coverUrl={getCoverImageUrl(record, coverField)}
                        titleField={titleField}
                        displayFields={displayFields}
                        fitType={fitType}
                        onClick={() => onRecordClick?.(record)}
                        draggable={canReorder}
                        onDragStart={handleDragStart(record.id)}
                        onDragEnd={handleDragEnd}
                        onDragOver={handleDragOver(record.id)}
                        onDrop={handleDrop(record.id)}
                    />
                </div>
            ))}
        </div>
    );
};
