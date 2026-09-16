import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useTranslation } from "@kn/common";
import { Check, CircleAlert } from "@kn/icon";

export interface SubscribeResultProps {
    /** confirm = 订阅二次确认；unsubscribe = 退订 */
    mode: "confirm" | "unsubscribe";
}

type ResultStatus = "loading" | "success" | "failed";

/** 双确认 / 退订结果页：两端点都返回纯文本，仅以 HTTP 状态判定成败。 */
export const SubscribeResult: React.FC<SubscribeResultProps> = ({ mode }) => {
    const { t } = useTranslation();
    const { search } = useLocation();
    const token = useMemo(() => new URLSearchParams(search).get("token"), [search]);
    const [status, setStatus] = useState<ResultStatus>("loading");

    useEffect(() => {
        if (!token) {
            setStatus("failed");
            return;
        }

        const endpoint =
            mode === "confirm"
                ? "/api/knowledge-system/ops/confirm"
                : "/api/knowledge-system/ops/unsubscribe";
        const controller = new AbortController();
        let cancelled = false;
        setStatus("loading");

        fetch(`${endpoint}?token=${encodeURIComponent(token)}`, { signal: controller.signal })
            .then((res) => {
                if (!cancelled) setStatus(res.ok ? "success" : "failed");
            })
            .catch(() => {
                if (!cancelled) setStatus("failed");
            });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [mode, token]);

    const description =
        status === "success"
            ? t("ops.unsubscribe-success")
            : !token
              ? t("ops.unsubscribe-invalid")
              : t("ops.unsubscribe-failed");

    return (
        <section className="section-padding">
            <div className="container-padding flex items-center justify-center min-h-[60vh]">
                <div
                    className="w-full max-w-md text-center rounded-2xl border p-10"
                    style={{ borderColor: "var(--kn-line)", background: "var(--kn-paper)" }}
                >
                    <div className="mx-auto w-14 h-14 rounded-2xl grid place-items-center" style={{ background: "var(--kn-paper-2)" }}>
                        {status === "loading" && (
                            <div
                                className="w-6 h-6 rounded-full border-2 animate-spin"
                                style={{ borderColor: "var(--kn-line)", borderTopColor: "transparent" }}
                                role="status"
                                aria-label="Loading"
                            />
                        )}
                        {status === "success" && <Check className="w-7 h-7" style={{ color: "var(--scene-editor-600)" }} />}
                        {status === "failed" && <CircleAlert className="w-7 h-7" style={{ color: "var(--scene-selfhost-600)" }} />}
                    </div>

                    <h1
                        className="mt-6 font-serif text-2xl font-semibold tracking-tight"
                        style={{ color: "var(--kn-ink)" }}
                    >
                        {t("ops.unsubscribe-title")}
                    </h1>

                    {status !== "loading" && (
                        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--kn-ink-soft)" }}>
                            {description}
                        </p>
                    )}

                    <Link
                        to="/"
                        className="mt-8 inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium btn-primary"
                    >
                        {t("ops.notfound-cta")}
                    </Link>
                </div>
            </div>
        </section>
    );
};
