import React from "react";
import { useTranslation } from "@kn/common";
import { FieldType } from "../../../types";
import { getFieldTypeIcon } from "../../fields/fieldIcons";

interface FieldTypeSelectorProps {
    value?: FieldType;
    onChange: (type: FieldType) => void;
    disabledTypes?: FieldType[];
}

/**
 * Visual type picker grid — replaces the dropdown list.
 * Shows field types as icon cards in a grid layout.
 */
export const FieldTypeSelector: React.FC<FieldTypeSelectorProps> = ({
    value,
    onChange,
    disabledTypes = [],
}) => {
    const { t } = useTranslation();

    const tf = (key: string, fallback: string) => {
        const v = t(key);
        return v === key ? fallback : v;
    };

    const allTypes: { value: FieldType; label: string }[] = [
        { value: FieldType.TEXT, label: t("bitable.fieldTypes.text") },
        { value: FieldType.LONG_TEXT, label: tf("bitable.fieldTypes.longText", "Long Text") },
        { value: FieldType.NUMBER, label: t("bitable.fieldTypes.number") },
        { value: FieldType.SELECT, label: t("bitable.fieldTypes.select") },
        { value: FieldType.MULTI_SELECT, label: t("bitable.fieldTypes.multiSelect") },
        { value: FieldType.DATE, label: t("bitable.fieldTypes.date") },
        { value: FieldType.CHECKBOX, label: t("bitable.fieldTypes.checkbox") },
        { value: FieldType.RATING, label: t("bitable.fieldTypes.rating") },
        { value: FieldType.PROGRESS, label: t("bitable.fieldTypes.progress") },
        { value: FieldType.IMAGE, label: t("bitable.fieldTypes.image") },
        { value: FieldType.URL, label: t("bitable.fieldTypes.url") },
        { value: FieldType.EMAIL, label: t("bitable.fieldTypes.email") },
        { value: FieldType.PHONE, label: t("bitable.fieldTypes.phone") },
        { value: FieldType.PERSON, label: tf("bitable.fieldTypes.person", "Person") },
        { value: FieldType.ATTACHMENT, label: tf("bitable.fieldTypes.attachment", "Attachment") },
        { value: FieldType.CREATED_TIME, label: t("bitable.fieldTypes.createdTime") },
        { value: FieldType.UPDATED_TIME, label: t("bitable.fieldTypes.updatedTime") },
        { value: FieldType.CREATED_BY, label: tf("bitable.fieldTypes.createdBy", "Created by") },
        { value: FieldType.UPDATED_BY, label: tf("bitable.fieldTypes.updatedBy", "Updated by") },
        { value: FieldType.AUTO_NUMBER, label: t("bitable.fieldTypes.autoNumber") },
    ];

    return (
        <div className="bitable-field-config__type-grid">
            {allTypes.map(({ value: type, label }) => {
                const isDisabled = disabledTypes.includes(type);
                return (
                    <button
                        key={type}
                        className={`bitable-field-config__type-card${
                            value === type ? " bitable-field-config__type-card--selected" : ""
                        }`}
                        onClick={() => !isDisabled && onChange(type)}
                        disabled={isDisabled}
                        title={label}
                    >
                        {getFieldTypeIcon(type, "h-5 w-5")}
                        <span className="bitable-field-config__type-card-label">{label}</span>
                    </button>
                );
            })}
        </div>
    );
};
