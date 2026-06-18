import React, { useCallback } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    Separator,
    ScrollArea,
} from "@kn/ui";
import { useTranslation } from "@kn/common";
import { FieldConfig, RecordData, FieldType } from "../../types";
import { RecordEditor } from "./RecordEditor";
import { getFieldIcon, DetailFieldValue } from "./RecordDetailFields";
import { format } from "date-fns";

interface RecordDetailModalProps {
    open: boolean;
    record: RecordData | null;
    fields: FieldConfig[];
    onClose: () => void;
    onUpdateRecord: (recordId: string, updates: Partial<RecordData>) => void;
    editable?: boolean;
}

export const RecordDetailModal: React.FC<RecordDetailModalProps> = ({
    open,
    record,
    fields,
    onClose,
    onUpdateRecord,
    editable = true,
}) => {
    if (!record) return null;

    const { t } = useTranslation();
    const titleField = fields.find(f => f.type === FieldType.TEXT && f.isShow !== false);
    const title = titleField ? String(record[titleField.id] || '') : '';
    const idField = fields.find(f => f.type === FieldType.ID);

    const handleContentUpdate = useCallback((content: any) => {
        if (record) {
            onUpdateRecord(record.id, { content });
        }
    }, [record, onUpdateRecord]);

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
            <DialogContent className="max-w-[900px] w-[95vw] max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
                {/* Header */}
                <DialogHeader className="px-6 pt-5 pb-4 border-b border-border space-y-1 flex-shrink-0">
                    {idField && (
                        <span className="text-xs font-mono text-muted-foreground">
                            #{record[idField.id]}
                        </span>
                    )}
                    <DialogTitle className="text-lg leading-tight">
                        {title || <span className="text-muted-foreground italic">{t('bitable.galleryView.noContent')}</span>}
                    </DialogTitle>
                </DialogHeader>

                {/* Scrollable body */}
                <ScrollArea className="flex-1 min-h-0">
                    <div className="flex flex-col">
                        {/* Properties section */}
                        <div className="px-6 py-4 space-y-0.5">
                            {fields
                                .filter(f => f.isShow !== false && f.type !== FieldType.ID && f !== titleField)
                                .map(field => (
                                    <div
                                        key={field.id}
                                        className="grid grid-cols-[110px_1fr] md:grid-cols-[140px_1fr] gap-3 items-start py-2 rounded-md -mx-2 px-2 hover:bg-muted/50 transition-colors"
                                    >
                                        {/* Label */}
                                        <div className="flex items-center gap-2 pt-1">
                                            {getFieldIcon(field.type)}
                                            <span className="text-xs font-medium text-muted-foreground truncate">
                                                {field.title}
                                            </span>
                                        </div>
                                        {/* Value */}
                                        <div className="min-h-[28px] flex items-start pt-0.5">
                                            <DetailFieldValue
                                                field={field}
                                                value={record[field.id]}
                                                editable={editable}
                                                onChange={(v) => onUpdateRecord(record.id, { [field.id]: v })}
                                                density="compact"
                                            />
                                        </div>
                                    </div>
                                ))}
                        </div>

                        {/* Separator */}
                        <Separator className="mx-6" />

                        {/* Editor section */}
                        <div className="px-6 py-4 min-h-[300px]">
                            <RecordEditor
                                content={record.content}
                                onUpdate={handleContentUpdate}
                                editable={editable}
                                className="min-h-[300px]"
                            />
                        </div>
                    </div>
                </ScrollArea>

                {/* Footer */}
                {record.createdTime && (
                    <div className="px-6 py-2.5 border-t border-border flex-shrink-0">
                        <span className="text-xs text-muted-foreground">
                            {t('bitable.fieldTypes.createdTime')}: {format(new Date(record.createdTime), 'PPP p')}
                        </span>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
