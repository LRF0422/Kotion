import { NodeViewProps, NodeViewWrapper } from "@kn/editor";
import React, { useMemo } from "react";
import { useUploadFile } from "@kn/core";
import { cn, Badge } from "@kn/ui";
import { FileIcon, DownloadIcon, FileTextIcon } from "@kn/icon";

// Helper function to format file size
const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

// Helper function to get file icon based on file type
const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const iconClass = "h-5 w-5";

    // You can expand this with more specific icons based on file types
    const fileTypeIcons: Record<string, React.ReactNode> = {
        'pdf': <FileTextIcon className={iconClass} />,
        'doc': <FileTextIcon className={iconClass} />,
        'docx': <FileTextIcon className={iconClass} />,
        'txt': <FileTextIcon className={iconClass} />,
        'xls': <FileTextIcon className={iconClass} />,
        'xlsx': <FileTextIcon className={iconClass} />,
    };

    return fileTypeIcons[ext || ''] || <FileIcon className={iconClass} />;
};

export const AttachmentView: React.FC<NodeViewProps> = (props) => {
    const { node, editor } = props;
    const { id, name, path, size, fileType } = node.attrs;
    const { usePath } = useUploadFile();

    // Determine if this is an inline attachment
    const isInline = node.type.name === "attachmentInline";

    // Get the download URL
    const downloadUrl = useMemo(() => {
        if (!path) return '';
        if (path.startsWith('http://') || path.startsWith('https://')) {
            return path;
        }
        return usePath(path);
    }, [path, usePath]);

    // Handle download
    const handleDownload = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (downloadUrl) {
            window.open(downloadUrl, '_blank');
        }
    };

    // If no name, show placeholder
    if (!name) {
        return (
            <NodeViewWrapper className="inline-block">
                <div className="text-muted-foreground text-sm italic border border-dashed p-2">
                    [Empty attachment]
                </div>
            </NodeViewWrapper>
        );
    }

    // Inline attachment style (compact, inline with text)
    if (isInline) {
        return (
            <NodeViewWrapper
                as="span"
                className="inline-flex items-center max-w-[300px]"
                contentEditable={false}
                style={{ display: 'inline-flex' }}
            >
                <span
                    className={cn(
                        "inline-flex items-center gap-1.5 px-2 py-1 rounded-md",
                        "bg-muted hover:bg-muted/80 transition-colors",
                        "border border-border",
                        "cursor-pointer group",
                        "text-foreground",
                        !editor.isEditable && "cursor-default"
                    )}
                    onClick={handleDownload}
                    title={`Download ${name}`}
                    style={{ minWidth: 'fit-content' }}
                >
                    {getFileIcon(name)}
                    <span
                        className="text-sm font-medium max-w-[200px]"
                    >
                        {name}
                    </span>
                    {size > 0 && (
                        <span className="text-xs text-muted-foreground" style={{ opacity: 0.7 }}>
                            ({formatFileSize(size)})
                        </span>
                    )}
                    <DownloadIcon className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </span>
            </NodeViewWrapper>
        );
    }

    // Block attachment style (full width, card-like)
    return (
        <NodeViewWrapper
            as="div"
            className="my-4 not-prose"
            contentEditable={false}
            style={{ display: 'block', width: '100%' }}
        >
            <div
                className={cn(
                    "flex items-center gap-4 p-4 rounded-lg w-full",
                    "bg-muted/50 hover:bg-muted/70 transition-all duration-200",
                    "border border-border hover:border-primary/50",
                    "cursor-pointer group",
                    "text-foreground",
                    "shadow-sm hover:shadow-md",
                    !editor.isEditable && "cursor-default"
                )}
                onClick={handleDownload}
                style={{ minHeight: '80px', width: '100%', color: 'inherit' }}
            >
                {/* File Icon - Larger for block style */}
                <div
                    className="flex-shrink-0 p-3 bg-background rounded-lg border-2 shadow-sm"
                    style={{
                        width: '56px',
                        height: '56px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <div style={{ transform: 'scale(1.4)' }}>
                        {getFileIcon(name)}
                    </div>
                </div>

                {/* File Info - More spacing and larger text */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span
                            className="font-semibold text-base truncate"
                            style={{
                                color: 'var(--foreground, #000)',
                                display: 'inline-block'
                            }}
                        >
                            {name}
                        </span>
                        {fileType && (
                            <Badge variant="secondary" className="text-xs font-medium">
                                {fileType.toUpperCase()}
                            </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        {size > 0 && (
                            <span className="text-muted-foreground flex items-center gap-1">
                                <span style={{ opacity: 0.8 }}>📦</span>
                                {formatFileSize(size)}
                            </span>
                        )}
                        <span className="text-muted-foreground flex items-center gap-1">
                            <span style={{ opacity: 0.8 }}>📄</span>
                            File Attachment
                        </span>
                    </div>
                </div>

                {/* Download Button - More prominent */}
                <div className="flex-shrink-0">
                    <div
                        className={cn(
                            "p-3 rounded-lg bg-primary/10 hover:bg-primary/20",
                            "opacity-70 group-hover:opacity-100 transition-all duration-200",
                            "border border-primary/20"
                        )}
                        title="Click to download"
                        style={{
                            width: '44px',
                            height: '44px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <DownloadIcon className="h-5 w-5 text-primary" />
                    </div>
                </div>
            </div>
        </NodeViewWrapper>
    );
};