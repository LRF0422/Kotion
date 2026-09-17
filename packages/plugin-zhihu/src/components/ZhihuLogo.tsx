import React from "react";

export interface ZhihuLogoProps {
    size?: number;
    className?: string;
    /** Accessible label; callers pass the translated brand name. */
    label?: string;
}

/**
 * Brand mark for the connector. Deliberately a plain glyph badge rather than
 * the official artwork, so the plugin ships no third-party logo assets.
 */
export const ZhihuLogo: React.FC<ZhihuLogoProps> = ({ size = 40, className, label = "Zhihu" }) => (
    <span
        className={className}
        aria-label={label}
        style={{
            width: size,
            height: size,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: Math.round(size * 0.25),
            background: "#0084ff",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: Math.round(size * 0.5),
            lineHeight: 1,
            userSelect: "none",
            flexShrink: 0,
        }}
    >
        知
    </span>
);

export default ZhihuLogo;
