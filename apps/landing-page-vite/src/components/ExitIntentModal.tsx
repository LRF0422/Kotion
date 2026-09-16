import React, { useCallback, useEffect, useRef, useState } from "react";
import { X } from "@kn/icon";
import { trackEvent } from "../ops/analytics";
import {
    dismissPromotion,
    promotionThemeStyle,
    recordPromotionImpression,
    shouldShowPromotion,
    type PromotionItem,
} from "../ops/config";

const LOCATION = "exit-intent";
const SESSION_SUFFIX = ".session";

const sessionKey = (id: string): string => `kn.ops.promo.${id}${SESSION_SUFFIX}`;

const wasShownThisSession = (id: string): boolean => {
    try {
        return typeof window !== "undefined" && window.sessionStorage.getItem(sessionKey(id)) === "1";
    } catch {
        return false;
    }
};

const markShownThisSession = (id: string): void => {
    try {
        window.sessionStorage.setItem(sessionKey(id), "1");
    } catch {
        /* 隐私模式 / 配额不足时忽略 */
    }
};

export interface ExitIntentModalProps {
    promotion: PromotionItem;
}

/**
 * 退出意图弹窗：鼠标从窗口顶部离开（relatedTarget 为空且 clientY <= 0）时弹出。
 * - 每个会话最多弹出一次（sessionStorage `kn.ops.promo.<id>.session`）；
 * - 同时受 `frequency` 与关闭状态限制；
 * - 真正弹出时上报 campaign_impression，关闭时上报 campaign_dismiss。
 */
export const ExitIntentModal: React.FC<ExitIntentModalProps> = ({ promotion }) => {
    const [open, setOpen] = useState(false);
    const openedRef = useRef(false);

    const show = useCallback(() => {
        if (openedRef.current) return;
        if (wasShownThisSession(promotion.id)) return;
        if (!shouldShowPromotion(promotion)) return;
        openedRef.current = true;
        markShownThisSession(promotion.id);
        recordPromotionImpression(promotion.id);
        setOpen(true);
        trackEvent("campaign_impression", {
            promotionId: promotion.id,
            type: promotion.type,
            location: LOCATION,
        });
    }, [promotion]);

    useEffect(() => {
        if (wasShownThisSession(promotion.id)) return;
        if (!shouldShowPromotion(promotion)) return;
        const onMouseOut = (event: MouseEvent) => {
            if (event.relatedTarget === null && event.clientY <= 0) show();
        };
        document.addEventListener("mouseout", onMouseOut);
        return () => document.removeEventListener("mouseout", onMouseOut);
    }, [promotion, show]);

    const close = useCallback(() => {
        setOpen(false);
        dismissPromotion(promotion.id);
        trackEvent("campaign_dismiss", {
            promotionId: promotion.id,
            type: promotion.type,
            location: LOCATION,
        });
    }, [promotion.id, promotion.type]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") close();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [open, close]);

    if (!open) return null;

    const theme = promotionThemeStyle(promotion.theme);
    const showCta = Boolean(promotion.ctaHref && promotion.ctaLabel);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <button
                type="button"
                aria-label="close"
                className="absolute inset-0 cursor-default bg-black/40"
                onClick={close}
            />
            <div
                className="relative w-full max-w-md rounded-2xl border p-6 shadow-xl"
                style={{ background: theme.background, color: theme.color, borderColor: theme.borderColor }}
            >
                <button
                    type="button"
                    onClick={close}
                    aria-label="close"
                    className="absolute right-3 top-3 rounded p-1 hover:opacity-70"
                    style={{ color: "inherit" }}
                >
                    <X className="h-4 w-4" />
                </button>

                {promotion.title && (
                    <h3 className="pr-6 text-lg font-semibold leading-snug">{promotion.title}</h3>
                )}
                {promotion.body && (
                    <p className="mt-2 text-sm leading-relaxed opacity-90">{promotion.body}</p>
                )}
                {showCta && (
                    <a
                        href={promotion.ctaHref}
                        className="mt-5 inline-flex items-center rounded-lg border bg-white/15 px-4 py-2 text-sm font-semibold hover:opacity-80"
                        style={{ borderColor: "currentColor", color: "inherit" }}
                    >
                        {promotion.ctaLabel}
                    </a>
                )}
            </div>
        </div>
    );
};
