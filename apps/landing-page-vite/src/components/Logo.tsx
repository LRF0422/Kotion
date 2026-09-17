import React from "react";

/**
 * Kotion brand mark — the orange→pink gradient tile with a white K.
 * Mirrors public/favicon.svg exactly (same gradient stops and geometry)
 * so the in-app logo and the favicon never drift apart.
 *
 * The wordmark next to it keeps using the adaptive ink token, so the
 * lockup reads on both paper and dark surfaces.
 */
export const LogoMark: React.FC<{ size?: number; className?: string }> = ({ size = 30, className = "" }) => {
    const rawId = React.useId();
    const gradientId = "kn-brand-" + rawId.replace(/:/g, "");
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 32 32"
            className={className}
            aria-hidden="true"
            style={{ display: "block", flexShrink: 0 }}
        >
            <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fb923c" />
                    <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
            </defs>
            <rect width="32" height="32" rx="8" fill={"url(#" + gradientId + ")"} />
            <rect x="9.1" y="8.8" width="3.8" height="14.4" rx="1.9" fill="#ffffff" />
            <path
                d="M22.4 8.8 13.7 16 22.9 23.2"
                fill="none"
                stroke="#ffffff"
                strokeWidth="3.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
};

export interface LogoProps {
    className?: string;
    markSize?: number;
    showWordmark?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ className = "", markSize = 30, showWordmark = true }) => (
    <span className={"inline-flex items-center gap-2 " + className}>
        <LogoMark size={markSize} />
        {showWordmark && (
            <span className="text-[19px] font-semibold tracking-[-0.02em]" style={{ color: "var(--kn-ink)" }}>
                Kotion
            </span>
        )}
    </span>
);
