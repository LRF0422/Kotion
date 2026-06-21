import React, { useState } from "react";
import { cn } from "@kn/ui";
import { useFileService } from "@kn/common";
import { FcFile, FcOpenedFolder } from "@kn/icon";
import type { FileItem } from "./FileContext";
import { getPreviewKind } from "../../utils/fileUtils";

export interface FileThumbProps {
    file: FileItem;
    /** 图标/缩略图尺寸(像素) */
    size?: number;
    className?: string;
}

/**
 * 文件/文件夹的视觉呈现:
 * - 文件夹 → 彩色文件夹图标
 * - 图片文件 → 真实缩略图(失败回退文件图标)
 * - 其余文件 → 文件图标
 */
export const FileThumb: React.FC<FileThumbProps> = ({ file, size = 56, className }) => {
    const fileService = useFileService();
    const [errored, setErrored] = useState(false);

    const isImage = !file.isFolder && getPreviewKind(file.name) === "image";
    const url = isImage && file.path && !errored ? fileService.getDownloadUrl(file.path) : "";

    if (file.isFolder) {
        return <FcOpenedFolder style={{ width: size, height: size }} className={className} />;
    }

    if (url) {
        return (
            <img
                src={url}
                alt={file.name}
                loading="lazy"
                onError={() => setErrored(true)}
                style={{ width: size, height: size }}
                className={cn("rounded object-cover", className)}
            />
        );
    }

    return <FcFile style={{ width: size, height: size }} className={className} />;
};
