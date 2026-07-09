import React, { useState, useMemo } from "react";
import { useTranslation } from "@kn/common";
import { Search } from "@kn/icon";
import { FieldType } from "../../../types";
import { getFieldTypeIcon } from "../../fields/fieldIcons";

interface FieldTypeSelectorProps {
    value?: FieldType;
    onChange: (type: FieldType) => void;
    disabledTypes?: FieldType[];
}

interface TypeOption {
    value: FieldType;
    label: string;
    category: "basic" | "advanced" | "system";
}

/**
 * Visual type picker with search + categorized groups.
 * Replaces the flat grid with a searchable, grouped list.
 */
export const FieldTypeSelector: React.FC<FieldTypeSelectorProps> = ({
    value,
    onChange,
    disabledTypes = [],
}) => {
    const { t } = useTranslation();
    const [query, setQuery] = useState("");

    const tf = (key: string, fallback: string) => {
        const v = t(key);
        return v === key ? fallback : v;
    };

    const allTypes: TypeOption[] = useMemo(
        () => [
            // Basic
            { value: FieldType.TEXT, label: t("bitable.fieldTypes.text"), category: "basic" },
            { value: FieldType.LONG_TEXT, label: tf("bitable.fieldTypes.longText", "Long Text"), category: "basic" },
            { value: FieldType.NUMBER, label: t("bitable.fieldTypes.number"), category: "basic" },
            { value: FieldType.SELECT, label: t("bitable.fieldTypes.select"), category: "basic" },
            { value: FieldType.MULTI_SELECT, label: t("bitable.fieldTypes.multiSelect"), category: "basic" },
            { value: FieldType.CHECKBOX, label: t("bitable.fieldTypes.checkbox"), category: "basic" },
            { value: FieldType.DATE, label: t("bitable.fieldTypes.date"), category: "basic" },
            // Advanced
            { value: FieldType.RATING, label: t("bitable.fieldTypes.rating"), category: "advanced" },
            { value: FieldType.PROGRESS, label: t("bitable.fieldTypes.progress"), category: "advanced" },
            { value: FieldType.IMAGE, label: t("bitable.fieldTypes.image"), category: "advanced" },
            { value: FieldType.URL, label: t("bitable.fieldTypes.url"), category: "advanced" },
            { value: FieldType.EMAIL, label: t("bitable.fieldTypes.email"), category: "advanced" },
            { value: FieldType.PHONE, label: t("bitable.fieldTypes.phone"), category: "advanced" },
            { value: FieldType.PERSON, label: tf("bitable.fieldTypes.person", "Person"), category: "advanced" },
            { value: FieldType.ATTACHMENT, label: tf("bitable.fieldTypes.attachment", "Attachment"), category: "advanced" },
            // System
            { value: FieldType.CREATED_TIME, label: t("bitable.fieldTypes.createdTime"), category: "system" },
            { value: FieldType.UPDATED_TIME, label: t("bitable.fieldTypes.updatedTime"), category: "system" },
            { value: FieldType.CREATED_BY, label: tf("bitable.fieldTypes.createdBy", "Created by"), category: "system" },
            { value: FieldType.UPDATED_BY, label: tf("bitable.fieldTypes.updatedBy", "Updated by"), category: "system" },
            { value: FieldType.AUTO_NUMBER, label: t("bitable.fieldTypes.autoNumber"), category: "system" },
        ],
        [t, tf]
    );

    const filteredTypes = useMemo(() => {
        if (!query.trim()) return allTypes;
        const q = query.toLowerCase();
        return allTypes.filter((opt) => opt.label.toLowerCase().includes(q));
    }, [allTypes, query]);

    const grouped = useMemo(() => {
        const groups: Record<string, TypeOption[]> = { basic: [], advanced: [], system: [] };
        filteredTypes.forEach((opt) => {
            groups[opt.category]?.push(opt);
        });
        return groups;
    }, [filteredTypes]);

    const categoryLabels: Record<string, string> = {
        basic: t("bitable.fieldTypes.categories.basic"),
        advanced: t("bitable.fieldTypes.categories.advanced"),
        system: t("bitable.fieldTypes.categories.system"),
    };

    const hasResults = filteredTypes.length > 0;

    return (
        <div className="bitable-field-config__type-selector">
            {/* Search */}
            <div className="bitable-field-config__type-search">
                <Search className="bitable-field-config__type-search-icon" />
                <input
                    type="text"
                    className="bitable-field-config__type-search-input"
                    placeholder={t("bitable.search.placeholder")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
            </div>

            {/* Grouped list */}
            <div className="bitable-field-config__type-groups">
                {hasResults ? (
                    (["basic", "advanced", "system"] as const).map((cat) => {
                        const items = grouped[cat];
                        if (!items || items.length === 0) return null;
                        return (
                            <div key={cat} className="bitable-field-config__type-group">
                                <div className="bitable-field-config__type-group-label">
                                    {categoryLabels[cat]}
                                </div>
                                <div className="bitable-field-config__type-group-items">
                                    {items.map(({ value: type, label }) => {
                                        const isDisabled = disabledTypes.includes(type);
                                        return (
                                            <button
                                                key={type}
                                                className={`bitable-field-config__type-item${
                                                    value === type
                                                        ? " bitable-field-config__type-item--selected"
                                                        : ""
                                                }`}
                                                onClick={() => !isDisabled && onChange(type)}
                                                disabled={isDisabled}
                                                title={label}
                                            >
                                                <span className="bitable-field-config__type-item-icon">
                                                    {getFieldTypeIcon(type, "h-4 w-4")}
                                                </span>
                                                <span className="bitable-field-config__type-item-label">
                                                    {label}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="bitable-field-config__type-empty">
                        {t("bitable.fieldTypes.noResults")}
                    </div>
                )}
            </div>
        </div>
    );
};

