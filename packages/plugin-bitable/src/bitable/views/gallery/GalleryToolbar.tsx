import React from "react";
import {
    Button,
    Label,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Checkbox,
} from "@kn/ui";
import { Settings } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { FieldConfig, ViewConfig, FieldType } from "../../../types";

interface GalleryToolbarProps {
    view: ViewConfig;
    fields: FieldConfig[];
    editable: boolean;
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
}

/**
 * Gallery toolbar with settings popover:
 * - Cover field picker
 * - Fit type (cover/contain)
 * - Card size (S/M/L)
 * - Display fields picker (checkbox list)
 */
export const GalleryToolbar: React.FC<GalleryToolbarProps> = ({
    view,
    fields,
    editable,
    onUpdateView,
}) => {
    const { t } = useTranslation();

    if (!editable) return null;

    const galleryConfig = view.galleryConfig;
    const cardSize = galleryConfig?.cardSize || "medium";
    const fitType = galleryConfig?.fitType || "cover";
    const coverFieldId = galleryConfig?.coverField;

    const updateGalleryConfig = (updates: Partial<NonNullable<ViewConfig["galleryConfig"]>>) => {
        onUpdateView(view.id, {
            galleryConfig: {
                coverField: galleryConfig?.coverField || "",
                fitType: galleryConfig?.fitType || "cover",
                cardSize: galleryConfig?.cardSize || "medium",
                ...galleryConfig,
                ...updates,
            },
        });
    };

    const coverCandidates = fields.filter(
        (f) =>
            f.type === FieldType.IMAGE ||
            f.type === FieldType.ATTACHMENT ||
            f.type === FieldType.URL ||
            f.type === FieldType.TEXT
    );

    const coverField = coverFieldId
        ? fields.find((f) => f.id === coverFieldId)
        : fields.find((f) => f.type === FieldType.IMAGE);

    const titleField = fields.find(
        (f) =>
            (f.type === FieldType.TEXT || f.type === FieldType.LONG_TEXT) &&
            f.id !== coverField?.id &&
            f.isShow !== false
    );

    const candidateFields = fields.filter(
        (f) =>
            f.isShow !== false &&
            f.id !== coverField?.id &&
            f.id !== titleField?.id &&
            f.type !== FieldType.ID &&
            f.type !== FieldType.AUTO_NUMBER &&
            f.type !== FieldType.IMAGE
    );

    const selectedDisplayIds = galleryConfig?.displayFields;
    const isFieldChecked = (fieldId: string): boolean => {
        if (selectedDisplayIds) return selectedDisplayIds.includes(fieldId);
        return candidateFields.slice(0, 3).some((c) => c.id === fieldId);
    };

    return (
        <div className="bitable-gallery__toolbar">
            <Popover>
                <PopoverTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-8">
                        <Settings style={{ width: 14, height: 14 }} />
                        {t("bitable.galleryView.settings")}
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-3 space-y-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs">
                            {t("bitable.galleryView.coverField")}
                        </Label>
                        <Select
                            value={coverFieldId || ""}
                            onValueChange={(v) =>
                                updateGalleryConfig({ coverField: v === "none" ? "" : v })
                            }
                        >
                            <SelectTrigger className="h-8">
                                <SelectValue placeholder={t("bitable.galleryView.auto")} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">
                                    {t("bitable.galleryView.auto")}
                                </SelectItem>
                                {coverCandidates.map((f) => (
                                    <SelectItem key={f.id} value={f.id}>
                                        {f.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs">
                            {t("bitable.galleryView.fitType")}
                        </Label>
                        <Select
                            value={fitType}
                            onValueChange={(v: string) =>
                                updateGalleryConfig({ fitType: v as "cover" | "contain" })
                            }
                        >
                            <SelectTrigger className="h-8">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="cover">
                                    {t("bitable.galleryView.fitCover")}
                                </SelectItem>
                                <SelectItem value="contain">
                                    {t("bitable.galleryView.fitContain")}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs">
                            {t("bitable.galleryView.cardSize")}
                        </Label>
                        <Select
                            value={cardSize}
                            onValueChange={(v: string) =>
                                updateGalleryConfig({ cardSize: v as "small" | "medium" | "large" })
                            }
                        >
                            <SelectTrigger className="h-8">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="small">
                                    {t("bitable.galleryView.sizeSmall")}
                                </SelectItem>
                                <SelectItem value="medium">
                                    {t("bitable.galleryView.sizeMedium")}
                                </SelectItem>
                                <SelectItem value="large">
                                    {t("bitable.galleryView.sizeLarge")}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs">
                            {t("bitable.galleryView.displayFields")}
                        </Label>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                            {candidateFields.map((f) => (
                                <label
                                    key={f.id}
                                    className="flex items-center gap-2 text-sm cursor-pointer py-0.5"
                                >
                                    <Checkbox
                                        checked={isFieldChecked(f.id)}
                                        onCheckedChange={(c) => {
                                            const base =
                                                selectedDisplayIds ??
                                                candidateFields.slice(0, 3).map((x) => x.id);
                                            const next = c
                                                ? [...base, f.id]
                                                : base.filter((id) => id !== f.id);
                                            updateGalleryConfig({ displayFields: next });
                                        }}
                                    />
                                    <span className="truncate">{f.title}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
};
