import React, { useEffect } from "react";
import { Link, useLocation, useTranslation } from "@kn/common";
import { trackEvent } from "../../ops/analytics";

/**
 * 404：命中未知路由时渲染。仅上报一个 `not_found` 事件，
 * 用于后台观察死链与错误外链的分布。
 */
export const NotFound: React.FC = () => {
    const { t } = useTranslation();
    const { pathname } = useLocation();

    useEffect(() => {
        trackEvent("not_found", { path: pathname });
    }, [pathname]);

    return (
        <section className="section-padding">
            <div className="container-padding flex flex-col items-center justify-center text-center min-h-[60vh]">
                <div
                    className="font-serif text-8xl md:text-9xl font-semibold tracking-tight leading-none"
                    style={{ color: "var(--kn-ink)", opacity: 0.12 }}
                >
                    404
                </div>
                <h1
                    className="mt-6 font-serif text-2xl md:text-3xl font-semibold tracking-tight"
                    style={{ color: "var(--kn-ink)" }}
                >
                    {t("ops.notfound-title")}
                </h1>
                <p className="mt-3 text-base max-w-xl" style={{ color: "var(--kn-ink-soft)" }}>
                    {t("ops.notfound-desc")}
                </p>
                <Link
                    to="/"
                    className="mt-8 inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium btn-primary"
                >
                    {t("ops.notfound-cta")}
                </Link>
            </div>
        </section>
    );
};
