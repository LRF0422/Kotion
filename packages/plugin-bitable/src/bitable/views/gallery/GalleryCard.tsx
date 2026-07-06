import React, { useState } from "react";
import { ImageIcon, Expand } from "@kn/icon";
import { FieldConfig, RecordData, FieldType } from "../../../types";

interface GalleryCardProps {
    record: RecordData;
    coverUrl: string | null;
    titleField?: FieldConfig;
    displayFields: FieldConfig[];
    fitType: "cover" | "contain";
    onClick?: () => void;
    onDragStart?: (e: React.DragEvent) => void;
    onDragEnd?: (e: React.DragEvent) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;
    draggable?: boolean;
}

/** Format a field value for display in gallery card. */
function formatFieldValue(value: any, field: FieldConfig): string {
    if (value === null || value === undefined) return "";
    switch (field.type) {
        case FieldType.DATE:
            if (value) {
                try {
                    return new Date(value).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                    });
                } catch {
                    return String(value);
                }
            }
            return "";
        case FieldType.CHECKBOX:
            return value ? "\u2713" : "";
        case FieldType.SELECT: {
            const opt = field.options?.find((o: any) => o.id === value);
            return opt?.label || String(value);
        }
        case FieldType.MULTI_SELECT:
            if (Array.isArray(value)) {
                return value
                    .map((id: string) => {
                        const opt = field.options?.find((o: any) => o.id === id);
                        return opt?.label || id;
                    })
                    .join(", ");
            }
            return String(value);
        case FieldType.PROGRESS:
            return `${value}%`;
        case FieldType.RATING:
            return "\u2605".repeat(value || 0);
        default:
            return String(value);
    }
}

/**
 * Gallery card with cover image, title field, and preview fields.
 * Hover shows expand icon (top-right).
 */
export const GalleryCard: React.FC<GalleryCardProps> = ({
    record,
    coverUrl,
    titleField,
    displayFields,
    fitType,
    onClick,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDrop,
    draggable,
}) => {
    const [imageError, setImageError] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const title = titleField ? record[titleField.id] : null;

    return (
        <div
            className="bitable-gallery__card"
            role="button"
            tabIndex={0}
            draggable={draggable}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onClick?.();
                }
            }}
        >
            <div className="bitable-gallery__card-cover-area">
                {coverUrl && !imageError ? (
                    <>
                        <img
                            src={coverUrl}
                            alt=""
                            className={`bitable-gallery__card-cover${
                                fitType === "contain" ? " bitable-gallery__card-cover--contain" : ""
                            }${imageLoaded ? "" : " bitable-gallery__card-cover--loading"}`}
                            onLoad={() => setImageLoaded(true)}
                            onError={() => setImageError(true)}
                        />
                        {!imageLoaded && (
                            <div className="bitable-gallery__card-cover-spinner" />
                        )}
                    </>
                ) : (
                    <div className="bitable-gallery__card-cover-placeholder">
                        <ImageIcon style={{ width: 32, height: 32 }} />
                    </div>
                )}
            </div>

            <button
                className="bitable-gallery__card-expand"
                onClick={(e) => {
                    e.stopPropagation();
                    onClick?.();
                }}
            >
                <Expand style={{ width: 14, height: 14 }} />
            </button>

            <div className="bitable-gallery__card-body">
                {title != null && (
                    <div className="bitable-gallery__card-title">
                        {String(title)}
                    </div>
                )}
                {displayFields.map((field) => {
                    const value = formatFieldValue(record[field.id], field);
                    if (!value) return null;
                    return (
                        <div key={field.id} className="bitable-gallery__card-field">
                            <span className="bitable-gallery__card-field-label">
                                {field.title}
                            </span>
                            <span className="bitable-gallery__card-field-value">
                                {value}
                            </span>
                        </div>
                    );
                })}
                {!title && displayFields.length === 0 && (
                    <div className="bitable-gallery__card-empty">-</div>
                )}
            </div>
        </div>
    );
};
