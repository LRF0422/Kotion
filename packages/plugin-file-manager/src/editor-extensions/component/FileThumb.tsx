import React, { useState } from "react";
import { cn } from "@kn/ui";
import { useFileService } from "@kn/common";
import {
    FcOpenedFolder,
    File as FileIcon,
    FileText,
    FileSpreadsheet,
    Presentation,
    FileArchive,
    FileVideo,
    FileMusic,
    FileImage,
    FileCode,
} from "@kn/icon";
import type { FileItem } from "./FileContext";
import { getPreviewKind, getFileExtension, type MediaTypeHint } from "../../utils/fileUtils";

type ThumbIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

interface FileVisual {
    icon: ThumbIcon;
    /** 磁贴底色(半透明,深浅色模式通用) */
    tile: string;
    /** 图标颜色 */
    fg: string;
}

const VISUAL_GROUPS: Array<{ exts: string[] } & FileVisual> = [
    { exts: ['pdf'], icon: FileText, tile: 'bg-red-500/10', fg: 'text-red-600 dark:text-red-400' },
    { exts: ['doc', 'docx', 'rtf', 'odt'], icon: FileText, tile: 'bg-blue-500/10', fg: 'text-blue-600 dark:text-blue-400' },
    { exts: ['xls', 'xlsx', 'csv', 'ods'], icon: FileSpreadsheet, tile: 'bg-emerald-500/10', fg: 'text-emerald-600 dark:text-emerald-400' },
    { exts: ['ppt', 'pptx', 'odp', 'key'], icon: Presentation, tile: 'bg-orange-500/10', fg: 'text-orange-600 dark:text-orange-400' },
    { exts: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'], icon: FileArchive, tile: 'bg-amber-500/10', fg: 'text-amber-600 dark:text-amber-400' },
    { exts: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'm4v', 'ogv', 'mpg', 'mpeg', '3gp'], icon: FileVideo, tile: 'bg-purple-500/10', fg: 'text-purple-600 dark:text-purple-400' },
    { exts: ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'], icon: FileMusic, tile: 'bg-pink-500/10', fg: 'text-pink-600 dark:text-pink-400' },
    { exts: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'], icon: FileImage, tile: 'bg-teal-500/10', fg: 'text-teal-600 dark:text-teal-400' },
    { exts: ['js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'less', 'html', 'htm', 'json', 'xml', 'yaml', 'yml', 'java', 'py', 'go', 'rs', 'c', 'cpp', 'h', 'sh', 'sql', 'vue'], icon: FileCode, tile: 'bg-indigo-500/10', fg: 'text-indigo-600 dark:text-indigo-400' },
    { exts: ['txt', 'md', 'markdown', 'log', 'ini', 'conf'], icon: FileText, tile: 'bg-slate-500/10', fg: 'text-slate-600 dark:text-slate-400' },
];

const DEFAULT_VISUAL: FileVisual = {
    icon: FileIcon,
    tile: 'bg-muted',
    fg: 'text-muted-foreground',
};

const AMBIGUOUS_MEDIA_VISUAL: FileVisual = {
    icon: FileIcon,
    tile: 'bg-violet-500/10',
    fg: 'text-violet-600 dark:text-violet-400',
};

/** 按文件元数据解析视觉呈现(图标 + 磁贴配色) */
export const getFileVisual = (filename: string, mediaType?: MediaTypeHint): FileVisual => {
    if (getPreviewKind(filename, mediaType) === 'media') return AMBIGUOUS_MEDIA_VISUAL;

    const ext = getFileExtension(filename);
    for (const group of VISUAL_GROUPS) {
        if (group.exts.includes(ext)) {
            return { icon: group.icon, tile: group.tile, fg: group.fg };
        }
    }
    return DEFAULT_VISUAL;
};

export interface FileThumbProps {
    file: FileItem;
    /** 图标/缩略图尺寸(像素);fill 模式下为内部图标尺寸 */
    size?: number;
    className?: string;
    /** 充满父容器(网格卡片的预览磁贴区) */
    fill?: boolean;
}

/**
 * 文件/文件夹的视觉呈现:
 * - 文件夹 → 彩色文件夹图标
 * - 图片文件 → 真实缩略图(失败回退类型磁贴)
 * - 其余文件 → 按类型着色的圆角磁贴 + 类型图标
 */
export const FileThumb: React.FC<FileThumbProps> = ({ file, size = 56, className, fill = false }) => {
    const fileService = useFileService();
    const [errored, setErrored] = useState(false);

    const isImage = !file.isFolder && getPreviewKind(file.name, file.mediaType) === "image";
    const url = isImage && file.path && !errored ? fileService.getDownloadUrl(file.path) : "";

    if (file.isFolder) {
        const folder = <FcOpenedFolder style={{ width: size, height: size }} />;
        return (
            <div
                style={fill ? undefined : { width: size, height: size }}
                className={cn("flex items-center justify-center", fill && "h-full w-full", className)}
            >
                {folder}
            </div>
        );
    }

    if (url) {
        return (
            <img
                src={url}
                alt={file.name}
                loading="lazy"
                onError={() => setErrored(true)}
                style={fill ? undefined : { width: size, height: size }}
                className={cn("object-cover", fill ? "h-full w-full" : "rounded-md", className)}
            />
        );
    }

    const visual = getFileVisual(file.name, file.mediaType);
    const Icon = visual.icon;
    const iconSize = Math.max(12, Math.round(size * 0.55));

    return (
        <div
            style={fill ? undefined : { width: size, height: size }}
            className={cn(
                "flex items-center justify-center",
                fill ? "h-full w-full" : size >= 40 ? "rounded-xl" : "rounded-md",
                visual.tile,
                className,
            )}
        >
            <Icon style={{ width: iconSize, height: iconSize }} className={visual.fg} />
        </div>
    );
};
