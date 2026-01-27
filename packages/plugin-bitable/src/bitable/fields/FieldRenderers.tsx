import React, { useState, useRef } from "react";
import { Editor } from "@kn/editor";
import { FieldType, FieldConfig, SelectOption } from "../../types";
import { Badge, Checkbox, Slider, Input, Button } from "@kn/ui";
import { Star, Link as LinkIcon, Mail, Phone, ImageIcon, X, Upload, Folder } from "@kn/icon";
import { DateTimePicker, Rate } from "@kn/ui";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useFileService } from "@kn/core";

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

// 图片字段
export const ImageRenderer: React.FC<FieldRendererProps> = ({ value, field }) => {
    if (!value) return <div className="text-sm text-gray-400">-</div>;

    // 支持单个图片URL或图片数组
    const images = Array.isArray(value) ? value : [value];
    const firstImage = images[0];

    if (!firstImage) return <div className="text-sm text-gray-400">-</div>;

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
                <span className="text-xs text-gray-500">+{images.length - 1}</span>
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
        <div className="space-y-2 bg-white dark:bg-[#252525] min-w-[200px] w-max">
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
            return IDEditor;
        default:
            return TextEditor;
    }
}
