import React, { useCallback, useState } from "react";
import { Button } from "@kn/ui";
import { useTranslation } from "@kn/common";
import { GITHUB_URL } from "../constants/links";
import { track } from "../ops/analytics";
import { detectRegion, getConsentState, requiresConsent, setConsentState } from "../ops/consent";

const PRIVACY_URL = `${GITHUB_URL}/blob/main/PRIVACY.md`;

/**
 * 同意横幅：仅在「需要显式同意的地区」且用户尚未选择时显示。
 * 其余地区按默示同意处理，不打扰用户；选择后写入状态并关闭，
 * denied 时 track 会被 SDK 自行拦截。
 */
export const ConsentBanner: React.FC = () => {
    const { t } = useTranslation();
    const [visible, setVisible] = useState(() => requiresConsent() && getConsentState() === "unknown");

    const decide = useCallback(
        (choice: "granted" | "denied") => {
            const region = detectRegion();
            setConsentState(choice);
            // 先写入状态再上报：denied 时 SDK 的同意门控会拦下这次调用
            track("consent_decided", { state: choice, region });
            setVisible(false);
        },
        [],
    );

    if (!visible) return null;

    return (
        <div
            className="fixed bottom-4 left-4 right-4 sm:right-auto z-50 max-w-sm rounded-xl border p-4 shadow-lg"
            style={{ background: "var(--kn-paper)", borderColor: "var(--kn-line)", color: "var(--kn-ink)" }}
            role="dialog"
            aria-label={t("ops.consent-title")}
        >
            <div className="text-sm font-semibold mb-1">{t("ops.consent-title")}</div>
            <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--kn-ink-soft)" }}>
                {t("ops.consent-desc")}
            </p>
            <a
                href={PRIVACY_URL}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline hover:opacity-80"
                style={{ color: "var(--kn-ink-soft)" }}
            >
                {t("ops.consent-more")}
            </a>
            <div className="mt-3 flex gap-2">
                <Button size="sm" className="rounded-lg flex-1" onClick={() => decide("granted")}>
                    {t("ops.consent-accept")}
                </Button>
                <Button size="sm" variant="outline" className="rounded-lg flex-1" onClick={() => decide("denied")}>
                    {t("ops.consent-decline")}
                </Button>
            </div>
        </div>
    );
};
