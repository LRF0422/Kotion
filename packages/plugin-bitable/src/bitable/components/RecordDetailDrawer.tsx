import React, { useCallback, useEffect, useRef } from "react";
import { Sheet, SheetContent } from "@kn/ui";
import { useTranslation } from "@kn/common";
import { X, ChevronLeft, ChevronRight, Plus } from "@kn/icon";
import { FieldConfig, RecordData, FieldType } from "../../types";
import { getFieldTypeIcon } from "../fields/fieldIcons";
import { DetailFieldValue } from "./RecordDetailFields";
import { RecordEditor } from "./RecordEditor";
import { format } from "date-fns";

interface RecordDetailDrawerProps {
    open: boolean;
    record: RecordData | null;
    fields: FieldConfig[];
    recordIds: string[];
    onClose: () => void;
    onNavigate: (recordId: string) => void;
    onUpdateRecord: (recordId: string, updates: Partial<RecordData>) => void;
    editable?: boolean;
}

/**
 * Notion-style side drawer for viewing/editing a single record.
 * Slides in from right, 480px wide, full height.
 * - Header: inline editable title, ID badge, prev/next nav, close button
 * - Properties: two-column label/value layout, click to edit
 * - Content: Tiptap rich text editor
 * - Footer: created/updated metadata
 */
export const RecordDetailDrawer: React.FC<RecordDetailDrawerProps> = ({
    open,
    record,
    fields,
    recordIds,
    onClose,
    onNavigate,
    onUpdateRecord,
    editable = true,
}) => {
    const { t } = useTranslation();
    const titleRef = useRef<HTMLDivElement>(null);

    // Keep last non-null record so content stays mounted during close animation
    const [activeRecord, setActiveRecord] = React.useState(record);
    useEffect(() => {
        if (record) setActiveRecord(record);
    }, [record]);

    // Sync title contentEditable when record changes
    useEffect(() => {
        if (titleRef.current && activeRecord) {
            const titleField = fields.find(
                (f) =>
                    f.type === FieldType.TEXT && f.isShow !== false
            );
            const title = titleField
                ? String(activeRecord[titleField.id] || "")
                : "";
            titleRef.current.textContent = title;
        }
    }, [activeRecord, fields]);

    const handleContentUpdate = useCallback(
        (content: any) => {
            if (activeRecord) {
                onUpdateRecord(activeRecord.id, { content });
            }
        },
        [activeRecord, onUpdateRecord]
    );

    if (!activeRecord) return null;

    const titleField = fields.find(
        (f) => f.type === FieldType.TEXT && f.isShow !== false
    );
    const idField = fields.find((f) => f.type === FieldType.ID);

    const currentIndex = recordIds.indexOf(activeRecord.id);
    const hasPrev = currentIndex > 0;
    const hasNext =
        currentIndex >= 0 && currentIndex < recordIds.length - 1;

    return (
        <Sheet
            open={open}
            onOpenChange={(isOpen) => {
                if (!isOpen) onClose();
            }}
        >
            <SheetContent
                side="right"
                className="p-0 flex flex-col"
                style={{ width: "var(--bt-drawer-w)", maxWidth: "90vw" }}
            >
                {/* Header */}
                <div className="bitable-drawer__header">
                    <div className="bitable-drawer__title-area">
                        {idField && (
                            <span className="bitable-drawer__id-badge">
                                #{activeRecord[idField.id]}
                            </span>
                        )}
                        <div
                            ref={titleRef}
                            className="bitable-drawer__title"
                            contentEditable={editable}
                            suppressContentEditableWarning
                            data-placeholder={t(
                                "bitable.record.untitled",
                                "Untitled"
                            )}
                            onBlur={(e) => {
                                const newTitle =
                                    e.target.textContent || "";
                                if (titleField) {
                                    onUpdateRecord(activeRecord.id, {
                                        [titleField.id]: newTitle,
                                    });
                                }
                            }}
                        />
                    </div>

                    {/* Prev/Next navigation */}
                    <div className="bitable-drawer__nav">
                        <button
                            className="bitable-toolbar__action"
                            disabled={!hasPrev}
                            onClick={() =>
                                hasPrev &&
                                onNavigate(recordIds[currentIndex - 1])
                            }
                            title={t("bitable.record.previous", "Previous")}
                        >
                            <ChevronLeft style={{ width: 16, height: 16 }} />
                        </button>
                        <button
                            className="bitable-toolbar__action"
                            disabled={!hasNext}
                            onClick={() =>
                                hasNext &&
                                onNavigate(recordIds[currentIndex + 1])
                            }
                            title={t("bitable.record.next", "Next")}
                        >
                            <ChevronRight style={{ width: 16, height: 16 }} />
                        </button>
                        <button
                            className="bitable-toolbar__action"
                            onClick={onClose}
                            title={t("bitable.record.close", "Close")}
                        >
                            <X style={{ width: 16, height: 16 }} />
                        </button>
                    </div>
                </div>

                {/* Scrollable body */}
                <div className="bitable-drawer__body">
                    {/* Properties section */}
                    <div className="bitable-drawer__properties">
                        {fields
                            .filter(
                                (f) =>
                                    f.isShow !== false &&
                                    f.type !== FieldType.ID &&
                                    f !== titleField
                            )
                            .map((field) => (
                                <div
                                    key={field.id}
                                    className="bitable-drawer__field"
                                >
                                    <div className="bitable-drawer__field-label">
                                        {getFieldTypeIcon(
                                            field.type,
                                            "h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                        )}
                                        <span>{field.title}</span>
                                    </div>
                                    <div className="bitable-drawer__field-value">
                                        <DetailFieldValue
                                            field={field}
                                            value={activeRecord[field.id]}
                                            editable={editable}
                                            onChange={(v) =>
                                                onUpdateRecord(
                                                    activeRecord.id,
                                                    { [field.id]: v }
                                                )
                                            }
                                            density="comfortable"
                                        />
                                    </div>
                                </div>
                            ))}
                        {editable && (
                            <button className="bitable-drawer__add-property">
                                <Plus style={{ width: 14, height: 14 }} />
                                {t(
                                    "bitable.record.addProperty",
                                    "Add property"
                                )}
                            </button>
                        )}
                    </div>

                    {/* Divider */}
                    <div className="bitable-drawer__divider" />

                    {/* Content section */}
                    <div className="bitable-drawer__content">
                        <RecordEditor
                            content={activeRecord.content}
                            onUpdate={handleContentUpdate}
                            editable={editable}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="bitable-drawer__footer">
                    {activeRecord.createdTime && (
                        <span className="bitable-drawer__footer-text">
                            {t("bitable.fieldTypes.createdTime")}:{" "}
                            {format(
                                new Date(activeRecord.createdTime),
                                "PPP p"
                            )}
                        </span>
                    )}
                    {activeRecord.updatedTime && (
                        <span className="bitable-drawer__footer-text">
                            {" · "}
                            {t("bitable.fieldTypes.updatedTime")}:{" "}
                            {format(
                                new Date(activeRecord.updatedTime),
                                "PPP p"
                            )}
                        </span>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
};
