import React, { useState } from "react";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    Input,
    Separator,
    Checkbox,
    Slider,
    Badge,
    ScrollArea,
} from "@kn/ui";
import { DateTimePicker, Rate } from "@kn/ui";
import { useTranslation } from "@kn/common";
import { Editor } from "@kn/editor";
import {
    Type,
    Hash,
    Calendar,
    CheckSquare,
    Link,
    Mail,
    Phone,
    Star,
    BarChart2,
    Circle,
    Clock,
    ImageIcon,
    Paperclip,
} from "@kn/icon";
import { FieldConfig, RecordData, FieldType, SelectOption } from "../../types";
import { getTagStyle } from "../../utils/colors";
import { format } from "date-fns";
import { zhCN, enUS } from "date-fns/locale";

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

const getFieldIcon = (type: FieldType) => {
    const cls = "h-3.5 w-3.5 shrink-0 text-muted-foreground";
    switch (type) {
        case FieldType.TEXT: return <Type className={cls} />;
        case FieldType.NUMBER: return <Hash className={cls} />;
        case FieldType.DATE: return <Calendar className={cls} />;
        case FieldType.CHECKBOX: return <CheckSquare className={cls} />;
        case FieldType.URL: return <Link className={cls} />;
        case FieldType.EMAIL: return <Mail className={cls} />;
        case FieldType.PHONE: return <Phone className={cls} />;
        case FieldType.RATING: return <Star className={cls} />;
        case FieldType.PROGRESS: return <BarChart2 className={cls} />;
        case FieldType.SELECT:
        case FieldType.MULTI_SELECT: return <Circle className={cls} />;
        case FieldType.IMAGE: return <ImageIcon className={cls} />;
        case FieldType.ATTACHMENT: return <Paperclip className={cls} />;
        case FieldType.CREATED_TIME:
        case FieldType.UPDATED_TIME: return <Clock className={cls} />;
        case FieldType.ID:
        case FieldType.AUTO_NUMBER: return <Hash className={cls} />;
        default: return <Type className={cls} />;
    }
};

// --- 详情面板专用的字段值组件 ---

const DetailText: React.FC<{ value: any; onChange: (v: string) => void; editable: boolean }> = ({ value, onChange, editable }) => {
    if (!editable) return <span className="text-sm">{value || '-'}</span>;
    return (
        <Input
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="h-9"
        />
    );
};

const DetailNumber: React.FC<{ value: any; field: FieldConfig; onChange: (v: number) => void; editable: boolean }> = ({ value, field, onChange, editable }) => {
    if (!editable) {
        if (typeof value !== 'number') return <span className="text-sm text-muted-foreground">-</span>;
        let formatted: string;
        switch (field.format) {
            case 'currency': formatted = `¥${value.toLocaleString()}`; break;
            case 'percent': formatted = `${value}%`; break;
            case 'decimal': formatted = value.toFixed(2); break;
            default: formatted = value.toLocaleString();
        }
        return <span className="text-sm tabular-nums">{formatted}</span>;
    }
    return (
        <Input
            type="number"
            value={value ?? ''}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-9"
        />
    );
};

const DetailSelect: React.FC<{ value: any; field: FieldConfig; onChange: (v: string) => void; editable: boolean }> = ({ value, field, onChange, editable }) => {
    const options = field.options || [];
    const selected = options.find((o: SelectOption) => o.id === value);

    if (!editable) {
        if (!selected) return <span className="text-sm text-muted-foreground">-</span>;
        const style = getTagStyle(selected.color);
        return (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium" style={{ backgroundColor: style.bg, color: style.text }}>
                {selected.label}
            </span>
        );
    }

    return (
        <div className="flex flex-wrap gap-1.5">
            {options.map((opt: SelectOption) => {
                const style = getTagStyle(opt.color);
                const isActive = opt.id === value;
                return (
                    <button
                        key={opt.id}
                        onClick={() => onChange(opt.id)}
                        className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium transition-all ${isActive ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : 'opacity-60 hover:opacity-100'}`}
                        style={{ backgroundColor: style.bg, color: style.text }}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
};

const DetailMultiSelect: React.FC<{ value: any; field: FieldConfig; onChange: (v: string[]) => void; editable: boolean }> = ({ value, field, onChange, editable }) => {
    const options = field.options || [];
    const selected: string[] = Array.isArray(value) ? value : [];

    if (!editable) {
        if (selected.length === 0) return <span className="text-sm text-muted-foreground">-</span>;
        return (
            <div className="flex flex-wrap gap-1.5">
                {selected.map(id => {
                    const opt = options.find((o: SelectOption) => o.id === id);
                    if (!opt) return null;
                    const style = getTagStyle(opt.color);
                    return (
                        <span key={id} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium" style={{ backgroundColor: style.bg, color: style.text }}>
                            {opt.label}
                        </span>
                    );
                })}
            </div>
        );
    }

    const toggle = (optId: string) => {
        if (selected.includes(optId)) {
            onChange(selected.filter(id => id !== optId));
        } else {
            onChange([...selected, optId]);
        }
    };

    return (
        <div className="flex flex-wrap gap-1.5">
            {options.map((opt: SelectOption) => {
                const style = getTagStyle(opt.color);
                const isActive = selected.includes(opt.id);
                return (
                    <button
                        key={opt.id}
                        onClick={() => toggle(opt.id)}
                        className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium transition-all ${isActive ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : 'opacity-40 hover:opacity-80'}`}
                        style={{ backgroundColor: style.bg, color: style.text }}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
};

const DetailDate: React.FC<{ value: any; field: FieldConfig; onChange: (v: string) => void; editable: boolean }> = ({ value, field, onChange, editable }) => {
    const { i18n } = useTranslation();
    const locale = i18n.language?.startsWith('zh') ? zhCN : enUS;

    if (!editable) {
        if (!value) return <span className="text-sm text-muted-foreground">-</span>;
        try {
            const fmt = field.format?.includes('HH') ? 'PPP p' : 'PPP';
            return <span className="text-sm">{format(new Date(value), fmt, { locale })}</span>;
        } catch {
            return <span className="text-sm">{String(value)}</span>;
        }
    }

    return (
        <DateTimePicker
            value={value ? new Date(value) : undefined}
            onChange={(date) => onChange(date?.toISOString() || '')}
            locale={locale}
            weekStartsOn={1}
            showOutsideDays
        />
    );
};

const DetailCheckbox: React.FC<{ value: any; onChange: (v: boolean) => void; editable: boolean }> = ({ value, onChange, editable }) => {
    return <Checkbox checked={Boolean(value)} onCheckedChange={editable ? onChange : undefined} disabled={!editable} />;
};

const DetailRating: React.FC<{ value: any; onChange: (v: number) => void; editable: boolean }> = ({ value, onChange, editable }) => {
    return (
        <Rate
            rating={typeof value === 'number' ? value : 0}
            totalStars={5}
            variant="yellow"
            size={22}
            onRatingChange={editable ? onChange : undefined}
            disabled={!editable}
        />
    );
};

const DetailProgress: React.FC<{ value: any; onChange: (v: number) => void; editable: boolean }> = ({ value, onChange, editable }) => {
    const progress = typeof value === 'number' ? value : 0;
    if (!editable) {
        return (
            <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-sm tabular-nums text-muted-foreground w-10 text-right">{progress}%</span>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-3">
            <Slider value={[progress]} onValueChange={(v) => onChange(v[0])} min={0} max={100} step={1} className="flex-1" />
            <span className="text-sm font-medium tabular-nums w-10 text-right">{progress}%</span>
        </div>
    );
};

const DetailLink: React.FC<{ value: any; type: FieldType; onChange: (v: string) => void; editable: boolean }> = ({ value, type, onChange, editable }) => {
    if (!editable) {
        if (!value) return <span className="text-sm text-muted-foreground">-</span>;
        const href = type === FieldType.EMAIL ? `mailto:${value}` : type === FieldType.PHONE ? `tel:${value}` : value;
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">
                {value}
            </a>
        );
    }
    const inputType = type === FieldType.EMAIL ? 'email' : type === FieldType.PHONE ? 'tel' : 'url';
    return (
        <Input
            type={inputType}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={type === FieldType.URL ? 'https://...' : ''}
            className="h-9"
        />
    );
};

const DetailReadonly: React.FC<{ value: any; field: FieldConfig }> = ({ value, field }) => {
    if (value === null || value === undefined) return <span className="text-sm text-muted-foreground">-</span>;

    if (field.type === FieldType.CREATED_TIME || field.type === FieldType.UPDATED_TIME) {
        try {
            return <span className="text-sm text-muted-foreground">{format(new Date(value), 'PPP p')}</span>;
        } catch {
            return <span className="text-sm text-muted-foreground">{String(value)}</span>;
        }
    }

    return <span className="text-sm text-muted-foreground font-mono">{String(value)}</span>;
};

const DetailImage: React.FC<{ value: any }> = ({ value }) => {
    const images: string[] = Array.isArray(value) ? value : (value ? [value] : []);
    if (images.length === 0) return <span className="text-sm text-muted-foreground">-</span>;
    return (
        <div className="flex flex-wrap gap-2">
            {images.map((src, i) => (
                <img key={i} src={src} alt="" className="h-20 w-20 object-cover rounded-md border border-border" />
            ))}
        </div>
    );
};

// --- 字段值渲染分发 ---

const DetailFieldValue: React.FC<{
    field: FieldConfig;
    value: any;
    editable: boolean;
    onChange: (v: any) => void;
}> = ({ field, value, editable, onChange }) => {
    const isReadonly = READONLY_TYPES.has(field.type) || !editable;

    switch (field.type) {
        case FieldType.ID:
        case FieldType.AUTO_NUMBER:
        case FieldType.CREATED_TIME:
        case FieldType.UPDATED_TIME:
            return <DetailReadonly value={value} field={field} />;
        case FieldType.TEXT:
            return <DetailText value={value} onChange={onChange} editable={!isReadonly} />;
        case FieldType.NUMBER:
            return <DetailNumber value={value} field={field} onChange={onChange} editable={!isReadonly} />;
        case FieldType.SELECT:
            return <DetailSelect value={value} field={field} onChange={onChange} editable={!isReadonly} />;
        case FieldType.MULTI_SELECT:
            return <DetailMultiSelect value={value} field={field} onChange={onChange} editable={!isReadonly} />;
        case FieldType.DATE:
            return <DetailDate value={value} field={field} onChange={onChange} editable={!isReadonly} />;
        case FieldType.CHECKBOX:
            return <DetailCheckbox value={value} onChange={onChange} editable={!isReadonly} />;
        case FieldType.RATING:
            return <DetailRating value={value} onChange={onChange} editable={!isReadonly} />;
        case FieldType.PROGRESS:
            return <DetailProgress value={value} onChange={onChange} editable={!isReadonly} />;
        case FieldType.URL:
        case FieldType.EMAIL:
        case FieldType.PHONE:
            return <DetailLink value={value} type={field.type} onChange={onChange} editable={!isReadonly} />;
        case FieldType.IMAGE:
            return <DetailImage value={value} />;
        default:
            return <DetailText value={value} onChange={onChange} editable={!isReadonly} />;
    }
};

// --- 主组件 ---

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
            <SheetContent className="w-[460px] sm:w-[540px] p-0 flex flex-col">
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
                                    className="grid grid-cols-[140px_1fr] gap-3 items-start py-2.5 rounded-md -mx-2 px-2 hover:bg-muted/50 transition-colors"
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
