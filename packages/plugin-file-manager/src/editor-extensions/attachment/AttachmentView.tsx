import { NodeViewProps, NodeViewWrapper } from "@kn/editor";
import React, { useMemo } from "react";
import { useFileService } from "@kn/common";
import { cn } from "@kn/ui";
import {
    DownloadIcon,
    BsFileEarmark,
    BsFileEarmarkZip,
    BsFiletypePdf,
    BsFiletypeDoc,
    BsFiletypeDocx,
    BsFiletypeTxt,
    BsFiletypeMd,
    BsFiletypeXls,
    BsFiletypeXlsx,
    BsFiletypeCsv,
    BsFiletypePpt,
    BsFiletypePptx,
    BsFiletypePng,
    BsFiletypeJpg,
    BsFiletypeGif,
    BsFiletypeSvg,
    BsFiletypeMp4,
    BsFiletypeMov,
    BsFiletypeMp3,
    BsFiletypeWav,
    BsFiletypeJson,
    BsFiletypeJs,
    BsFiletypeHtml,
    BsFiletypeCss,
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
    pdf: { Icon: BsFiletypePdf, tint: "bg-red-500/10", icon: "text-red-500" },
    doc: { Icon: BsFiletypeDoc, tint: "bg-blue-500/10", icon: "text-blue-500" },
    docx: { Icon: BsFiletypeDocx, tint: "bg-blue-500/10", icon: "text-blue-500" },
    txt: { Icon: BsFiletypeTxt, tint: "bg-slate-500/10", icon: "text-slate-500" },
    md: { Icon: BsFiletypeMd, tint: "bg-slate-500/10", icon: "text-slate-500" },
    xls: { Icon: BsFiletypeXls, tint: "bg-emerald-500/10", icon: "text-emerald-600" },
    xlsx: { Icon: BsFiletypeXlsx, tint: "bg-emerald-500/10", icon: "text-emerald-600" },
    csv: { Icon: BsFiletypeCsv, tint: "bg-emerald-500/10", icon: "text-emerald-600" },
    ppt: { Icon: BsFiletypePpt, tint: "bg-orange-500/10", icon: "text-orange-500" },
    pptx: { Icon: BsFiletypePptx, tint: "bg-orange-500/10", icon: "text-orange-500" },
    png: { Icon: BsFiletypePng, tint: "bg-purple-500/10", icon: "text-purple-500" },
    jpg: { Icon: BsFiletypeJpg, tint: "bg-purple-500/10", icon: "text-purple-500" },
    jpeg: { Icon: BsFiletypeJpg, tint: "bg-purple-500/10", icon: "text-purple-500" },
    gif: { Icon: BsFiletypeGif, tint: "bg-purple-500/10", icon: "text-purple-500" },
    svg: { Icon: BsFiletypeSvg, tint: "bg-purple-500/10", icon: "text-purple-500" },
    webp: { Icon: BsFiletypePng, tint: "bg-purple-500/10", icon: "text-purple-500" },
    zip: { Icon: BsFileEarmarkZip, tint: "bg-amber-500/10", icon: "text-amber-600" },
    rar: { Icon: BsFileEarmarkZip, tint: "bg-amber-500/10", icon: "text-amber-600" },
    "7z": { Icon: BsFileEarmarkZip, tint: "bg-amber-500/10", icon: "text-amber-600" },
    gz: { Icon: BsFileEarmarkZip, tint: "bg-amber-500/10", icon: "text-amber-600" },
    tar: { Icon: BsFileEarmarkZip, tint: "bg-amber-500/10", icon: "text-amber-600" },
    mp4: { Icon: BsFiletypeMp4, tint: "bg-rose-500/10", icon: "text-rose-500" },
    mov: { Icon: BsFiletypeMov, tint: "bg-rose-500/10", icon: "text-rose-500" },
    webm: { Icon: BsFiletypeMp4, tint: "bg-rose-500/10", icon: "text-rose-500" },
    mp3: { Icon: BsFiletypeMp3, tint: "bg-pink-500/10", icon: "text-pink-500" },
    wav: { Icon: BsFiletypeWav, tint: "bg-pink-500/10", icon: "text-pink-500" },
    json: { Icon: BsFiletypeJson, tint: "bg-cyan-500/10", icon: "text-cyan-600" },
    js: { Icon: BsFiletypeJs, tint: "bg-cyan-500/10", icon: "text-cyan-600" },
    ts: { Icon: BsFiletypeJs, tint: "bg-cyan-500/10", icon: "text-cyan-600" },
    html: { Icon: BsFiletypeHtml, tint: "bg-cyan-500/10", icon: "text-cyan-600" },
    css: { Icon: BsFiletypeCss, tint: "bg-cyan-500/10", icon: "text-cyan-600" },
};

const DEFAULT_VISUAL: FileVisual = {
    Icon: BsFileEarmark,
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
                    <BsFileEarmark className="h-3.5 w-3.5" />
                    Empty attachment
                </span>
            </NodeViewWrapper>
        );
    }

    const { Icon, tint, icon } = getFileVisual(name);
    // Prefer the real extension from the file name; fall back to a meaningful
    // fileType (ignore the generic "file" placeholder so we never render "FILE").
    const nameExt = name.includes(".") ? name.split(".").pop() ?? "" : "";
    const typeExt = fileType && String(fileType).toLowerCase() !== "file" ? String(fileType) : "";
    const ext = (nameExt || typeExt).toUpperCase();

    // Inline attachment style (compact pill, flows with text)
    if (isInline) {
        return (
            <NodeViewWrapper
                as="span"
                className="inline-flex max-w-full align-middle"
                contentEditable={false}
            >
                <span
                    className={cn(
                        "group inline-flex max-w-[260px] items-center gap-1.5 rounded-lg py-1 pl-2 pr-2.5 align-middle",
                        "border border-border/70 bg-muted/40 text-foreground",
                        "transition-colors hover:border-border hover:bg-muted/80",
                        editor.isEditable ? "cursor-pointer" : "cursor-default"
                    )}
                    onClick={handleDownload}
                    title={name}
                >
                    <Icon className={cn("h-4 w-4 flex-shrink-0", icon)} />
                    <span className="truncate text-[13px] font-medium leading-none">{name}</span>
                    {size > 0 && (
                        <span className="flex-shrink-0 text-[11px] leading-none text-muted-foreground/70">
                            {formatFileSize(size)}
                        </span>
                    )}
                </span>
            </NodeViewWrapper>
        );
    }

    // Block attachment style (compact file card)
    return (
        <NodeViewWrapper as="div" className="my-3 not-prose w-full" contentEditable={false}>
            <div
                className={cn(
                    "group flex w-full max-w-md items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5",
                    "transition-all duration-200 hover:border-border hover:bg-accent/30 hover:shadow-sm",
                    editor.isEditable ? "cursor-pointer" : "cursor-default"
                )}
                onClick={handleDownload}
                role="button"
                title={`Download ${name}`}
            >
                {/* File type icon */}
                <span
                    className={cn(
                        "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg",
                        tint
                    )}
                >
                    <Icon className={cn("h-5 w-5", icon)} />
                </span>

                {/* File info */}
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-foreground" title={name}>
                        {name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {ext && <span className="uppercase tracking-wide">{ext}</span>}
                        {ext && size > 0 && <span className="text-muted-foreground/40">·</span>}
                        {size > 0 && <span>{formatFileSize(size)}</span>}
                    </div>
                </div>

                {/* Download button */}
                <span
                    className={cn(
                        "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground/60",
                        "transition-colors hover:bg-accent hover:text-foreground"
                    )}
                >
                    <DownloadIcon className="h-4 w-4" />
                </span>
            </div>
        </NodeViewWrapper>
    );
};
