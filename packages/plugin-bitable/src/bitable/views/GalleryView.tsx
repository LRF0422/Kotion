import React, { useState, useMemo } from "react";
import { ImageIcon, Settings } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { FieldConfig, RecordData, ViewConfig, FieldType } from "../../types";
import { cn } from "@kn/ui";
import { Checkbox, Button, Label, Popover, PopoverContent, PopoverTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui";
import { Rate } from "@kn/ui";
import { applyGroups, getGroupLabel } from "../../utils/dataProcessing";

interface GalleryViewProps {
    view: ViewConfig;
    fields: FieldConfig[];
    data: RecordData[];
    editable: boolean;
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
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
            return value ? '\u2713' : '';
        case FieldType.SELECT: {
            const opt = field.options?.find((o: any) => o.id === value);
            return opt?.label || String(value);
        }
        case FieldType.MULTI_SELECT:
            if (Array.isArray(value)) {
                return value.map((id: string) => {
                    const opt = field.options?.find((o: any) => o.id === id);
                    return opt?.label || id;
                }).join(', ');
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
            role="button"
            tabIndex={0}
            className="group bg-card rounded-lg border border-border overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600"
            onClick={onClick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
        >
            {/* 封面图片区域 */}
            <div className="relative aspect-[4/3] bg-gray-100 dark:bg-muted overflow-hidden">
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
                                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-600 border-t-transparent rounded-full animate-spin" />
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

                {/* 如果没有标题也没有字段显示 - use i18n via parent */}
                {!title && displayFields.length === 0 && (
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                        -
                    </div>
                )}
            </div>
        </div>
    );
};

export const GalleryView: React.FC<GalleryViewProps> = (props) => {
    const { view, fields, data, editable, onUpdateView, onRecordClick } = props;
    const { t } = useTranslation();

    const cardSize = view.galleryConfig?.cardSize || 'medium';
    const fitType = view.galleryConfig?.fitType || 'cover';
    const coverFieldId = view.galleryConfig?.coverField;

    const updateGalleryConfig = (updates: Partial<NonNullable<ViewConfig['galleryConfig']>>) => {
        onUpdateView(view.id, {
            galleryConfig: {
                coverField: view.galleryConfig?.coverField || '',
                fitType: view.galleryConfig?.fitType || 'cover',
                cardSize: view.galleryConfig?.cardSize || 'medium',
                ...view.galleryConfig,
                ...updates,
            },
        });
    };

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

    // 可作为显示字段的候选（排除封面、标题、系统字段）
    const candidateFields = fields.filter(f =>
        f.isShow !== false &&
        f.id !== coverField?.id &&
        f.id !== titleField?.id &&
        f.type !== FieldType.ID &&
        f.type !== FieldType.AUTO_NUMBER &&
        f.type !== FieldType.IMAGE
    );

    // 获取要显示的字段：优先 galleryConfig.displayFields，否则取前 3 个
    const displayFields = useMemo(() => {
        const ids = view.galleryConfig?.displayFields;
        if (ids && ids.length > 0) {
            const byId = new Map(candidateFields.map(f => [f.id, f]));
            return ids.map(id => byId.get(id)).filter((f): f is FieldConfig => !!f);
        }
        return candidateFields.slice(0, 3);
    }, [candidateFields, view.galleryConfig?.displayFields]);

    // 可作为封面的字段：图片/附件/URL/文本
    const coverCandidates = fields.filter(f =>
        f.type === FieldType.IMAGE || f.type === FieldType.ATTACHMENT || f.type === FieldType.URL || f.type === FieldType.TEXT
    );

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

    // 分组：当视图配置了 groups 时，画廊按分组分段展示
    const groupField = view.groups?.length ? fields.find(f => f.id === view.groups![0]!.fieldId) : undefined;
    const groupedData = useMemo(() => {
        if (!view.groups?.length) return undefined;
        return applyGroups(data, view.groups, fields);
    }, [data, view.groups, fields]);

    const renderGrid = (records: RecordData[]) => (
        <div className={cn("grid gap-4", getGridCols())}>
            {records.map(record => (
                <GalleryCard
                    key={record.id}
                    record={record}
                    coverUrl={getCoverImageUrl(record, coverField)}
                    titleField={titleField}
                    displayFields={displayFields}
                    fitType={fitType}
                    onClick={() => onRecordClick?.(record)}
                />
            ))}
        </div>
    );

    if (data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
                <ImageIcon className="h-12 w-12 mb-3" />
                <p className="text-sm">{t('bitable.galleryView.noData')}</p>
            </div>
        );
    }

    const settingsToolbar = editable && (
        <div className="flex items-center justify-end px-4 pt-3">
            <Popover>
                <PopoverTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8">
                        <Settings className="h-4 w-4 mr-1.5" />
                        {t('bitable.galleryView.settings')}
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[calc(100vw-1.5rem)] max-w-72 p-3 space-y-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs">{t('bitable.galleryView.coverField')}</Label>
                        <Select value={coverFieldId || ''} onValueChange={(v) => updateGalleryConfig({ coverField: v === 'none' ? '' : v })}>
                            <SelectTrigger className="h-8"><SelectValue placeholder={t('bitable.galleryView.auto')} /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">{t('bitable.galleryView.auto')}</SelectItem>
                                {coverCandidates.map(f => <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">{t('bitable.galleryView.fitType')}</Label>
                        <Select value={fitType} onValueChange={(v: any) => updateGalleryConfig({ fitType: v })}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="cover">{t('bitable.galleryView.fitCover')}</SelectItem>
                                <SelectItem value="contain">{t('bitable.galleryView.fitContain')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">{t('bitable.galleryView.cardSize')}</Label>
                        <Select value={cardSize} onValueChange={(v: any) => updateGalleryConfig({ cardSize: v })}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="small">{t('bitable.galleryView.sizeSmall')}</SelectItem>
                                <SelectItem value="medium">{t('bitable.galleryView.sizeMedium')}</SelectItem>
                                <SelectItem value="large">{t('bitable.galleryView.sizeLarge')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">{t('bitable.galleryView.displayFields')}</Label>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                            {candidateFields.map(f => {
                                const selectedIds = view.galleryConfig?.displayFields;
                                const checked = selectedIds ? selectedIds.includes(f.id) : candidateFields.slice(0, 3).some(c => c.id === f.id);
                                return (
                                    <label key={f.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                                        <Checkbox
                                            checked={checked}
                                            onCheckedChange={(c) => {
                                                const base = selectedIds ?? candidateFields.slice(0, 3).map(x => x.id);
                                                const next = c ? [...base, f.id] : base.filter(id => id !== f.id);
                                                updateGalleryConfig({ displayFields: next });
                                            }}
                                        />
                                        <span className="truncate">{f.title}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );

    return (
        <>
        {settingsToolbar}
        <div className="p-4 space-y-6">
            {groupedData
                ? Array.from(groupedData.entries()).map(([key, records]) => (
                    <div key={key || '__empty__'} className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                            <span>{getGroupLabel(key, groupField)}</span>
                            <span className="text-xs text-muted-foreground">({records.length})</span>
                        </div>
                        {renderGrid(records)}
                    </div>
                ))
                : renderGrid(data)}
        </div>
        </>
    );
};
