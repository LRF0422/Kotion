import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@kn/ui";
import { Editor } from "@kn/editor";
import { FieldConfig, RecordData, FieldType } from "../../types";
import { getFieldRenderer, getFieldEditor } from "../fields/FieldRenderers";

interface RecordDetailSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    record: RecordData | null;
    fields: FieldConfig[];
    onUpdateRecord: (recordId: string, updates: Partial<RecordData>) => void;
    editable: boolean;
    editor?: Editor;
}

const READONLY_TYPES = new Set([
    FieldType.ID,
    FieldType.AUTO_NUMBER,
    FieldType.CREATED_TIME,
    FieldType.UPDATED_TIME,
]);

export const RecordDetailSheet: React.FC<RecordDetailSheetProps> = ({
    open,
    onOpenChange,
    record,
    fields,
    onUpdateRecord,
    editable,
    editor,
}) => {
    if (!record) return null;

    const titleField = fields.find(f => f.type === FieldType.TEXT && f.isShow !== false);
    const title = titleField ? String(record[titleField.id] || '') : `Record ${record.id}`;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[400px] sm:w-[500px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="truncate">{title}</SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-4">
                    {fields
                        .filter(f => f.isShow !== false)
                        .map(field => {
                            const isReadonly = READONLY_TYPES.has(field.type) || !editable;
                            const Renderer = getFieldRenderer(field.type);
                            const FieldEditor = getFieldEditor(field.type);

                            return (
                                <div key={field.id} className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">
                                        {field.title}
                                    </label>
                                    <div className="min-h-[32px]">
                                        {isReadonly ? (
                                            <div className="py-1">
                                                <Renderer value={record[field.id]} field={field} />
                                            </div>
                                        ) : (
                                            <FieldEditor
                                                value={record[field.id]}
                                                field={field}
                                                onChange={(value: any) => {
                                                    onUpdateRecord(record.id, { [field.id]: value });
                                                }}
                                                editor={editor}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                </div>
            </SheetContent>
        </Sheet>
    );
};
