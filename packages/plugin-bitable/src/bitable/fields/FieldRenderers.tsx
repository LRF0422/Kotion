import React, { useState, useRef } from "react";
import { Editor } from "@kn/editor";
import { FieldType, FieldConfig, SelectOption } from "../../types";
import { Badge, Checkbox, Slider, Input, Button } from "@kn/ui";
import { Star, Link as LinkIcon, Mail, Phone, ImageIcon, X, Upload, Folder } from "@kn/icon";
import { DateTimePicker, Rate } from "@kn/ui";
import { useTranslation } from "@kn/common";
import { format } from "date-fns";
import { zhCN, enUS } from "date-fns/locale";
import { useFileService } from "@kn/core";
import { getTagStyle } from "../../utils/colors";

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
    editor?: Editor;
    onCommit?: () => void;
}

// 文本字段渲染器
export const TextRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    return <div className="text-sm text-gray-900 dark:text-white truncate">{value || ''}</div>;
};

export const TextEditor: React.FC<FieldEditorProps> = ({ value, onChange, onCommit }) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onCommit?.();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.currentTarget.blur();
        }
    };

    return (
        <input
            autoFocus
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full h-full px-2 bg-transparent text-sm text-gray-900 dark:text-white outline-none caret-blue-500 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            placeholder="..."
        />
    );
};

// 数字字段
export const NumberRenderer: React.FC<FieldRendererProps> = ({ value, field }) => {
    if (typeof value !== 'number') return <div></div>;
    let formatted: string;
    switch (field.format) {
        case 'currency':
            formatted = `¥${value.toLocaleString()}`;
            break;
        case 'percent':
            formatted = `${value}%`;
            break;
        case 'decimal':
            formatted = value.toFixed(2);
            break;
        default:
            formatted = value.toLocaleString();
    }
    return <div className="text-sm text-gray-900 dark:text-white text-right tabular-nums">{formatted}</div>;
};

export const NumberEditor: React.FC<FieldEditorProps> = ({ value, onChange, onCommit }) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onCommit?.();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.currentTarget.blur();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            onChange((Number(value) || 0) + 1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            onChange((Number(value) || 0) - 1);
        }
    };

    return (
        <Input
            autoFocus
            type="number"
            value={value || 0}
            onChange={(e) => onChange(Number(e.target.value))}
            onKeyDown={handleKeyDown}
            className="h-full border-0 bg-white dark:bg-card text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
        />
    );
};

// 单选字段
export const SelectRenderer: React.FC<FieldRendererProps> = ({ value, field }) => {
    const option = field.options?.find((opt: SelectOption) => opt.id === value);
    if (!option) return <div></div>;

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
    const [highlightedIndex, setHighlightedIndex] = React.useState(0);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const options = field.options || [];

    React.useEffect(() => {
        const currentIndex = options.findIndex((opt: SelectOption) => opt.id === value);
        if (currentIndex >= 0) {
            setHighlightedIndex(currentIndex);
        }
    }, []);

    React.useEffect(() => {
        containerRef.current?.focus();
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex((prev) => (prev + 1) % options.length);
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex((prev) => (prev - 1 + options.length) % options.length);
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0 && highlightedIndex < options.length) {
                    onChange(options[highlightedIndex].id);
                }
                break;
            case 'Escape':
                e.preventDefault();
                containerRef.current?.blur();
                break;
        }
    };

    return (
        <div
            ref={containerRef}
            className="absolute left-0 top-full z-50 w-max min-w-full bg-popover border border-border rounded-md shadow-md p-1 space-y-0.5 overflow-auto max-h-[200px]"
            onKeyDown={handleKeyDown}
            tabIndex={0}
        >
            {options.map((opt: SelectOption, index: number) => {
                const style = getTagStyle(opt.color);
                const isSelected = opt.id === value;
                return (
                    <div
                        key={opt.id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                            index === highlightedIndex ? 'bg-accent' : 'hover:bg-accent/50'
                        }`}
                        onClick={() => onChange(opt.id)}
                        onMouseEnter={() => setHighlightedIndex(index)}
                    >
                        <span
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                            style={{ backgroundColor: style.bg, color: style.text }}
                        >
                            {opt.label}
                        </span>
                        {isSelected && (
                            <svg className="ml-auto h-3.5 w-3.5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// 多选字段
export const MultiSelectRenderer: React.FC<FieldRendererProps> = ({ value, field }) => {
    if (!Array.isArray(value) || value.length === 0) return <div></div>;

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
    const [focusedIndex, setFocusedIndex] = React.useState(0);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const options = field.options || [];

    React.useEffect(() => {
        containerRef.current?.focus();
    }, []);

    const toggleOption = (optId: string) => {
        if (selectedValues.includes(optId)) {
            onChange(selectedValues.filter((id) => id !== optId));
        } else {
            onChange([...selectedValues, optId]);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setFocusedIndex((prev) => Math.min(prev + 1, options.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setFocusedIndex((prev) => Math.max(prev - 1, 0));
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (focusedIndex >= 0 && focusedIndex < options.length) {
                    toggleOption(options[focusedIndex].id);
                }
                break;
            case 'Escape':
                e.preventDefault();
                containerRef.current?.blur();
                break;
        }
    };

    return (
        <div
            ref={containerRef}
            className="absolute left-0 top-full z-50 w-max min-w-full bg-popover border border-border rounded-md shadow-md p-1 space-y-0.5 overflow-auto max-h-[200px]"
            onKeyDown={handleKeyDown}
            tabIndex={0}
        >
            {options.map((opt: SelectOption, index: number) => {
                const isChecked = selectedValues.includes(opt.id);
                const style = getTagStyle(opt.color);
                return (
                    <div
                        key={opt.id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                            index === focusedIndex ? 'bg-accent' : 'hover:bg-accent/50'
                        }`}
                        onClick={() => toggleOption(opt.id)}
                        onMouseEnter={() => setFocusedIndex(index)}
                    >
                        <Checkbox
                            checked={isChecked}
                            className="pointer-events-none"
                        />
                        <span
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                            style={{ backgroundColor: style.bg, color: style.text }}
                        >
                            {opt.label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

// Helper to get date-fns locale based on i18n language
const useDateLocale = () => {
    const { i18n } = useTranslation();
    return i18n.language?.startsWith('zh') ? zhCN : enUS;
};

// 日期字段
export const DateRenderer: React.FC<FieldRendererProps> = ({ value, field }) => {
    const locale = useDateLocale();
    if (!value) return <div></div>;
    try {
        const dateFormat = field.format || 'yyyy-MM-dd';
        const formatStr = dateFormat.includes('HH')
            ? 'MMMM d, yyyy h:mm a'
            : 'MMMM d, yyyy';
        return <div className="text-sm text-gray-600 dark:text-gray-400">{format(new Date(value), formatStr, { locale })}</div>;
    } catch {
        return <div></div>;
    }
};

export const DateEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    const locale = useDateLocale();
    return (
        <DateTimePicker
            value={value ? new Date(value) : undefined}
            onChange={(date) => onChange(date?.toISOString())}
            locale={locale}
            weekStartsOn={1}
            showWeekNumber={true}
            showOutsideDays={true}
            className="h-full"
        />
    );
};

// 复选框字段
export const CheckboxRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    return <Checkbox checked={Boolean(value)} disabled className="border-gray-400 dark:border-gray-500" />;
};

export const CheckboxEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return <Checkbox checked={Boolean(value)} onCheckedChange={onChange} />;
};

// 进度字段
export const ProgressRenderer: React.FC<FieldRendererProps> = ({ value, field }) => {
    const progress = typeof value === 'number' ? value : 0;

    if (field.format === 'ring') {
        const radius = 12;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (progress / 100) * circumference;
        return (
            <div className="flex items-center gap-1.5">
                <svg width="30" height="30" viewBox="0 0 30 30">
                    <circle cx="15" cy="15" r={radius} fill="none" stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth="3" />
                    <circle cx="15" cy="15" r={radius} fill="none" stroke="#3b82f6" strokeWidth="3"
                        strokeDasharray={circumference} strokeDashoffset={offset}
                        strokeLinecap="round" transform="rotate(-90 15 15)" />
                </svg>
                <span className="text-xs text-gray-600 dark:text-gray-400">{progress}%</span>
            </div>
        );
    }

    if (field.format === 'number') {
        return <div className="text-sm text-gray-900 dark:text-white tabular-nums">{progress}%</div>;
    }

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
    const progress = typeof value === 'number' ? value : 0;
    
    return (
        <div className="flex items-center gap-3 px-2 py-1">
            <Slider
                value={[progress]}
                onValueChange={(values) => onChange(values[0])}
                min={0}
                max={100}
                step={1}
                className="flex-1"
            />
            <span className="text-sm font-medium text-gray-900 dark:text-white w-12 text-right">
                {progress}%
            </span>
        </div>
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
            autoFocus
            type="url"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://"
            className="h-full border-0 bg-white dark:bg-card text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
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
            autoFocus
            type="email"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="h-full border-0 bg-white dark:bg-card text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
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
            autoFocus
            type="tel"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="h-full border-0 bg-white dark:bg-card text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
        />
    );
};

// ID字段（只读）
export const IDRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    return <div className="text-sm font-mono text-gray-500 dark:text-gray-400">{value}</div>;
};

export const IDEditor: React.FC<FieldEditorProps> = ({ value }) => {
    return <div className="text-sm font-mono text-gray-500 dark:text-gray-400 p-2">{value}</div>;
};

// 图片字段
export const ImageRenderer: React.FC<FieldRendererProps> = ({ value, field }) => {
    if (!value) return <div className="text-sm text-gray-400 dark:text-gray-500">-</div>;

    // 支持单个图片URL或图片数组
    const images = Array.isArray(value) ? value : [value];
    const firstImage = images[0];

    if (!firstImage) return <div className="text-sm text-gray-400 dark:text-gray-500">-</div>;

    // 解析format设置: "single:small" | "multiple:medium" etc.
    const formatParts = field.format?.split(':') || ['multiple', 'medium'];
    const sizeFormat = formatParts[1] || 'medium';

    // 根据format设置图片大小
    const getSizeClass = () => {
        switch (sizeFormat) {
            case 'small': return 'h-8 w-8';
            case 'large': return 'h-16 w-16';
            default: return 'h-10 w-10';
        }
    };

    return (
        <div className="flex items-center gap-1">
            <img
                src={firstImage}
                alt=""
                className={`${getSizeClass()} object-cover rounded`}
                onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                }}
            />
            {images.length > 1 && (
                <span className="text-xs text-gray-500 dark:text-gray-400">+{images.length - 1}</span>
            )}
        </div>
    );
};

export const ImageEditor: React.FC<FieldEditorProps> = ({ value, field, onChange, editor }) => {
    const [inputUrl, setInputUrl] = useState('');
    const [showUrlInput, setShowUrlInput] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const fileService = useFileService();

    // 解析format设置: "single:small" | "multiple:medium" etc.
    const formatParts = field.format?.split(':') || ['multiple', 'medium'];
    const countFormat = formatParts[0] || 'multiple';
    const sizeFormat = formatParts[1] || 'medium';
    const allowMultiple = countFormat === 'multiple';

    // 根据format设置缩略图大小
    const getThumbnailSize = () => {
        switch (sizeFormat) {
            case 'small': return 'h-12 w-12';
            case 'large': return 'h-24 w-24';
            default: return 'h-16 w-16';
        }
    };

    // 支持单个图片URL或图片数组
    const images: string[] = Array.isArray(value) ? value : (value ? [value] : []);

    const addImage = (url: string) => {
        if (!url.trim()) return;

        // 如果是单图模式，直接替换
        if (!allowMultiple) {
            onChange(url.trim());
            setInputUrl('');
            return;
        }

        const newImages = [...images, url.trim()];
        onChange(newImages.length === 1 ? newImages[0] : newImages);
        setInputUrl('');
    };

    const removeImage = (index: number) => {
        const newImages = images.filter((_, i) => i !== index);
        onChange(newImages.length === 1 ? newImages[0] : (newImages.length === 0 ? null : newImages));
    };

    // 从文件管理器选择图片
    const handleSelectFromFileManager = async () => {
        if (fileService.openFileSelector && editor) {
            const selectedFiles = await fileService.openFileSelector({
                multiple: allowMultiple,
                target: 'file',
                title: allowMultiple ? 'Select Images' : 'Select Image',
            }, editor);

            if (selectedFiles && selectedFiles.length > 0) {
                // 收集所有要添加的图片URL
                const newImageUrls: string[] = [];

                selectedFiles.forEach(file => {
                    let imageUrl: string | undefined;

                    if (file.url) {
                        imageUrl = file.url;
                    } else if (file.path) {
                        imageUrl = fileService.getDownloadUrl(file.path);
                    } else if (file.id) {
                        // 如果没有url和path，尝试使用id作为路径
                        imageUrl = fileService.getDownloadUrl(file.id);
                    }

                    if (imageUrl) {
                        newImageUrls.push(imageUrl);
                    }
                });

                // 批量添加图片
                if (newImageUrls.length > 0) {
                    if (!allowMultiple) {
                        // 单图模式，只取第一个
                        onChange(newImageUrls[0]);
                    } else {
                        // 多图模式，合并现有图片和新图片
                        const allImages = [...images, ...newImageUrls];
                        onChange(allImages.length === 1 ? allImages[0] : allImages);
                    }
                }
            }
        } else {
            // 回退到本地文件选择
            fileInputRef.current?.click();
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // 将文件转换为 base64 或创建本地 URL
            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target?.result as string;
                addImage(dataUrl);
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="space-y-2 bg-white dark:bg-card min-w-[200px] w-max">
            {/* 已添加的图片 */}
            {images.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                    {images.map((img, index) => (
                        <div key={index} className="relative group">
                            <img
                                src={img}
                                alt=""
                                className={`${getThumbnailSize()} object-cover rounded border`}
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect fill="%23f0f0f0" width="64" height="64"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23999" font-size="10">Error</text></svg>';
                                }}
                            />
                            <button
                                onClick={() => removeImage(index)}
                                className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* 隐藏的文件输入 */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
            />

            {/* 主操作按钮: 从文件管理器选择 */}
            <Button
                size="sm"
                variant="outline"
                onClick={handleSelectFromFileManager}
                className="w-full h-8 text-sm whitespace-nowrap"
            >
                <Folder className="h-4 w-4 mr-1.5 flex-shrink-0" />
                选择图片
            </Button>

            {/* 分隔线和链接输入切换 */}
            <div className="flex items-center gap-2">
                <div className="flex-1 border-t border-gray-200 dark:border-gray-600" />
                <button
                    onClick={() => setShowUrlInput(!showUrlInput)}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 whitespace-nowrap"
                >
                    {showUrlInput ? '收起' : '输入链接'}
                </button>
                <div className="flex-1 border-t border-gray-200 dark:border-gray-600" />
            </div>

            {/* URL输入（可折叠） */}
            {showUrlInput && (
                <div className="flex gap-2">
                    <Input
                        value={inputUrl}
                        onChange={(e) => setInputUrl(e.target.value)}
                        placeholder="输入图片链接..."
                        className="h-8 flex-1 text-sm min-w-[120px]"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                addImage(inputUrl);
                            }
                        }}
                    />
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addImage(inputUrl)}
                        disabled={!inputUrl.trim()}
                        className="h-8 px-2"
                    >
                        添加
                    </Button>
                </div>
            )}
        </div>
    );
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
        case FieldType.IMAGE:
            return ImageRenderer;
        case FieldType.ID:
        case FieldType.AUTO_NUMBER:
            return IDRenderer;
        case FieldType.CREATED_TIME:
        case FieldType.UPDATED_TIME:
            return DateRenderer;
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
        case FieldType.IMAGE:
            return ImageEditor;
        case FieldType.ID:
        case FieldType.AUTO_NUMBER:
        case FieldType.CREATED_TIME:
        case FieldType.UPDATED_TIME:
            return IDEditor; // Read-only
        default:
            return TextEditor;
    }
}
