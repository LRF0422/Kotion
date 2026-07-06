import React, { useMemo, useState } from "react";
import { cn } from "@kn/ui";
import { useTranslation } from "@kn/common";
import { Check } from "@kn/icon";
import { FieldConfig, FieldType, RecordData, ViewConfig } from "../../types";
import { DetailFieldValue, READONLY_TYPES } from "../components/RecordDetailFields";

interface FormViewProps {
    view: ViewConfig;
    fields: FieldConfig[];
    editable: boolean;
    onCreateRecord?: (values: Partial<RecordData>) => void;
}

// Types that cannot be filled in via a form (read-only / computed).
const NON_FORM_TYPES = new Set<FieldType>([
    ...READONLY_TYPES,
    FieldType.FORMULA,
    FieldType.CREATED_BY,
    FieldType.UPDATED_BY,
]);

export const FormView: React.FC<FormViewProps> = ({ view, fields, editable, onCreateRecord }) => {
    const { t } = useTranslation();
    const formConfig = view.formConfig;

    // Fields shown in the form: explicit list if configured, else all fillable fields.
    const formFields = useMemo(() => {
        const fillable = fields.filter(f => !NON_FORM_TYPES.has(f.type));
        if (formConfig?.fieldIds?.length) {
            const byId = new Map(fillable.map(f => [f.id, f]));
            return formConfig.fieldIds
                .map(id => byId.get(id))
                .filter((f): f is FieldConfig => Boolean(f));
        }
        return fillable;
    }, [fields, formConfig?.fieldIds]);

    const [draft, setDraft] = useState<Record<string, any>>({});
    const [justSubmitted, setJustSubmitted] = useState(false);

    const setValue = (fieldId: string, value: any) => {
        setJustSubmitted(false);
        setDraft(prev => ({ ...prev, [fieldId]: value }));
    };

    const handleSubmit = () => {
        if (!onCreateRecord) return;
        onCreateRecord(draft);
        setDraft({});
        setJustSubmitted(true);
    };

    return (
        <div className="bitable-form">
            <div className="bitable-form__card">
                {/* Header */}
                <div className="bitable-form__header">
                    <h2 className="bitable-form__title">
                        {formConfig?.title || view.name}
                    </h2>
                    {formConfig?.description && (
                        <p className="bitable-form__desc">
                            {formConfig.description}
                        </p>
                    )}
                </div>

                {/* Fields */}
                <div className="bitable-form__body">
                    {formFields.length === 0 && (
                        <div className="bitable-form__empty">
                            {t('bitable.form.noFields', 'No fillable fields')}
                        </div>
                    )}
                    {formFields.map(field => (
                        <div key={field.id} className="bitable-form__field">
                            <label className="bitable-form__field-label">
                                {field.title}
                            </label>
                            {field.description && (
                                <p className="bitable-form__field-desc">{field.description}</p>
                            )}
                            <DetailFieldValue
                                field={field}
                                value={draft[field.id]}
                                editable={editable}
                                onChange={(v) => setValue(field.id, v)}
                                density="comfortable"
                            />
                        </div>
                    ))}
                </div>

                {/* Footer */}
                {editable && formFields.length > 0 && (
                    <div className="bitable-form__footer">
                        <button className="bitable-form__submit" onClick={handleSubmit}>
                            {formConfig?.submitLabel || t('bitable.form.submit', 'Submit')}
                        </button>
                        {justSubmitted && (
                            <span className="bitable-form__success">
                                <Check className="bitable-form__success-icon" />
                                {t('bitable.form.submitted', 'Submitted')}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
