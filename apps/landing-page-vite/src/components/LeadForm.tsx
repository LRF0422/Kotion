import React, { useCallback, useRef, useState } from "react";
import { Button, toast } from "@kn/ui";
import { useTranslation } from "@kn/common";
import { readUtm, trackEvent } from "../ops/analytics";

export type LeadField = "email" | "name" | "company" | "role" | "message";

export interface LeadFormProps {
    /** 表单标识，进入埋点与请求体，便于区分不同投放位 */
    formId: string;
    /** 埋点位置，如 home / footer / campaign */
    location: string;
    /** 展示字段，默认仅邮箱 */
    fields?: LeadField[];
    /** 提交按钮文案覆盖 */
    submitLabel?: string;
    className?: string;
}

const DEFAULT_FIELDS: LeadField[] = ["email"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SUBSCRIBE_ENDPOINT = "/api/knowledge-system/ops/subscribe";

const LABEL_KEYS: Record<LeadField, string> = {
    email: "ops.lead-email",
    name: "ops.lead-name",
    company: "ops.lead-company",
    role: "ops.lead-role",
    message: "ops.lead-message",
};

const INPUT_TYPES: Record<Exclude<LeadField, "message">, string> = {
    email: "email",
    name: "text",
    company: "text",
    role: "text",
};

type LeadError = "invalid_email" | "missing_required";

const EMPTY_VALUES: Record<LeadField, string> = {
    email: "",
    name: "",
    company: "",
    role: "",
    message: "",
};

/**
 * 可配置线索表单（新投放位使用；`SubscribeForm` 保持不动）。
 * - 首次聚焦任一字段上报一次 form_start；
 * - 校验失败上报 form_error（invalid_email / missing_required）；
 * - 成功上报 form_submit + subscribe，并 toast 提示；
 * - 提交到 `/api/knowledge-system/ops/subscribe`，带来源页 / referrer / UTM / formId。
 */
export const LeadForm: React.FC<LeadFormProps> = ({
    formId,
    location,
    fields = DEFAULT_FIELDS,
    submitLabel,
    className,
}) => {
    const { t } = useTranslation();
    const fieldList = fields.length > 0 ? fields : DEFAULT_FIELDS;
    const [values, setValues] = useState<Record<LeadField, string>>(EMPTY_VALUES);
    const [error, setError] = useState<LeadError | null>(null);
    const [loading, setLoading] = useState(false);
    const startedRef = useRef(false);

    const handleFocus = useCallback(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        trackEvent("form_start", { formId, location, fields: fieldList.length });
    }, [formId, location, fieldList.length]);

    const handleChange = useCallback(
        (field: LeadField, value: string) => {
            setValues((prev) => ({ ...prev, [field]: value }));
            if (field === "email") setError(null);
        },
        [],
    );

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const email = values.email.trim();

        if (fieldList.includes("email")) {
            if (!email) {
                setError("missing_required");
                trackEvent("form_error", { formId, errorCode: "missing_required", location });
                return;
            }
            if (!EMAIL_RE.test(email)) {
                setError("invalid_email");
                trackEvent("form_error", { formId, errorCode: "invalid_email", location });
                return;
            }
        }

        setError(null);
        setLoading(true);
        try {
            const utm = readUtm();
            const res = await fetch(SUBSCRIBE_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email,
                    name: values.name.trim() || undefined,
                    company: values.company.trim() || undefined,
                    role: values.role.trim() || undefined,
                    message: values.message.trim() || undefined,
                    sourcePath: window.location.pathname,
                    referrer: document.referrer || undefined,
                    utm: {
                        source: utm.utm_source,
                        medium: utm.utm_medium,
                        campaign: utm.utm_campaign,
                        content: utm.utm_content,
                        term: utm.utm_term,
                    },
                    formId,
                }),
            });
            const json = (await res.json().catch(() => null)) as { code?: number; msg?: string } | null;
            if (!res.ok || (json && json.code !== 200)) {
                throw new Error(json?.msg || "failed");
            }
            trackEvent("form_submit", { formId, location, fields: fieldList.length });
            trackEvent("subscribe", { location });
            toast.success(t("ops.lead-success"));
            setValues({ ...EMPTY_VALUES });
        } catch {
            toast.error(t("ops.lead-failed"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={submit} className={className} noValidate>
            <div className="text-sm font-medium mb-1" style={{ color: "var(--kn-ink)" }}>
                {t("ops.lead-title")}
            </div>
            <p className="text-xs mb-3" style={{ color: "var(--kn-ink-soft)" }}>
                {t("ops.lead-desc")}
            </p>

            <div className="space-y-3">
                {fieldList.map((field) => {
                    const inputId = `${formId}-${field}`;
                    const invalid = field === "email" && error !== null;
                    const inputStyle: React.CSSProperties = {
                        background: "var(--kn-paper)",
                        borderColor: invalid ? "#dc2626" : "var(--kn-line)",
                        color: "var(--kn-ink)",
                    };
                    const inputClassName =
                        "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2";
                    const onFieldChange = (
                        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
                    ) => handleChange(field, event.target.value);

                    return (
                        <div key={field}>
                            <label
                                htmlFor={inputId}
                                className="mb-1 block text-xs font-medium"
                                style={{ color: "var(--kn-ink-soft)" }}
                            >
                                {t(LABEL_KEYS[field])}
                            </label>
                            {field === "message" ? (
                                <textarea
                                    id={inputId}
                                    rows={3}
                                    value={values[field]}
                                    disabled={loading}
                                    onChange={onFieldChange}
                                    onFocus={handleFocus}
                                    className={inputClassName}
                                    style={inputStyle}
                                />
                            ) : (
                                <input
                                    id={inputId}
                                    type={INPUT_TYPES[field]}
                                    value={values[field]}
                                    disabled={loading}
                                    required={field === "email"}
                                    aria-invalid={invalid}
                                    onChange={onFieldChange}
                                    onFocus={handleFocus}
                                    className={inputClassName}
                                    style={inputStyle}
                                />
                            )}
                            {field === "email" && error && (
                                <p className="mt-1 text-xs" style={{ color: "#dc2626" }} role="alert">
                                    {error === "invalid_email"
                                        ? t("ops.lead-invalid-email")
                                        : t("ops.lead-required")}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>

            <Button type="submit" size="sm" disabled={loading} className="mt-4 rounded-lg w-full sm:w-auto">
                {loading ? t("ops.lead-sending") : submitLabel || t("ops.lead-submit")}
            </Button>
        </form>
    );
};
