import React, { useEffect, useMemo, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    Button,
    cn,
} from "@kn/ui";
import { useFileService } from "@kn/common";
import { Download, ExternalLink, FileQuestion, Loader2 } from "@kn/icon";
import { FileItem } from "../FileContext";
import { getPreviewKind, formatFileSize, type PreviewKind } from "../../../utils/fileUtils";

export interface FilePreviewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    file: FileItem | null;
    /** Download the file (falls back to opening the URL when not provided) */
    onDownload?: (file: FileItem) => void;
}

/**
 * Inline preview for files in the file manager.
 * Supports images, video, audio, PDF and plain-text/code; other types
 * fall back to a download/open prompt.
 */
export const FilePreviewDialog: React.FC<FilePreviewDialogProps> = ({
    open,
    onOpenChange,
    file,
    onDownload,
}) => {
    const fileService = useFileService();
    const [loading, setLoading] = useState(true);
    const [errored, setErrored] = useState(false);

    const kind: PreviewKind = file && !file.isFolder ? getPreviewKind(file.name) : "none";

    const url = useMemo(() => {
        if (!file || !file.path) return "";
        return fileService.getDownloadUrl(file.path);
    }, [file, fileService]);

    // Reset loading/error state whenever the previewed file changes
    useEffect(() => {
        if (open) {
            setLoading(kind === "image" || kind === "pdf" || kind === "text");
            setErrored(false);
        }
    }, [open, url, kind]);

    if (!file) return null;

    const openInNewTab = () => {
        if (url) window.open(url, "_blank");
    };

    const handleDownload = () => {
        if (onDownload) onDownload(file);
        else openInNewTab();
    };

    const renderBody = () => {
        if (!url) {
            return (
                <FallbackBody
                    file={file}
                    message="No preview available — this file has no source location."
                    onDownload={handleDownload}
                />
            );
        }

        switch (kind) {
            case "image":
                return (
                    <div className="relative flex items-center justify-center w-full h-full min-h-[200px]">
                        {loading && <LoadingSpinner />}
                        <img
                            src={url}
                            alt={file.name}
                            className={cn(
                                "max-w-full max-h-[70vh] object-contain rounded",
                                loading && "opacity-0"
                            )}
                            onLoad={() => setLoading(false)}
                            onError={() => {
                                setLoading(false);
                                setErrored(true);
                            }}
                        />
                        {errored && (
                            <FallbackBody
                                file={file}
                                message="Failed to load image preview."
                                onDownload={handleDownload}
                            />
                        )}
                    </div>
                );
            case "video":
                return (
                    <video
                        src={url}
                        controls
                        autoPlay={false}
                        className="max-w-full max-h-[70vh] rounded bg-black"
                    >
                        Your browser does not support video playback.
                    </video>
                );
            case "audio":
                return (
                    <div className="w-full py-10 px-4 flex items-center justify-center">
                        <audio src={url} controls className="w-full max-w-[480px]">
                            Your browser does not support audio playback.
                        </audio>
                    </div>
                );
            case "pdf":
            case "text":
                return (
                    <div className="relative w-full h-[70vh]">
                        {loading && <LoadingSpinner />}
                        <iframe
                            src={url}
                            title={file.name}
                            className="w-full h-full rounded border bg-white"
                            onLoad={() => setLoading(false)}
                        />
                    </div>
                );
            default:
                return (
                    <FallbackBody
                        file={file}
                        message="This file type can't be previewed."
                        onDownload={handleDownload}
                    />
                );
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[90vw] md:max-w-[860px] w-full">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 pr-8">
                        <span className="truncate" title={file.name}>{file.name}</span>
                        {file.size !== undefined && (
                            <span className="text-xs font-normal text-muted-foreground flex-shrink-0">
                                {formatFileSize(file.size)}
                            </span>
                        )}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex items-center justify-center min-h-[200px]">
                    {renderBody()}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={openInNewTab} disabled={!url}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open in new tab
                    </Button>
                    <Button size="sm" onClick={handleDownload}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

const LoadingSpinner: React.FC = () => (
    <div className="absolute inset-0 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
);

const FallbackBody: React.FC<{
    file: FileItem;
    message: string;
    onDownload: () => void;
}> = ({ message, onDownload }) => (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <FileQuestion className="h-14 w-14 text-muted-foreground" />
        <p className="text-sm text-muted-foreground max-w-[320px]">{message}</p>
        <Button size="sm" onClick={onDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
        </Button>
    </div>
);
