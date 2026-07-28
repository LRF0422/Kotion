import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ImagePlus, Shuffle, Trash2 } from "@kn/icon";

import { cn } from "@ui/lib/utils";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
    EmojiPicker,
    EmojiPickerContent,
    EmojiPickerFooter,
    EmojiPickerSearch,
} from "./ui/emoji-picker";
import { FlatEmoji } from "./ui/flat-emoji";
import { DateIcon, DATE_ICON_COLORS, type DateIconConfig, type DateIconVariant } from "./ui/date-icon";
import type { IconPropsProps } from "./IconSelector";

/**
 * 页面图标选择面板（Notion / wolai 风格）：
 * - Emoji Tab：扁平化表情网格 + 搜索 + 肤色切换 + 最近使用 + 底部预览
 * - Date Tab：动态/自定义日期图标（日历卡片，支持配色、倒计时、任意文字）
 * - Upload Tab：上传自定义图片作为图标（需要调用方提供上传能力）
 * - 顶部操作：Random 随机表情 / Remove 移除图标
 */

const RECENT_STORAGE_KEY = "kn:recent-emojis";
const RECENT_MAX = 12;

const RANDOM_EMOJIS = [
    "😀", "😄", "🤩", "😎", "🥳", "🤖", "👻", "🐱", "🐶", "🦊",
    "🐼", "🦄", "🐸", "🐙", "🦋", "🌸", "🌻", "🌵", "🍀", "🌈",
    "⭐", "🔥", "⚡", "❄️", "🌊", "🍉", "🍕", "🍩", "☕", "🎂",
    "⚽", "🎮", "🎧", "🎨", "🎯", "🚀", "✈️", "🗺️", "💡", "📌",
    "📚", "✏️", "📷", "💻", "🧠", "💎", "🏆", "🎁", "❤️", "🍎",
];

function readRecents(): string[] {
    try {
        const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((it) => typeof it === "string") : [];
    } catch {
        return [];
    }
}

function pushRecent(emoji: string): string[] {
    const next = [emoji, ...readRecents().filter((it) => it !== emoji)].slice(0, RECENT_MAX);
    try {
        window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
    } catch {
        // ignore quota / privacy-mode errors
    }
    return next;
}

/** 本地时区的 YYYY-MM-DD */
function toDateInputValue(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** YYYY-MM-DD → 本地时区 Date */
function parseDateInputValue(value: string): Date {
    const [y, m, d] = value.split("-").map(Number);
    const parsed = new Date(y, (m || 1) - 1, d || 1);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/** 动态变体：始终跟随当天；倒计时需要目标日期 */
const DYNAMIC_VARIANTS: DateIconVariant[] = ["dynamic-day", "dynamic-day-en", "countdown"];
/** 自定义变体：基于选定日期 / 文字 */
const CUSTOM_VARIANTS: DateIconVariant[] = ["day-weekday", "day-year", "week", "month", "year", "text"];
/** 点击后需要先选日期的变体（倒计时 + 日期类自定义变体） */
const DATE_PICK_VARIANTS: DateIconVariant[] = ["countdown", "day-weekday", "day-year", "week", "month", "year"];

interface DateIconTabProps {
    onSelect: (icon: IconPropsProps) => void;
}

const DateIconTab: React.FC<DateIconTabProps> = ({ onSelect }) => {
    const [color, setColor] = useState<string>("red");
    const [date, setDate] = useState<string>(() => toDateInputValue(new Date()));
    const [text, setText] = useState<string>("");
    // 点卡片后弹出的确认层：日期类弹日历，文字类弹输入框
    const [pending, setPending] = useState<DateIconVariant | null>(null);
    const [draftDate, setDraftDate] = useState<Date>(() => new Date());
    const [draftText, setDraftText] = useState<string>("");

    const emitDateIcon = useCallback((variant: DateIconVariant, nextDate: string, nextText: string) => {
        const config: DateIconConfig = { variant, color };
        // 纯动态变体不存日期；倒计时/自定义变体存选定日期；文字变体存文本
        if (variant === "countdown" || CUSTOM_VARIANTS.includes(variant)) config.date = nextDate;
        if (variant === "text") config.text = nextText;
        // icon 存降级 emoji，不识别 config 的消费方（页签/反链/后端派生列表）展示 📅
        onSelect({ type: "DATE", icon: "📅", config });
    }, [color, onSelect]);

    const handleVariantClick = useCallback((variant: DateIconVariant) => {
        if (DATE_PICK_VARIANTS.includes(variant)) {
            // 日期类卡片：弹出日历选择器确认
            setDraftDate(parseDateInputValue(date));
            setPending(variant);
        } else if (variant === "text") {
            // 文字卡片：弹出输入框确认
            setDraftText(text);
            setPending(variant);
        } else {
            // 纯动态卡片：直接选中
            emitDateIcon(variant, date, text);
        }
    }, [date, text, emitDateIcon]);

    const handleConfirm = useCallback(() => {
        if (!pending) return;
        if (pending === "text") {
            const value = draftText.trim().slice(0, 6);
            if (!value) return;
            setText(value);
            emitDateIcon(pending, date, value);
        } else {
            const value = toDateInputValue(draftDate);
            setDate(value);
            emitDateIcon(pending, value, text);
        }
        setPending(null);
    }, [pending, draftDate, draftText, date, text, emitDateIcon]);

    return (
        <div className="relative">
            <ScrollArea className="h-[380px]">
            <div className="flex flex-col gap-3 p-3">
                {/* 配色 */}
                <div className="flex items-center justify-between">
                    {Object.entries(DATE_ICON_COLORS).map(([key, value]) => (
                        <button
                            key={key}
                            type="button"
                            className={cn(
                                "flex size-7 items-center justify-center rounded-md transition-all",
                                color === key && "ring-2 ring-offset-2 ring-offset-popover ring-primary/60"
                            )}
                            style={{ backgroundColor: value }}
                            onClick={() => setColor(key)}
                            title={key}
                        >
                            {color === key && <Check className="h-3.5 w-3.5 text-white" />}
                        </button>
                    ))}
                </div>

                {/* 动态图标：每天自动更新 */}
                <div>
                    <div className="text-muted-foreground pb-1.5 text-xs font-medium">动态图标</div>
                    <div className="flex flex-wrap gap-2.5">
                        {DYNAMIC_VARIANTS.map((variant) => (
                            <button
                                key={variant}
                                type="button"
                                className="rounded-lg transition-transform hover:scale-105 active:scale-95"
                                onClick={() => handleVariantClick(variant)}
                            >
                                <DateIcon config={{ variant, color, date }} size={64} />
                            </button>
                        ))}
                    </div>
                </div>

                {/* 自定义图标：基于选定日期 / 文字 */}
                <div>
                    <div className="text-muted-foreground pb-1.5 text-xs font-medium">自定义图标</div>
                    <div className="flex flex-wrap gap-2.5">
                        {CUSTOM_VARIANTS.map((variant) => (
                            <button
                                key={variant}
                                type="button"
                                className="rounded-lg transition-transform hover:scale-105 active:scale-95"
                                onClick={() => handleVariantClick(variant)}
                            >
                                <DateIcon config={{ variant, color, date, text: text || "文字" }} size={64} />
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            </ScrollArea>

            {/* 点卡片后的确认弹层：日期类 → 日历；文字类 → 输入框（覆盖在面板上，避免嵌套 Popover 被外层关闭） */}
            {pending && (
                <>
                    <div
                        className="absolute inset-0 z-10 bg-black/10"
                        onClick={() => setPending(null)}
                    />
                    <div className="absolute left-1/2 top-1/2 z-20 w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-popover shadow-2xl">
                        {pending === "text" ? (
                            <div className="flex flex-col gap-3 p-3">
                                <Input
                                    autoFocus
                                    value={draftText}
                                    onChange={(e) => setDraftText(e.target.value.slice(0, 6))}
                                    placeholder="请输入内容..."
                                    className="h-8 text-sm"
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleConfirm();
                                        if (e.key === "Escape") setPending(null);
                                    }}
                                />
                                <div className="flex justify-end gap-2">
                                    <Button variant="outline" size="sm" className="h-7 px-3 text-xs" onClick={() => setPending(null)}>
                                        取消
                                    </Button>
                                    <Button size="sm" className="h-7 px-3 text-xs" disabled={!draftText.trim()} onClick={handleConfirm}>
                                        确定
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                <Calendar
                                    mode="single"
                                    selected={draftDate}
                                    defaultMonth={draftDate}
                                    onSelect={(day) => day && setDraftDate(day)}
                                    className="p-2"
                                />
                                <div className="flex justify-end gap-2 border-t p-2">
                                    <Button variant="outline" size="sm" className="h-7 px-3 text-xs" onClick={() => setPending(null)}>
                                        取消
                                    </Button>
                                    <Button size="sm" className="h-7 px-3 text-xs" onClick={handleConfirm}>
                                        确定
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export interface PageIconPickerProps {
    onSelect: (icon: IconPropsProps) => void;
    onRemove?: () => void;
    /** 提供后启用「上传图片」Tab；返回可存储的文件名或 URL。 */
    onUploadImage?: () => Promise<string>;
    className?: string;
}

export const PageIconPicker: React.FC<PageIconPickerProps> = ({
    onSelect,
    onRemove,
    onUploadImage,
    className,
}) => {
    const [recents, setRecents] = useState<string[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    useEffect(() => {
        setRecents(readRecents());
    }, []);

    const selectEmoji = useCallback((emoji: string) => {
        setRecents(pushRecent(emoji));
        onSelect({ type: "EMOJI", icon: emoji });
    }, [onSelect]);

    const handleRandom = useCallback(() => {
        const emoji = RANDOM_EMOJIS[Math.floor(Math.random() * RANDOM_EMOJIS.length)];
        selectEmoji(emoji);
    }, [selectEmoji]);

    const handleUpload = useCallback(async () => {
        if (!onUploadImage) return;
        try {
            setUploadError(null);
            setIsUploading(true);
            const url = await onUploadImage();
            onSelect({ type: "IMAGE", icon: url });
        } catch (error) {
            console.error("Failed to upload icon image:", error);
            setUploadError("Upload failed, please try again.");
        } finally {
            setIsUploading(false);
        }
    }, [onUploadImage, onSelect]);

    const tabTriggerClass = useMemo(() => cn(
        "rounded-none border-b-2 border-transparent data-[state=active]:border-primary",
        "data-[state=active]:shadow-none data-[state=active]:bg-transparent px-3 h-10 text-sm font-medium"
    ), []);

    return (
        <Tabs defaultValue="emoji" className={cn("flex flex-col w-[352px]", className)}>
            {/* 顶栏：Tab 切换 + Random / Remove 操作 */}
            <div className="flex items-center border-b">
                <TabsList className="bg-transparent border-none h-10 p-0 px-1 gap-0">
                    <TabsTrigger value="emoji" className={tabTriggerClass}>Emoji</TabsTrigger>
                    <TabsTrigger value="date" className={tabTriggerClass}>Date</TabsTrigger>
                    {onUploadImage && (
                        <TabsTrigger value="upload" className={tabTriggerClass}>Upload</TabsTrigger>
                    )}
                </TabsList>
                <div className="ml-auto mr-2 flex shrink-0 items-center gap-0.5">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        onClick={handleRandom}
                        title="Random emoji"
                    >
                        <Shuffle className="h-3.5 w-3.5" />
                    </Button>
                    {onRemove && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={onRemove}
                            title="Remove icon"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
            </div>

            <TabsContent value="emoji" className="mt-0">
                <EmojiPicker
                    className="w-full h-[380px]"
                    onEmojiSelect={({ emoji }) => selectEmoji(emoji)}
                >
                    <EmojiPickerSearch />
                    {recents.length > 0 && (
                        <div className="border-b px-2 py-1.5">
                            <div className="text-muted-foreground px-1 pb-1 text-xs font-medium leading-none">
                                Recent
                            </div>
                            <div className="flex flex-wrap">
                                {recents.map((emoji) => (
                                    <button
                                        key={emoji}
                                        type="button"
                                        className="flex size-8 items-center justify-center rounded-sm hover:bg-accent"
                                        onClick={() => selectEmoji(emoji)}
                                    >
                                        <FlatEmoji emoji={emoji} size={22} />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <EmojiPickerContent />
                    <EmojiPickerFooter />
                </EmojiPicker>
            </TabsContent>

            <TabsContent value="date" className="mt-0">
                <DateIconTab onSelect={onSelect} />
            </TabsContent>

            {onUploadImage && (
                <TabsContent value="upload" className="mt-0">
                    <div className="flex h-[380px] flex-col items-center justify-center gap-3 p-6">
                        <div className="flex size-16 items-center justify-center rounded-xl bg-muted/60">
                            <ImagePlus className="h-7 w-7 text-muted-foreground" />
                        </div>
                        <p className="text-muted-foreground text-center text-xs leading-relaxed">
                            Use a custom image as the page icon.
                            <br />
                            Recommended size 280 × 280 px.
                        </p>
                        <Button size="sm" onClick={handleUpload} disabled={isUploading}>
                            {isUploading ? "Uploading..." : "Upload image"}
                        </Button>
                        {uploadError && (
                            <p className="text-destructive text-xs">{uploadError}</p>
                        )}
                    </div>
                </TabsContent>
            )}
        </Tabs>
    );
};
