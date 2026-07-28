import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ImagePlus, Shuffle, Trash2 } from "@kn/icon";

import { cn } from "@ui/lib/utils";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
    EmojiPicker,
    EmojiPickerContent,
    EmojiPickerFooter,
    EmojiPickerSearch,
} from "./ui/emoji-picker";
import { FlatEmoji } from "./ui/flat-emoji";
import type { IconPropsProps } from "./IconSelector";

/**
 * 页面图标选择面板（Notion 风格）：
 * - Emoji Tab：扁平化表情网格 + 搜索 + 肤色切换 + 最近使用 + 底部预览
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
                    {onUploadImage && (
                        <TabsTrigger value="upload" className={tabTriggerClass}>Upload</TabsTrigger>
                    )}
                </TabsList>
                <div className="ml-auto mr-2 flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-muted-foreground hover:text-foreground"
                        onClick={handleRandom}
                        title="Random emoji"
                    >
                        <Shuffle className="h-3.5 w-3.5" />
                        <span className="text-xs">Random</span>
                    </Button>
                    {onRemove && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2 text-muted-foreground hover:text-destructive"
                            onClick={onRemove}
                            title="Remove icon"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="text-xs">Remove</span>
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
