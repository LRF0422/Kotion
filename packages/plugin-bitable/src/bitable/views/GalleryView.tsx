import React from "react";
import { Card, CardContent } from "@kn/ui";
import { ImageIcon } from "@kn/icon";
import { FieldConfig, Record, ViewConfig } from "../../types";
import { getFieldRenderer } from "../fields/FieldRenderers";
import { cn } from "@kn/ui";

interface GalleryViewProps {
    view: ViewConfig;
    fields: FieldConfig[];
    data: Record[];
    editable: boolean;
}

export const GalleryView: React.FC<GalleryViewProps> = (props) => {
    const { view, fields, data } = props;

    const cardSize = view.galleryConfig?.cardSize || 'medium';
    const coverField = fields.find(f => f.id === view.galleryConfig?.coverField);

    const getCardWidth = () => {
        switch (cardSize) {
            case 'small':
                return 'w-48';
            case 'large':
                return 'w-96';
            default:
                return 'w-72';
        }
    };

    return (
        <div className="grid gap-4" style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize === 'small' ? '12rem' : cardSize === 'large' ? '24rem' : '18rem'
                }, 1fr))`
        }}>
            {data.map(record => (
                <Card key={record.id} className={cn("overflow-hidden hover:shadow-lg transition-shadow cursor-pointer", getCardWidth())}>
                    {/* 封面图片 */}
                    <div className="aspect-video bg-muted flex items-center justify-center">
                        {coverField && record[coverField.id] ? (
                            <img
                                src={record[coverField.id]}
                                alt="Cover"
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <ImageIcon className="h-12 w-12 text-muted-foreground" />
                        )}
                    </div>

                    {/* 卡片内容 */}
                    <CardContent className="p-4 space-y-2">
                        {fields
                            .filter(f => f.isShow !== false && f.id !== coverField?.id)
                            .slice(0, 3)
                            .map(field => {
                                const Renderer = getFieldRenderer(field.type);
                                return (
                                    <div key={field.id}>
                                        <div className="text-xs text-muted-foreground mb-1">{field.title}</div>
                                        <Renderer value={record[field.id]} field={field} />
                                    </div>
                                );
                            })}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
};
