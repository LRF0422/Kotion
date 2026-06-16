import { NodeViewProps, NodeViewWrapper } from "@kn/editor";
import React, { useMemo } from "react";
import { useFileService } from "@kn/common";
import { cn } from "@kn/ui";
import {
    FileIcon,
    DownloadIcon,
    FileTextIcon,
    FileSpreadsheetIcon,
    FileImageIcon,
    FileArchiveIcon,
    FileVideoIcon,
    FileAudioIcon,
    FileCodeIcon,
} from "@kn/icon";

// Format a byte count into a human-readable string.
const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes <= 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

// Map a file extension to an icon component and an accent color (Tailwind text + soft bg).
interface FileVisual {
    Icon: React.ComponentType<{ className?: string }>;
    /** Tailwind classes: icon color + tinted background for the icon container. */
    tint: string;
    icon: string;
}

const FILE_VISUALS: Record<string, FileVisual> = {
    pdf: { Icon: FileTextIcon, tint: "bg-red-500/10", icon: "text-red-500" },
    doc: { Icon: FileTextIcon, tint: "bg-blue-500/10", icon: "text-blue-500" },
    docx: { Icon: FileTextIcon, tint: "bg-blue-500/10", icon: "text-blue-500" },
    txt: { Icon: FileTextIcon, tint: "bg-slate-500/10", icon: "text-slate-500" },
    md: { Icon: FileTextIcon, tint: "bg-slate-500/10", icon: "text-slate-500" },
    xls: { Icon: FileSpreadsheetIcon, tint: "bg-emerald-500/10", icon: "text-emerald-600" },
    xlsx: { Icon: FileSpreadsheetIcon, tint: "bg-emerald-500/10", icon: "text-emerald-600" },
    csv: { Icon: FileSpreadsheetIcon, tint: "bg-emerald-500/10", icon: "text-emerald-600" },
    png: { Icon: FileImageIcon, tint: "bg-purple-500/10", icon: "text-purple-500" },
    jpg: { Icon: FileImageIcon, tint: "bg-purple-500/10", icon: "text-purple-500" },
    jpeg: { Icon: FileImageIcon, tint: "bg-purple-500/10", icon: "text-purple-500" },
    gif: { Icon: FileImageIcon, tint: "bg-purple-500/10", icon: "text-purple-500" },
    svg: { Icon: FileImageIcon, tint: "bg-purple-500/10", icon: "text-purple-500" },
    webp: { Icon: FileImageIcon, tint: "bg-purple-500/10", icon: "text-purple-500" },
    zip: { Icon: FileArchiveIcon, tint: "bg-amber-500/10", icon: "text-amber-600" },
    rar: { Icon: FileArchiveIcon, tint: "bg-amber-500/10", icon: "text-amber-600" },
    "7z": { Icon: FileArchiveIcon, tint: "bg-amber-500/10", icon: "text-amber-600" },
    gz: { Icon: FileArchiveIcon, tint: "bg-amber-500/10", icon: "text-amber-600" },
    tar: { Icon: FileArchiveIcon, tint: "bg-amber-500/10", icon: "text-amber-600" },
    mp4: { Icon: FileVideoIcon, tint: "bg-rose-500/10", icon: "text-rose-500" },
    mov: { Icon: FileVideoIcon, tint: "bg-rose-500/10", icon: "text-rose-500" },
    webm: { Icon: FileVideoIcon, tint: "bg-rose-500/10", icon: "text-rose-500" },
    mp3: { Icon: FileAudioIcon, tint: "bg-pink-500/10", icon: "text-pink-500" },
    wav: { Icon: FileAudioIcon, tint: "bg-pink-500/10", icon: "text-pink-500" },
    json: { Icon: FileCodeIcon, tint: "bg-cyan-500/10", icon: "text-cyan-600" },
    js: { Icon: FileCodeIcon, tint: "bg-cyan-500/10", icon: "text-cyan-600" },
    ts: { Icon: FileCodeIcon, tint: "bg-cyan-500/10", icon: "text-cyan-600" },
    html: { Icon: FileCodeIcon, tint: "bg-cyan-500/10", icon: "text-cyan-600" },
    css: { Icon: FileCodeIcon, tint: "bg-cyan-500/10", icon: "text-cyan-600" },
};

const DEFAULT_VISUAL: FileVisual = {
    Icon: FileIcon,
    tint: "bg-muted",
    icon: "text-muted-foreground",
};

const getFileVisual = (fileName: string): FileVisual => {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    return FILE_VISUALS[ext] ?? DEFAULT_VISUAL;
};

export const AttachmentView: React.FC<NodeViewProps> = (props) => {
    const { node, editor } = props;
    const { name, path, size, fileType } = node.attrs;
    const fileService = useFileService();

    // Determine if this is an inline attachment
    const isInline = node.type.name === "attachmentInline";

    // Get the download URL
    const downloadUrl = useMemo(() => {
        if (!path) return "";
        if (path.startsWith("http://") || path.startsWith("https://")) {
            return path;
        }
        return fileService.getDownloadUrl(path);
    }, [path, fileService]);

    // Handle download
    const handleDownload = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (downloadUrl) {
            window.open(downloadUrl, "_blank");
        }
    };

    // If no name, show placeholder
    if (!name) {
        return (
            <NodeViewWrapper className="inline-block">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1 text-sm italic text-muted-foreground">
                    <FileIcon className="h-3.5 w-3.5" />
                    Empty attachment
                </span>
            </NodeViewWrapper>
        );
    }

    const { Icon, tint, icon } = getFileVisual(name);
    const ext = (fileType || name.split(".").pop() || "").toString().toUpperCase();

    // Inline attachment style (compact chip, flows with text)
    if (isInline) {
        return (
            <NodeViewWrapper
                as="span"
                className="inline-flex max-w-full align-middle"
                contentEditable={false}
            >
                <span
                    className={cn(
                        "group inline-flex max-w-[320px] items-center gap-1.5 rounded-md py-0.5 pl-1 pr-2 align-middle",
                        "border border-border bg-muted/60 text-foreground",
                        "transition-colors hover:border-primary/40 hover:bg-muted",
                        editor.isEditable ? "cursor-pointer" : "cursor-default"
                    )}
                    onClick={handleDownload}
                    title={name}
                >
                    <span className={cn("flex h-5 w-5 flex-shrink-0 items-center justify-center rounded", tint)}>
                        <Icon className={cn("h-3.5 w-3.5", icon)} />
                    </span>
                    <span className="truncate text-sm font-medium">{name}</span>
                    {size > 0 && (
                        <span className="flex-shrink-0 text-xs text-muted-foreground/70">
                            {formatFileSize(size)}
                        </span>
                    )}
                    <DownloadIcon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
            </NodeViewWrapper>
        );
    }

    // Block attachment style (full-width card)
    return (
        <NodeViewWrapper as="div" className="my-3 not-prose w-full" contentEditable={false}>
            <div
                className={cn(
                    "group flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3",
                    "transition-all duration-200 hover:border-primary/40 hover:shadow-sm",
                    editor.isEditable ? "cursor-pointer" : "cursor-default"
                )}
                onClick={handleDownload}
                role="button"
                title={`Download ${name}`}
            >
                {/* File type icon */}
                <span
                    className={cn(
                        "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg",
                        tint
                    )}
                >
                    <Icon className={cn("h-6 w-6", icon)} />
                </span>

                {/* File info */}
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground" title={name}>
                        {name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        {ext && (
                            <span className="font-medium uppercase tracking-wide">{ext}</span>
                        )}
                        {ext && size > 0 && <span className="text-border">•</span>}
                        {size > 0 && <span>{formatFileSize(size)}</span>}
                    </div>
                </div>

                {/* Download button */}
                <span
                    className={cn(
                        "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground",
                        "transition-colors group-hover:bg-primary/10 group-hover:text-primary"
                    )}
                >
                    <DownloadIcon className="h-[18px] w-[18px]" />
                </span>
            </div>
        </NodeViewWrapper>
    );
};
