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
    return <div className="text-sm text-gray-900 dark:text-white truncate">{value || ''}</div>;
};

export const TextEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return (
        <Input
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="h-full border-0 bg-white dark:bg-[#252525] text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
        />
    );
};

// 数字字段
export const NumberRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    return <div className="text-sm text-gray-900 dark:text-white">{typeof value === 'number' ? value : ''}</div>;
};

export const NumberEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return (
        <Input
            type="number"
            value={value || 0}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-full border-0 bg-white dark:bg-[#252525] text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
        />
    );
};

// 单选字段
export const SelectRenderer: React.FC<FieldRendererProps> = ({ value, field }) => {
    const option = field.options?.find((opt: SelectOption) => opt.id === value);
    if (!option) return <div></div>;

    // Notion-style tag colors
    const getTagStyle = (color: string) => {
        // Map colors to Notion-like tag styles
        const colorMap: Record<string, { bg: string; text: string }> = {
            '#3b82f6': { bg: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa' },
            '#10b981': { bg: 'rgba(16, 185, 129, 0.2)', text: '#34d399' },
            '#f59e0b': { bg: 'rgba(245, 158, 11, 0.2)', text: '#fbbf24' },
            '#ef4444': { bg: 'rgba(239, 68, 68, 0.2)', text: '#f87171' },
            '#8b5cf6': { bg: 'rgba(139, 92, 246, 0.2)', text: '#a78bfa' },
            '#ec4899': { bg: 'rgba(236, 72, 153, 0.2)', text: '#f472b6' },
            '#14b8a6': { bg: 'rgba(20, 184, 166, 0.2)', text: '#2dd4bf' },
            '#f97316': { bg: 'rgba(249, 115, 22, 0.2)', text: '#fb923c' },
        };
        return colorMap[color] || { bg: `${color}20`, text: color };
    };

    const style = getTagStyle(option.color);

    return (
        <span
            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
            style={{
                backgroundColor: style.bg,
                color: style.text
            }}
        >
            {option.label}
        </span>
    );
};

export const SelectEditor: React.FC<FieldEditorProps> = ({ value, field, onChange }) => {
    return (
        <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-full px-2 border-0 bg-white dark:bg-[#252525] text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 rounded"
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
    if (!Array.isArray(value) || value.length === 0) return <div></div>;

    const getTagStyle = (color: string) => {
        const colorMap: Record<string, { bg: string; text: string }> = {
            '#3b82f6': { bg: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa' },
            '#10b981': { bg: 'rgba(16, 185, 129, 0.2)', text: '#34d399' },
            '#f59e0b': { bg: 'rgba(245, 158, 11, 0.2)', text: '#fbbf24' },
            '#ef4444': { bg: 'rgba(239, 68, 68, 0.2)', text: '#f87171' },
            '#8b5cf6': { bg: 'rgba(139, 92, 246, 0.2)', text: '#a78bfa' },
            '#ec4899': { bg: 'rgba(236, 72, 153, 0.2)', text: '#f472b6' },
            '#14b8a6': { bg: 'rgba(20, 184, 166, 0.2)', text: '#2dd4bf' },
            '#f97316': { bg: 'rgba(249, 115, 22, 0.2)', text: '#fb923c' },
        };
        return colorMap[color] || { bg: `${color}20`, text: color };
    };

    return (
        <div className="flex flex-wrap gap-1">
            {value.map((id) => {
                const option = field.options?.find((opt: SelectOption) => opt.id === id);
                if (!option) return null;
                const style = getTagStyle(option.color);
                return (
                    <span
                        key={id}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                        style={{
                            backgroundColor: style.bg,
                            color: style.text
                        }}
                    >
                        {option.label}
                    </span>
                );
            })}
        </div>
    );
};

export const MultiSelectEditor: React.FC<FieldEditorProps> = ({ value, field, onChange }) => {
    const selectedValues = Array.isArray(value) ? value : [];

    return (
        <div className="p-2 space-y-1 bg-white dark:bg-[#252525]">
            {field.options?.map((opt: SelectOption) => (
                <label key={opt.id} className="flex items-center gap-2 cursor-pointer text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-[#333] p-1 rounded">
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
export const DateRenderer: React.FC<FieldRendererProps> = ({ value, field }) => {
    if (!value) return <div></div>;
    try {
        const dateFormat = field.format || 'yyyy-MM-dd';
        // Use a more readable format like "September 12, 2024"
        const formatStr = dateFormat.includes('HH')
            ? 'MMMM d, yyyy h:mm a'
            : 'MMMM d, yyyy';
        return <div className="text-sm text-gray-600 dark:text-gray-400">{format(new Date(value), formatStr, { locale: zhCN })}</div>;
    } catch {
        return <div></div>;
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
    return <Checkbox checked={Boolean(value)} disabled className="border-gray-600" />;
};

export const CheckboxEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return <Checkbox checked={Boolean(value)} onCheckedChange={onChange} />;
};

// 进度字段
export const ProgressRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    const progress = typeof value === 'number' ? value : 0;
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                />
            </div>
            <span className="text-xs text-gray-600 dark:text-gray-400 w-10">{progress}%</span>
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
    if (!value) return <div></div>;
    return (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline flex items-center gap-1 text-sm">
            <LinkIcon className="h-3 w-3" />
            <span className="truncate max-w-[200px]">{value}</span>
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
            className="h-full border-0 bg-white dark:bg-[#252525] text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
        />
    );
};

// Email字段
export const EmailRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    if (!value) return <div></div>;
    return (
        <a href={`mailto:${value}`} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline flex items-center gap-1 text-sm">
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
            className="h-full border-0 bg-white dark:bg-[#252525] text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
        />
    );
};

// 电话字段
export const PhoneRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    if (!value) return <div></div>;
    return (
        <a href={`tel:${value}`} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline flex items-center gap-1 text-sm">
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
            className="h-full border-0 bg-white dark:bg-[#252525] text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
        />
    );
};

// ID字段（只读）
export const IDRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    return <div className="text-sm font-mono text-gray-500 dark:text-gray-500">{value}</div>;
};

export const IDEditor: React.FC<FieldEditorProps> = ({ value }) => {
    return <div className="text-sm font-mono text-gray-500 p-2">{value}</div>;
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
