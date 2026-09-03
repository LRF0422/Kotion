import React, { useEffect, useMemo, useState } from "react";
import { Button, cn } from "@kn/ui";
import { useFileService } from "@kn/common";
import { Download, ExternalLink, FileQuestion, Loader2, RefreshCw } from "@kn/icon";
import { FileItem } from "../FileContext";
import { FileManagerDialogShell } from "../FileManagerDialogShell";
import { MediaPlayer } from "../media/MediaPlayer";
import { useResolvedMediaKind } from "../media/useResolvedMediaKind";
import { getPreviewKind, formatFileSize, type PreviewKind } from "../../../utils/fileUtils";
import { useI18n } from "../../../i18n/use-i18n";

export interface FilePreviewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    file: FileItem | null;
    /** Download the file (falls back to opening the URL when not provided) */
    onDownload?: (file: FileItem) => void;
    /** Optional pre-resolved URL (e.g. absolute http links); overrides fileService resolution */
    url?: string;
}

/** Inline preview for files in the file manager and editor attachments. */
export const FilePreviewDialog: React.FC<FilePreviewDialogProps> = ({
    open,
    onOpenChange,
    file,
    onDownload,
    url: urlOverride,
}) => {
    const fileService = useFileService();
    const [loading, setLoading] = useState(true);
    const [errored, setErrored] = useState(false);
    const { t } = useI18n();

    const kind: PreviewKind = file && !file.isFolder
        ? getPreviewKind(file.name, file.mediaType)
        : "none";

    const url = useMemo(() => {
        if (urlOverride) return urlOverride;
        if (!file || !file.path) return "";
        return fileService.getDownloadUrl(file.path);
    }, [file, fileService, urlOverride]);

    const mediaResolution = useResolvedMediaKind(kind, url, open && !!file);

    useEffect(() => {
        if (open) {
            setLoading(kind === "image" || kind === "pdf" || kind === "text");
            setErrored(false);
        }
    }, [open, url, kind]);

    if (!file) return null;

    const openInNewTab = () => {
        if (url) window.open(url, "_blank", "noopener,noreferrer");
    };

    const handleDownload = () => {
        if (onDownload) onDownload(file);
        else openInNewTab();
    };

    const renderBody = () => {
        if (!url) {
            return <FallbackBody message={t('preview.noPreview')} onDownload={handleDownload} />;
        }

        if (kind === 'media') {
            if (mediaResolution.status === 'probing') {
                return <LoadingSpinner message={t('preview.identifyingMedia')} />;
            }
            if (mediaResolution.status === 'error' || !mediaResolution.kind) {
                return (
                    <FallbackBody
                        message={t('preview.mediaIdentificationFailed')}
                        onDownload={handleDownload}
                        onRetry={mediaResolution.retry}
                    />
                );
            }
        }

        const resolvedMediaKind = mediaResolution.kind;
        if (resolvedMediaKind) {
            return (
                <MediaPlayer
                    kind={resolvedMediaKind}
                    src={url}
                    label={file.name}
                    sizeLabel={file.size !== undefined ? formatFileSize(file.size) : undefined}
                    onDownload={handleDownload}
                />
            );
        }

        switch (kind) {
            case "image":
                return (
                    <div className="relative flex h-full min-h-[200px] w-full items-center justify-center overflow-hidden p-4">
                        {loading && <LoadingSpinner message={t('preview.loadingMedia')} overlay />}
                        <img
                            src={url}
                            alt={file.name}
                            className={cn(
                                "max-h-full max-w-full rounded-md object-contain",
                                loading && "opacity-0",
                                errored && "hidden",
                            )}
                            onLoad={() => setLoading(false)}
                            onError={() => {
                                setLoading(false);
                                setErrored(true);
                            }}
                        />
                        {errored && <FallbackBody message={t('preview.failedImage')} onDownload={handleDownload} />}
                    </div>
                );
            case "pdf":
            case "text":
                return (
                    <div className="relative h-full min-h-[200px] w-full p-2 md:p-4">
                        {loading && <LoadingSpinner message={t('preview.loadingMedia')} overlay />}
                        <iframe
                            src={url}
                            title={file.name}
                            className="h-full w-full rounded-md border bg-white"
                            onLoad={() => setLoading(false)}
                        />
                    </div>
                );
            default:
                return <FallbackBody message={t('preview.cannotPreview')} onDownload={handleDownload} />;
        }
    };

    const compactAudio = mediaResolution.kind === 'audio';

    return (
        <FileManagerDialogShell
            open={open}
            onOpenChange={onOpenChange}
            title={file.name}
            description={file.size !== undefined ? formatFileSize(file.size) : undefined}
            contentClassName={cn(
                "md:max-w-[1120px]",
                compactAudio && "md:h-[520px] md:max-h-[calc(100dvh-3rem)] md:max-w-[820px]",
            )}
            bodyClassName="flex flex-col"
        >
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                {renderBody()}
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-background px-4 py-3">
                <Button
                    variant="outline"
                    onClick={openInNewTab}
                    disabled={!url}
                    className="h-11 lg:h-8"
                >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {t('preview.openInNewTab')}
                </Button>
                <Button onClick={handleDownload} className="h-11 lg:h-8">
                    <Download className="mr-2 h-4 w-4" />
                    {t('preview.download')}
                </Button>
            </div>
        </FileManagerDialogShell>
    );
};

const LoadingSpinner: React.FC<{ message?: string; overlay?: boolean }> = ({ message, overlay = false }) => (
    <div
        className={cn("flex h-full w-full flex-col items-center justify-center gap-2", overlay && "absolute inset-0")}
        aria-live="polite"
    >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        {message && <span className="text-xs text-muted-foreground">{message}</span>}
    </div>
);

const FallbackBody: React.FC<{
    message: string;
    onDownload: () => void;
    onRetry?: () => void;
}> = ({ message, onDownload, onRetry }) => {
    const { t } = useI18n();
    return (
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center" role="alert">
            <FileQuestion className="h-14 w-14 text-muted-foreground" />
            <p className="max-w-[360px] text-sm text-muted-foreground">{message}</p>
            <div className="flex flex-wrap justify-center gap-2">
                {onRetry && (
                    <Button variant="outline" onClick={onRetry} className="h-11 lg:h-8">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {t('preview.retry')}
                    </Button>
                )}
                <Button onClick={onDownload} className="h-11 lg:h-8">
                    <Download className="mr-2 h-4 w-4" />
                    {t('preview.download')}
                </Button>
            </div>
        </div>
    );
};
