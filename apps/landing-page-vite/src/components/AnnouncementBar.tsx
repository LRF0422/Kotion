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

const LOCATION = "announcement";

export interface AnnouncementBarProps {
    promotion: PromotionItem;
}

/**
 * 顶部公告条：渲染在 header 之上，占满整宽。
 * - 展示 title + body（或仅 body），带可选 CTA；
 * - 关闭状态与展示次数持久化在 localStorage（`kn.ops.promo.<id>`），
 *   次数受 `frequency` 限制（0 = 不限）；
 * - 首次展示上报 campaign_impression，关闭上报 campaign_dismiss。
 */
export const AnnouncementBar: React.FC<AnnouncementBarProps> = ({ promotion }) => {
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
    const text = promotion.body || promotion.title || "";
    const heading = promotion.title && promotion.body ? promotion.title : undefined;
    const showCta = Boolean(promotion.ctaHref && promotion.ctaLabel);

    return (
        <div
            role="region"
            aria-label={promotion.title || promotion.body || "announcement"}
            className="w-full border-b"
            style={{ background: theme.background, color: theme.color, borderColor: theme.borderColor }}
        >
            <div className="container-padding flex items-center justify-center gap-3 py-2 text-sm">
                <p className="min-w-0 text-center leading-snug">
                    {heading && <span className="font-semibold mr-1.5">{heading}</span>}
                    {text}
                </p>
                {showCta && (
                    <a
                        href={promotion.ctaHref}
                        className="shrink-0 whitespace-nowrap rounded-md border bg-white/15 px-3 py-1 text-xs font-semibold hover:opacity-80"
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
