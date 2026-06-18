import React from "react";
import {
    Input,
    Checkbox,
    Slider,
} from "@kn/ui";
import { DateTimePicker, Rate } from "@kn/ui";
import { useTranslation } from "@kn/common";
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
import { FieldConfig, FieldType, SelectOption } from "../../types";
import { getTagStyle } from "../../utils/colors";
import { format } from "date-fns";
import { zhCN, enUS } from "date-fns/locale";

export const READONLY_TYPES = new Set([
    FieldType.ID,
    FieldType.AUTO_NUMBER,
    FieldType.CREATED_TIME,
    FieldType.UPDATED_TIME,
]);

// --- Density presets ---
// The modal and the side sheet render the exact same fields but at slightly
// different sizes. `density` carries the few diverging style tokens so the
// rest of the field-rendering code stays shared.
export type DetailDensity = 'compact' | 'comfortable';

interface DensityStyles {
    inputClass: string;
    tagPadY: string;
    ratingSize: number;
    progressTextSize: string;
    imageSize: string;
}

const DENSITY: Record<DetailDensity, DensityStyles> = {
    // RecordDetailModal
    compact: {
        inputClass: 'h-8 text-sm',
        tagPadY: 'py-0.5',
        ratingSize: 20,
        progressTextSize: 'text-xs',
        imageSize: 'h-16 w-16',
    },
    // RecordDetailSheet
    comfortable: {
        inputClass: 'h-9',
        tagPadY: 'py-1',
        ratingSize: 22,
        progressTextSize: 'text-sm',
        imageSize: 'h-20 w-20',
    },
};

const DensityContext = React.createContext<DensityStyles>(DENSITY.comfortable);
const useDensity = () => React.useContext(DensityContext);

export const getFieldIcon = (type: FieldType) => {
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
        case FieldType.CREATED_TIME:
        case FieldType.UPDATED_TIME: return <Clock className={cls} />;
        case FieldType.ID:
        case FieldType.AUTO_NUMBER: return <Hash className={cls} />;
        default: return <Type className={cls} />;
    }
};

// --- Field value components ---

const DetailText: React.FC<{ value: any; onChange: (v: string) => void; editable: boolean }> = ({ value, onChange, editable }) => {
    const { inputClass } = useDensity();
    if (!editable) return <span className="text-sm">{value || '-'}</span>;
    return (
        <Input
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
        />
    );
};

const DetailNumber: React.FC<{ value: any; field: FieldConfig; onChange: (v: number) => void; editable: boolean }> = ({ value, field, onChange, editable }) => {
    const { inputClass } = useDensity();
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
            className={inputClass}
        />
    );
};

const DetailSelect: React.FC<{ value: any; field: FieldConfig; onChange: (v: string) => void; editable: boolean }> = ({ value, field, onChange, editable }) => {
    const { tagPadY } = useDensity();
    const options = field.options || [];
    const selected = options.find((o: SelectOption) => o.id === value);

    if (!editable) {
        if (!selected) return <span className="text-sm text-muted-foreground">-</span>;
        const style = getTagStyle(selected.color);
        return (
            <span className={`inline-flex items-center px-2.5 ${tagPadY} rounded-md text-xs font-medium`} style={{ backgroundColor: style.bg, color: style.text }}>
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
                        className={`inline-flex items-center px-2.5 ${tagPadY} rounded-md text-xs font-medium transition-all ${isActive ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : 'opacity-60 hover:opacity-100'}`}
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
    const { tagPadY } = useDensity();
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
                        <span key={id} className={`inline-flex items-center px-2.5 ${tagPadY} rounded-md text-xs font-medium`} style={{ backgroundColor: style.bg, color: style.text }}>
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
                        className={`inline-flex items-center px-2.5 ${tagPadY} rounded-md text-xs font-medium transition-all ${isActive ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : 'opacity-40 hover:opacity-80'}`}
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
            showWeekNumber={undefined}
        />
    );
};

const DetailCheckbox: React.FC<{ value: any; onChange: (v: boolean) => void; editable: boolean }> = ({ value, onChange, editable }) => {
    return <Checkbox checked={Boolean(value)} onCheckedChange={editable ? onChange : undefined} disabled={!editable} />;
};

const DetailRating: React.FC<{ value: any; onChange: (v: number) => void; editable: boolean }> = ({ value, onChange, editable }) => {
    const { ratingSize } = useDensity();
    return (
        <Rate
            rating={typeof value === 'number' ? value : 0}
            totalStars={5}
            variant="yellow"
            size={ratingSize}
            onRatingChange={editable ? onChange : undefined}
            disabled={!editable}
        />
    );
};

const DetailProgress: React.FC<{ value: any; onChange: (v: number) => void; editable: boolean }> = ({ value, onChange, editable }) => {
    const { progressTextSize } = useDensity();
    const progress = typeof value === 'number' ? value : 0;
    if (!editable) {
        return (
            <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className={`${progressTextSize} tabular-nums text-muted-foreground w-10 text-right`}>{progress}%</span>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-3">
            <Slider value={[progress]} onValueChange={(v) => onChange(v[0])} min={0} max={100} step={1} className="flex-1" />
            <span className={`${progressTextSize} font-medium tabular-nums w-10 text-right`}>{progress}%</span>
        </div>
    );
};

const DetailLink: React.FC<{ value: any; type: FieldType; onChange: (v: string) => void; editable: boolean }> = ({ value, type, onChange, editable }) => {
    const { inputClass } = useDensity();
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
            className={inputClass}
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
    const { imageSize } = useDensity();
    const images: string[] = Array.isArray(value) ? value : (value ? [value] : []);
    if (images.length === 0) return <span className="text-sm text-muted-foreground">-</span>;
    return (
        <div className="flex flex-wrap gap-2">
            {images.map((src, i) => (
                <img key={i} src={src} alt="" className={`${imageSize} object-cover rounded-md border border-border`} />
            ))}
        </div>
    );
};

// --- Field value dispatch ---

export const DetailFieldValue: React.FC<{
    field: FieldConfig;
    value: any;
    editable: boolean;
    onChange: (v: any) => void;
    density?: DetailDensity;
}> = ({ field, value, editable, onChange, density = 'comfortable' }) => {
    const isReadonly = READONLY_TYPES.has(field.type) || !editable;

    let content: React.ReactNode;
    switch (field.type) {
        case FieldType.ID:
        case FieldType.AUTO_NUMBER:
        case FieldType.CREATED_TIME:
        case FieldType.UPDATED_TIME:
            content = <DetailReadonly value={value} field={field} />;
            break;
        case FieldType.TEXT:
            content = <DetailText value={value} onChange={onChange} editable={!isReadonly} />;
            break;
        case FieldType.NUMBER:
            content = <DetailNumber value={value} field={field} onChange={onChange} editable={!isReadonly} />;
            break;
        case FieldType.SELECT:
            content = <DetailSelect value={value} field={field} onChange={onChange} editable={!isReadonly} />;
            break;
        case FieldType.MULTI_SELECT:
            content = <DetailMultiSelect value={value} field={field} onChange={onChange} editable={!isReadonly} />;
            break;
        case FieldType.DATE:
            content = <DetailDate value={value} field={field} onChange={onChange} editable={!isReadonly} />;
            break;
        case FieldType.CHECKBOX:
            content = <DetailCheckbox value={value} onChange={onChange} editable={!isReadonly} />;
            break;
        case FieldType.RATING:
            content = <DetailRating value={value} onChange={onChange} editable={!isReadonly} />;
            break;
        case FieldType.PROGRESS:
            content = <DetailProgress value={value} onChange={onChange} editable={!isReadonly} />;
            break;
        case FieldType.URL:
        case FieldType.EMAIL:
        case FieldType.PHONE:
            content = <DetailLink value={value} type={field.type} onChange={onChange} editable={!isReadonly} />;
            break;
        case FieldType.IMAGE:
            content = <DetailImage value={value} />;
            break;
        default:
            content = <DetailText value={value} onChange={onChange} editable={!isReadonly} />;
    }

    return <DensityContext.Provider value={DENSITY[density]}>{content}</DensityContext.Provider>;
};
