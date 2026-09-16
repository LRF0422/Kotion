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

const LOCATION = "sticky-cta";

export interface StickyCtaProps {
    promotion: PromotionItem;
}

/**
 * 吸底 CTA：固定在视口底部，可关闭，频次规则与公告条一致。
 * 移动端只占一到两行，避免遮挡正文。
 */
export const StickyCta: React.FC<StickyCtaProps> = ({ promotion }) => {
    const [visible, setVisible] = useState(() => shouldShowPromotion(promotion));
    const countedRef = useRef(false);

    useEffect(() => {
        if (!visible || countedRef.current) return;
        countedRef.current = true;
        recordPromotionImpression(promotion.id);
        trackEvent("campaign_impression", {
            promotionId: promotion.id,
            type: promotion.type,
            location: LOCATION,
        });
    }, [visible, promotion.id, promotion.type]);

    const close = useCallback(() => {
        dismissPromotion(promotion.id);
        setVisible(false);
        trackEvent("campaign_dismiss", {
            promotionId: promotion.id,
            type: promotion.type,
            location: LOCATION,
        });
    }, [promotion.id, promotion.type]);

    if (!visible) return null;

    const theme = promotionThemeStyle(promotion.theme);
    const showCta = Boolean(promotion.ctaHref && promotion.ctaLabel);

    return (
        <div
            role="region"
            aria-label={promotion.title || promotion.body || "sticky cta"}
            className="fixed inset-x-0 bottom-0 z-40 border-t pb-safe-bottom"
            style={{ background: theme.background, color: theme.color, borderColor: theme.borderColor }}
        >
            <div className="container-padding flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1 text-sm leading-snug">
                    {promotion.title && <div className="truncate font-semibold">{promotion.title}</div>}
                    {promotion.body && (
                        <div className="line-clamp-2 md:line-clamp-1 opacity-90">{promotion.body}</div>
                    )}
                </div>
                {showCta && (
                    <a
                        href={promotion.ctaHref}
                        className="shrink-0 whitespace-nowrap rounded-md border bg-white/15 px-3 py-1.5 text-xs font-semibold hover:opacity-80"
                        style={{ borderColor: "currentColor", color: "inherit" }}
                    >
                        {promotion.ctaLabel}
                    </a>
                )}
                <button
                    type="button"
                    onClick={close}
                    aria-label="close"
                    className="shrink-0 rounded p-1 hover:opacity-70"
                    style={{ color: "inherit" }}
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
};
