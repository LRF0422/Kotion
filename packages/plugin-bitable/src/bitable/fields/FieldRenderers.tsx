import React from "react";
import { FieldType, FieldConfig, SelectOption } from "../../types";
import { Badge, Checkbox, Slider, Input } from "@kn/ui";
import { Star, Link as LinkIcon, Mail, Phone } from "@kn/icon";
import { DateTimePicker, Rate } from "@kn/ui";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

// 字段渲染器接口
interface FieldRendererProps {
    value: any;
    field: FieldConfig;
}

// 字段编辑器接口
interface FieldEditorProps {
    value: any;
    field: FieldConfig;
    onChange: (value: any) => void;
}

// 文本字段渲染器
export const TextRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    return <div className="text-sm">{value || '-'}</div>;
};

export const TextEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return (
        <Input
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="h-full border-0"
        />
    );
};

// 数字字段
export const NumberRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    return <div className="text-sm">{typeof value === 'number' ? value : '-'}</div>;
};

export const NumberEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return (
        <Input
            type="number"
            value={value || 0}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-full border-0"
        />
    );
};

// 单选字段
export const SelectRenderer: React.FC<FieldRendererProps> = ({ value, field }) => {
    const option = field.options?.find((opt: SelectOption) => opt.id === value);
    if (!option) return <div>-</div>;

    return (
        <Badge variant="outline" style={{ borderColor: option.color }}>
            {option.label}
        </Badge>
    );
};

export const SelectEditor: React.FC<FieldEditorProps> = ({ value, field, onChange }) => {
    return (
        <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-full px-2 border-0 bg-transparent"
        >
            <option value="">请选择</option>
            {field.options?.map((opt: SelectOption) => (
                <option key={opt.id} value={opt.id}>
                    {opt.label}
                </option>
            ))}
        </select>
    );
};

// 多选字段
export const MultiSelectRenderer: React.FC<FieldRendererProps> = ({ value, field }) => {
    if (!Array.isArray(value) || value.length === 0) return <div>-</div>;

    return (
        <div className="flex flex-wrap gap-1">
            {value.map((id) => {
                const option = field.options?.find((opt: SelectOption) => opt.id === id);
                if (!option) return null;
                return (
                    <Badge key={id} variant="outline" style={{ borderColor: option.color }}>
                        {option.label}
                    </Badge>
                );
            })}
        </div>
    );
};

export const MultiSelectEditor: React.FC<FieldEditorProps> = ({ value, field, onChange }) => {
    const selectedValues = Array.isArray(value) ? value : [];

    return (
        <div className="p-2 space-y-1">
            {field.options?.map((opt: SelectOption) => (
                <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                        checked={selectedValues.includes(opt.id)}
                        onCheckedChange={(checked) => {
                            if (checked) {
                                onChange([...selectedValues, opt.id]);
                            } else {
                                onChange(selectedValues.filter((id) => id !== opt.id));
                            }
                        }}
                    />
                    <span className="text-sm">{opt.label}</span>
                </label>
            ))}
        </div>
    );
};

// 日期字段
export const DateRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    if (!value) return <div>-</div>;
    try {
        return <div className="text-sm">{format(new Date(value), 'yyyy-MM-dd', { locale: zhCN })}</div>;
    } catch {
        return <div>-</div>;
    }
};

export const DateEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return (
        <DateTimePicker
            value={value ? new Date(value) : undefined}
            onChange={(date) => onChange(date?.toISOString())}
            locale={zhCN}
            weekStartsOn={1}
            showWeekNumber={true}
            showOutsideDays={true}
            className="h-full"
        />
    );
};

// 复选框字段
export const CheckboxRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    return <Checkbox checked={Boolean(value)} disabled />;
};

export const CheckboxEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return <Checkbox checked={Boolean(value)} onCheckedChange={onChange} />;
};

// 进度字段
export const ProgressRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    const progress = typeof value === 'number' ? value : 0;
    return (
        <div className="flex items-center gap-2">
            {/* <Slider value={progress} className="flex-1" /> */}
            <span className="text-sm text-muted-foreground w-12">{progress}%</span>
        </div>
    );
};

export const ProgressEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return (
        <Input
            type="range"
            min="0"
            max="100"
            value={value || 0}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-full"
        />
    );
};

// 评分字段
export const RatingRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    return (
        <Rate
            rating={typeof value === 'number' ? value : 0}
            totalStars={5}
            variant="yellow"
            size={16}
            disabled
        />
    );
};

export const RatingEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return (
        <Rate
            rating={typeof value === 'number' ? value : 0}
            totalStars={5}
            variant="yellow"
            onRatingChange={onChange}
            size={20}
        />
    );
};

// URL字段
export const URLRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    if (!value) return <div>-</div>;
    return (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
            <LinkIcon className="h-3 w-3" />
            {value}
        </a>
    );
};

export const URLEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return (
        <Input
            type="url"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://"
            className="h-full border-0"
        />
    );
};

// Email字段
export const EmailRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    if (!value) return <div>-</div>;
    return (
        <a href={`mailto:${value}`} className="text-blue-600 hover:underline flex items-center gap-1">
            <Mail className="h-3 w-3" />
            {value}
        </a>
    );
};

export const EmailEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return (
        <Input
            type="email"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="h-full border-0"
        />
    );
};

// 电话字段
export const PhoneRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    if (!value) return <div>-</div>;
    return (
        <a href={`tel:${value}`} className="text-blue-600 hover:underline flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {value}
        </a>
    );
};

export const PhoneEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return (
        <Input
            type="tel"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="h-full border-0"
        />
    );
};

// ID字段（只读）
export const IDRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    return <div className="text-sm font-mono text-muted-foreground">{value}</div>;
};

export const IDEditor: React.FC<FieldEditorProps> = ({ value }) => {
    return <div className="text-sm font-mono text-muted-foreground p-2">{value}</div>;
};

// 获取字段渲染器
export function getFieldRenderer(fieldType: FieldType): React.FC<FieldRendererProps> {
    switch (fieldType) {
        case FieldType.TEXT:
            return TextRenderer;
        case FieldType.NUMBER:
            return NumberRenderer;
        case FieldType.SELECT:
            return SelectRenderer;
        case FieldType.MULTI_SELECT:
            return MultiSelectRenderer;
        case FieldType.DATE:
            return DateRenderer;
        case FieldType.CHECKBOX:
            return CheckboxRenderer;
        case FieldType.PROGRESS:
            return ProgressRenderer;
        case FieldType.RATING:
            return RatingRenderer;
        case FieldType.URL:
            return URLRenderer;
        case FieldType.EMAIL:
            return EmailRenderer;
        case FieldType.PHONE:
            return PhoneRenderer;
        case FieldType.ID:
        case FieldType.AUTO_NUMBER:
            return IDRenderer;
        default:
            return TextRenderer;
    }
}

// 获取字段编辑器
export function getFieldEditor(fieldType: FieldType): React.FC<FieldEditorProps> {
    switch (fieldType) {
        case FieldType.TEXT:
            return TextEditor;
        case FieldType.NUMBER:
            return NumberEditor;
        case FieldType.SELECT:
            return SelectEditor;
        case FieldType.MULTI_SELECT:
            return MultiSelectEditor;
        case FieldType.DATE:
            return DateEditor;
        case FieldType.CHECKBOX:
            return CheckboxEditor;
        case FieldType.PROGRESS:
            return ProgressEditor;
        case FieldType.RATING:
            return RatingEditor;
        case FieldType.URL:
            return URLEditor;
        case FieldType.EMAIL:
            return EmailEditor;
        case FieldType.PHONE:
            return PhoneEditor;
        case FieldType.ID:
        case FieldType.AUTO_NUMBER:
            return IDEditor;
        default:
            return TextEditor;
    }
}
