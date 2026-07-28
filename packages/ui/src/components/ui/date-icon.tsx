import * as React from "react";

import { cn } from "@ui/lib/utils";

// /**
//  * wolai 风格的日期图标（日历卡片）。
//  * - 动态变体（dynamic-*/countdown）在每次渲染时基于当天日期计算，天然“动态”；
//  * - 自定义变体基于 config.date / config.text 渲染固定内容。
//  * 配置随 title attrs 持久化（{ type:'DATE', icon:'📅', config }），
//  * 后端只保留 icon 字符串，因此不识别 config 的消费方会优雅降级为 📅。
//  *
//  **/

export type DateIconVariant =
    | "dynamic-day"     // 今天：七月 / 28 / 星期二
    | "dynamic-day-en"  // 今天：JUL / 28 / Tuesday
    | "countdown"       // 距目标日期：2026-07-31 还有 / 3
    | "day-weekday"     // 固定日期：六月 / 15 / 星期一
    | "day-year"        // 固定日期：六月 / 15 / 2020
    | "week"            // 固定日期：2020 / 25周
    | "month"           // 固定日期：2020 / 六月
    | "year"            // 固定日期：(色条) / 2021
    | "text";           // 任意文字：(色条) / wolai

export interface DateIconConfig {
    variant: DateIconVariant;
    /** DATE_ICON_COLORS 的 key 或任意 CSS 颜色值 */
    color: string;
    /** YYYY-MM-DD，自定义变体与 countdown 目标日期 */
    date?: string;
    /** text 变体的内容 */
    text?: string;
}

export const DATE_ICON_COLORS: Record<string, string> = {
    red: "#dc5b57",
    blue: "#4da3e2",
    gold: "#cfa14e",
    green: "#4dbd8f",
    purple: "#d78ef7",
    pink: "#e2559b",
    mauve: "#8d5a74",
    gray: "#4b4b4b",
};

const CN_MONTHS = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
const CN_WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const EN_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const EN_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parseDate(value?: string): Date {
    if (value) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (m) {
            const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
            if (!isNaN(d.getTime())) return d;
        }
    }
    return new Date();
}

/** ISO-8601 周数 */
function isoWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

interface DateIconParts {
    /** 头部文字行（可多行）；空数组 = 纯色条 */
    header: string[];
    body: string;
    footer?: string;
    /** 头部右侧装饰圆点 */
    dots: boolean;
}

function resolveParts(config: DateIconConfig): DateIconParts {
    const today = new Date();
    const date = parseDate(config.date);
    switch (config.variant) {
        case "dynamic-day":
            return { header: [CN_MONTHS[today.getMonth()]], body: String(today.getDate()), footer: CN_WEEKDAYS[today.getDay()], dots: true };
        case "dynamic-day-en":
            return { header: [EN_MONTHS[today.getMonth()]], body: String(today.getDate()), footer: EN_WEEKDAYS[today.getDay()], dots: true };
        case "countdown": {
            const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
            const days = Math.round((startOfDay(date) - startOfDay(today)) / 86400000);
            const mmdd = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
            return {
                header: [String(date.getFullYear()), `${mmdd} ${days >= 0 ? "还有" : "已过"}`],
                body: String(Math.abs(days)),
                dots: false,
            };
        }
        case "day-weekday":
            return { header: [CN_MONTHS[date.getMonth()]], body: String(date.getDate()), footer: CN_WEEKDAYS[date.getDay()], dots: true };
        case "day-year":
            return { header: [CN_MONTHS[date.getMonth()]], body: String(date.getDate()), footer: String(date.getFullYear()), dots: true };
        case "week":
            return { header: [String(date.getFullYear())], body: `${isoWeek(date)}周`, dots: true };
        case "month":
            return { header: [String(date.getFullYear())], body: CN_MONTHS[date.getMonth()], dots: true };
        case "year":
            return { header: [], body: String(date.getFullYear()), dots: true };
        case "text":
        default:
            return { header: [], body: config.text || "文字", dots: false };
    }
}

export interface DateIconProps {
    config: DateIconConfig;
    /** 卡片边长（正方形），默认 80 */
    size?: number;
    className?: string;
}

export const DateIcon: React.FC<DateIconProps> = ({ config, size = 80, className }) => {
    const parts = resolveParts(config);
    const color = DATE_ICON_COLORS[config.color] ?? config.color ?? DATE_ICON_COLORS.red;

    const compact = size < 40; // 侧边栏等小尺寸：只保留色条 + 主体
    const hasHeaderText = !compact && parts.header.length > 0;
    const headerHeight = hasHeaderText
        ? Math.round(size * (parts.header.length > 1 ? 0.36 : 0.28))
        : Math.round(size * (compact ? 0.22 : 0.18));
    const showFooter = !compact && !!parts.footer && size >= 48;

    // 主体文字随长度自适应缩小，保证 100% / wolai 等长内容不溢出
    const bodyFontSize = Math.min(
        size * (showFooter ? 0.4 : 0.44),
        (size * 0.92) / Math.max(parts.body.length, 1) * (/[\u4e00-\u9fa5]/.test(parts.body) ? 0.9 : 1.4)
    );

    return (
        <div
            className={cn("flex flex-col overflow-hidden select-none flex-shrink-0", className)}
            style={{
                width: size,
                height: size,
                borderRadius: Math.max(2, size * 0.12),
                backgroundColor: "#efefef",
            }}
        >
            {/* 头部色块（月份 / 年份 / 倒计时目标；或纯色条） */}
            <div
                className="relative flex flex-col justify-center flex-shrink-0"
                style={{ height: headerHeight, backgroundColor: color, padding: `0 ${size * 0.1}px` }}
            >
                {hasHeaderText && parts.header.map((line, i) => (
                    <span
                        key={i}
                        className="font-semibold leading-tight truncate text-white"
                        style={{ fontSize: parts.header.length > 1 ? size * 0.115 : size * 0.16 }}
                    >
                        {line}
                    </span>
                ))}
                {!compact && parts.dots && size >= 40 && (
                    <div
                        className="absolute grid grid-cols-3"
                        style={{ top: size * 0.06, right: size * 0.07, gap: size * 0.025 }}
                    >
                        {Array.from({ length: 6 }).map((_, i) => (
                            <span
                                key={i}
                                className="rounded-full bg-white/60"
                                style={{ width: size * 0.045, height: size * 0.045 }}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* 主体（日期数字 / 周数 / 文字） */}
            <div className="flex flex-1 min-h-0 items-center justify-center overflow-hidden" style={{ padding: `0 ${size * 0.04}px` }}>
                <span
                    className="font-semibold leading-none truncate"
                    style={{ fontSize: bodyFontSize, color: "#5f6368", fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace" }}
                >
                    {parts.body}
                </span>
            </div>

            {/* 底部（星期 / 年份） */}
            {showFooter && (
                <div
                    className="flex items-center justify-center flex-shrink-0"
                    style={{ paddingBottom: size * 0.07 }}
                >
                    <span className="leading-none truncate" style={{ fontSize: size * 0.13, color: "#9aa0a6" }}>
                        {parts.footer}
                    </span>
                </div>
            )}
        </div>
    );
};
