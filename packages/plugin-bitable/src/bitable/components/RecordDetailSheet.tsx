import React from "react";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    ScrollArea,
} from "@kn/ui";
import { useTranslation } from "@kn/common";
import { Editor } from "@kn/editor";
import { FieldConfig, RecordData, FieldType } from "../../types";
import { getFieldIcon, DetailFieldValue } from "./RecordDetailFields";
import { format } from "date-fns";

interface RecordDetailSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    record: RecordData | null;
    fields: FieldConfig[];
    onUpdateRecord: (recordId: string, updates: Partial<RecordData>) => void;
    editable: boolean;
    editor?: Editor;
}

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

    const { t } = useTranslation();
    const titleField = fields.find(f => f.type === FieldType.TEXT && f.isShow !== false);
    const title = titleField ? String(record[titleField.id] || '') : '';
    const idField = fields.find(f => f.type === FieldType.ID);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full md:w-[540px] p-0 flex flex-col">
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-border">
                    <SheetHeader className="space-y-1">
                        {idField && (
                            <span className="text-xs font-mono text-muted-foreground">
                                #{record[idField.id]}
                            </span>
                        )}
                        <SheetTitle className="text-lg leading-tight">
                            {title || <span className="text-muted-foreground italic">{t('bitable.galleryView.noContent')}</span>}
                        </SheetTitle>
                    </SheetHeader>
                </div>

                {/* Fields */}
                <ScrollArea className="flex-1">
                    <div className="px-6 py-4 space-y-1">
                        {fields
                            .filter(f => f.isShow !== false && f.type !== FieldType.ID && f !== titleField)
                            .map(field => (
                                <div
                                    key={field.id}
                                    className="grid grid-cols-[110px_1fr] md:grid-cols-[140px_1fr] gap-3 items-start py-2.5 rounded-md -mx-2 px-2 hover:bg-muted/50 transition-colors"
                                >
                                    {/* Label */}
                                    <div className="flex items-center gap-2 pt-1.5">
                                        {getFieldIcon(field.type)}
                                        <span className="text-xs font-medium text-muted-foreground truncate">
                                            {field.title}
                                        </span>
                                    </div>
                                    {/* Value */}
                                    <div className="min-h-[32px] flex items-start pt-0.5">
                                        <DetailFieldValue
                                            field={field}
                                            value={record[field.id]}
                                            editable={editable}
                                            onChange={(v) => onUpdateRecord(record.id, { [field.id]: v })}
                                            density="comfortable"
                                        />
                                    </div>
                                </div>
                            ))}
                    </div>
                </ScrollArea>

                {/* Footer */}
                {record.createdTime && (
                    <div className="px-6 py-3 border-t border-border">
                        <span className="text-xs text-muted-foreground">
                            {t('bitable.fieldTypes.createdTime')}: {format(new Date(record.createdTime), 'PPP p')}
                        </span>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
};
