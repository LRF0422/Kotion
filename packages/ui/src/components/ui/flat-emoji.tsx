import * as React from "react";

import { cn } from "@ui/lib/utils";

/**
 * 扁平化 emoji 渲染：把 unicode emoji 映射为 Twemoji(扁平风格) SVG 图片，
 * 保证跨平台外观一致；加载失败时回退为系统原生字形。
 * 存储层仍然保存 unicode 字符，因此不影响后端与其他消费方。
 */

const FLAT_EMOJI_CDN = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg";

/** 与 twemoji grabTheRightIcon 一致：不含 ZWJ 时去掉 VS16(FE0F)。 */
export function emojiToCodePoints(emoji: string): string {
    const cleaned = emoji.indexOf("\u200d") < 0 ? emoji.replace(/\ufe0f/g, "") : emoji;
    const codes: string[] = [];
    for (const ch of cleaned) {
        codes.push(ch.codePointAt(0)!.toString(16));
    }
    return codes.join("-");
}

export interface FlatEmojiProps extends React.HTMLAttributes<HTMLElement> {
    emoji: string;
    /** 像素尺寸（宽=高）。不传则由 className 控制。 */
    size?: number;
}

export const FlatEmoji: React.FC<FlatEmojiProps> = ({ emoji, size, className, ...props }) => {
    const [failed, setFailed] = React.useState(false);

    React.useEffect(() => {
        setFailed(false);
    }, [emoji]);

    if (!emoji) return null;

    if (failed) {
        return (
            <span
                className={cn("inline-block leading-none select-none", className)}
                style={size ? { fontSize: size * 0.9, lineHeight: `${size}px` } : undefined}
                {...props}
            >
                {emoji}
            </span>
        );
    }

    return (
        <img
            src={`${FLAT_EMOJI_CDN}/${emojiToCodePoints(emoji)}.svg`}
            alt={emoji}
            draggable={false}
            loading="lazy"
            className={cn("inline-block select-none pointer-events-none", className)}
            style={size ? { width: size, height: size } : undefined}
            onError={() => setFailed(true)}
            {...props}
        />
    );
};
