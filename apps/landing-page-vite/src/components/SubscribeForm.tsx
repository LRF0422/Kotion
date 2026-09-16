import React, { useState } from "react";
import { Button, toast } from "@kn/ui";
import { useTranslation } from "@kn/common";
import { readUtm, track } from "../ops/analytics";

interface SubscribeFormProps {
    /** 埋点位置 */
    location?: string;
    className?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** 订阅更新表单：提交到 /api/ops/subscribe。 */
export const SubscribeForm: React.FC<SubscribeFormProps> = ({ location = "footer", className }) => {
    const { t } = useTranslation();
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const value = email.trim();
        if (!EMAIL_RE.test(value)) {
            toast.error(t("subscribe.invalid"));
            return;
        }
        setLoading(true);
        try {
            const raw = readUtm();
            const res = await fetch("/api/knowledge-system/ops/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: value,
                    sourcePath: window.location.pathname,
                    referrer: document.referrer || undefined,
                    utm: {
                        source: raw.utm_source,
                        medium: raw.utm_medium,
                        campaign: raw.utm_campaign,
                        content: raw.utm_content,
                        term: raw.utm_term,
                    },
                }),
            });
            const json = (await res.json().catch(() => null)) as { code?: number; msg?: string } | null;
            if (!res.ok || (json && json.code !== 200)) {
                throw new Error(json?.msg || "failed");
            }
            track("subscribe", { location });
            setDone(true);
            setEmail("");
            toast.success(t("subscribe.success"));
        } catch {
            toast.error(t("subscribe.failed"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={submit} className={className}>
            <div className="text-sm font-medium mb-1" style={{ color: "var(--kn-ink)" }}>{t("subscribe.title")}</div>
            <p className="text-xs mb-3" style={{ color: "var(--kn-ink-soft)" }}>{t("subscribe.desc")}</p>
            <div className="flex gap-2">
                <input
                    type="email"
                    required
                    value={email}
                    disabled={loading || done}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("subscribe.placeholder")}
                    aria-label={t("subscribe.title")}
                    className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                    style={{ background: "var(--kn-paper)", borderColor: "var(--kn-line)", color: "var(--kn-ink)" }}
                />
                <Button type="submit" size="sm" disabled={loading || done} className="rounded-lg shrink-0">
                    {t("subscribe.cta")}
                </Button>
            </div>
        </form>
    );
};
