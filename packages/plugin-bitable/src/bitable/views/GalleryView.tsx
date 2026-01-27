import React, { useState } from "react";
import { ImageIcon } from "@kn/icon";
import { FieldConfig, RecordData, ViewConfig, FieldType } from "../../types";
import { cn } from "@kn/ui";

interface GalleryViewProps {
    view: ViewConfig;
    fields: FieldConfig[];
    data: RecordData[];
    editable: boolean;
    onRecordClick?: (record: RecordData) => void;
}

// 获取记录的封面图片URL
const getCoverImageUrl = (record: RecordData, coverField: FieldConfig | undefined): string | null => {
    if (!coverField) return null;

    const value = record[coverField.id];
    if (!value) return null;

    // 如果是图片字段类型，支持单个URL或URL数组
    if (coverField.type === FieldType.IMAGE) {
        if (Array.isArray(value)) {
            return value[0] || null;
        }
        return value;
    }

    // 如果是URL字段类型，直接返回
    if (coverField.type === FieldType.URL) {
        return value;
    }

    // 如果是文本字段类型，检查是否是图片URL
    if (coverField.type === FieldType.TEXT && typeof value === 'string') {
        if (value.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i) ||
            value.startsWith('data:image/') ||
            value.includes('imgur.com') ||
            value.includes('unsplash.com')) {
            return value;
        }
    }

    return null;
};

// 格式化字段值为显示文本
const formatFieldValue = (value: any, field: FieldConfig): string => {
    if (value === null || value === undefined) return '';

    switch (field.type) {
        case FieldType.DATE:
            if (value) {
                try {
                    return new Date(value).toLocaleDateString('zh-CN', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                } catch {
                    return String(value);
                }
            }
            return '';
        case FieldType.CHECKBOX:
            return value ? '✓' : '';
        case FieldType.SELECT:
        case FieldType.MULTI_SELECT:
            if (Array.isArray(value)) {
                return value.join(', ');
            }
            return String(value);
        case FieldType.PROGRESS:
            return `${value}%`;
        case FieldType.RATING:
            return '★'.repeat(value || 0);
        case FieldType.URL:
        case FieldType.EMAIL:
        case FieldType.PHONE:
            return String(value);
        default:
            return String(value);
    }
};

// 单个画廊卡片组件
const GalleryCard: React.FC<{
    record: RecordData;
    coverUrl: string | null;
    titleField?: FieldConfig;
    displayFields: FieldConfig[];
    fitType: string;
    onClick?: () => void;
}> = ({ record, coverUrl, titleField, displayFields, fitType, onClick }) => {
    const [imageError, setImageError] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);

    const title = titleField ? record[titleField.id] : null;

    return (
        <div
            className="group bg-white dark:bg-[#252525] rounded-lg border border-gray-200 dark:border-[#333] overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-md hover:border-gray-300 dark:hover:border-[#444]"
            onClick={onClick}
        >
            {/* 封面图片区域 */}
            <div className="relative aspect-[4/3] bg-gray-100 dark:bg-[#1a1a1a] overflow-hidden">
                {coverUrl && !imageError ? (
                    <>
                        <img
                            src={coverUrl}
                            alt=""
                            className={cn(
                                "w-full h-full transition-opacity duration-300",
                                fitType === 'cover' ? 'object-cover' : 'object-contain',
                                imageLoaded ? 'opacity-100' : 'opacity-0'
                            )}
                            onLoad={() => setImageLoaded(true)}
                            onError={() => setImageError(true)}
                        />
                        {!imageLoaded && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                            </div>
                        )}
                    </>
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <ImageIcon className="h-10 w-10 text-gray-300 dark:text-gray-600" />
                    </div>
                )}
            </div>

            {/* 卡片内容 */}
            <div className="p-3">
                {/* 标题 */}
                {title && (
                    <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate mb-2">
                        {String(title)}
                    </h3>
                )}

                {/* 其他字段 */}
                {displayFields.length > 0 && (
                    <div className="space-y-1.5">
                        {displayFields.map(field => {
                            const value = formatFieldValue(record[field.id], field);
                            if (!value) return null;

                            return (
                                <div key={field.id} className="flex items-center gap-2 text-xs">
                                    <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">
                                        {field.title}
                                    </span>
                                    <span className="text-gray-600 dark:text-gray-300 truncate">
                                        {value}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* 如果没有标题也没有字段显示 */}
                {!title && displayFields.length === 0 && (
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                        无内容
                    </div>
                )}
            </div>
        </div>
    );
};

export const GalleryView: React.FC<GalleryViewProps> = (props) => {
    const { view, fields, data, onRecordClick } = props;

    const cardSize = view.galleryConfig?.cardSize || 'medium';
    const fitType = view.galleryConfig?.fitType || 'cover';
    const coverFieldId = view.galleryConfig?.coverField;

    // 查找封面字段
    const coverField = coverFieldId
        ? fields.find(f => f.id === coverFieldId)
        : fields.find(f => f.type === FieldType.IMAGE);

    // 查找标题字段（第一个文本字段）
    const titleField = fields.find(f =>
        f.type === FieldType.TEXT &&
        f.id !== coverField?.id &&
        f.isShow !== false
    );

    // 获取要显示的字段（排除封面和标题）
    const displayFields = fields
        .filter(f =>
            f.isShow !== false &&
            f.id !== coverField?.id &&
            f.id !== titleField?.id &&
            f.type !== FieldType.ID &&
            f.type !== FieldType.AUTO_NUMBER &&
            f.type !== FieldType.IMAGE
        )
        .slice(0, 3);

    // 根据卡片大小设置网格列数
    const getGridCols = () => {
        switch (cardSize) {
            case 'small':
                return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';
            case 'large':
                return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
            default:
                return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
        }
    };

    if (data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
                <ImageIcon className="h-12 w-12 mb-3" />
                <p className="text-sm">暂无数据</p>
            </div>
        );
    }

    return (
        <div className="p-4">
            <div className={cn("grid gap-4", getGridCols())}>
                {data.map(record => {
                    const coverUrl = getCoverImageUrl(record, coverField);

                    return (
                        <GalleryCard
                            key={record.id}
                            record={record}
                            coverUrl={coverUrl}
                            titleField={titleField}
                            displayFields={displayFields}
                            fitType={fitType}
                            onClick={() => onRecordClick?.(record)}
                        />
                    );
                })}
            </div>
        </div>
    );
};
