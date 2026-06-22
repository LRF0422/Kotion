import React, { useMemo, useState } from "react";
import { Button } from "@kn/ui";
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
        <div className="h-full overflow-auto bg-gray-50 dark:bg-background py-6 px-3 md:py-10">
            <div className="mx-auto w-full max-w-xl rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card shadow-sm">
                {/* Header */}
                <div className="border-b border-gray-200 dark:border-border px-5 py-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {formConfig?.title || view.name}
                    </h2>
                    {formConfig?.description && (
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            {formConfig.description}
                        </p>
                    )}
                </div>

                {/* Fields */}
                <div className="space-y-4 px-5 py-5">
                    {formFields.length === 0 && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            {t('bitable.form.noFields', 'No fillable fields')}
                        </div>
                    )}
                    {formFields.map(field => (
                        <div key={field.id} className="space-y-1.5">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                {field.title}
                            </label>
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
                    <div className="flex items-center gap-3 border-t border-gray-200 dark:border-border px-5 py-4">
                        <Button
                            onClick={handleSubmit}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {formConfig?.submitLabel || t('bitable.form.submit', 'Submit')}
                        </Button>
                        {justSubmitted && (
                            <span className="inline-flex items-center text-sm text-green-600 dark:text-green-400">
                                <Check className="h-3.5 w-3.5 mr-1" />
                                {t('bitable.form.submitted', 'Submitted')}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
