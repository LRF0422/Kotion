import React, { useCallback, useEffect, useState } from "react";
import { logger, useApi } from "@kn/common";
import { NodeViewProps, NodeViewWrapper } from "@kn/editor";
import { FolderIcon, Loader2 } from "@kn/icon";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    cn,
} from "@kn/ui";
import { APIS } from "../../api";
import { useI18n } from "../../i18n/use-i18n";
import { FileManagerView } from "../component/FileManager";

type FolderStatus = 'loading' | 'ready' | 'unavailable';

const pendingFolderRequests = new Map<string, Promise<any>>();

const resolveFolder = (folderId: string): Promise<any> => {
    const pending = pendingFolderRequests.get(folderId);
    if (pending) return pending;

    const request = useApi(APIS.GET_BY_ID, { fileId: folderId })
        .then((response) => response?.data)
        .finally(() => pendingFolderRequests.delete(folderId));
    pendingFolderRequests.set(folderId, request);
    return request;
};

export const FolderInlineView: React.FC<NodeViewProps> = React.memo((props) => {
    const { node, editor, selected, updateAttributes } = props;
    const folderId = node.attrs.folderId ? String(node.attrs.folderId) : '';
    const folderName = node.attrs.folderName ? String(node.attrs.folderName) : '';
    const { t } = useI18n();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [status, setStatus] = useState<FolderStatus>(folderId ? 'loading' : 'unavailable');
    const [displayName, setDisplayName] = useState(folderName);

    useEffect(() => {
        let active = true;
        if (!folderId) {
            setStatus('unavailable');
            return () => { active = false; };
        }

        setStatus('loading');
        resolveFolder(folderId)
            .then((file) => {
                if (!active) return;
                const isFolder = file?.type?.value === 'FOLDER' || file?.type === 'FOLDER';
                if (!file || !isFolder || file.trashed === 1) {
                    setStatus('unavailable');
                    return;
                }

                const liveName = String(file.name || folderName || '');
                setDisplayName(liveName);
                setStatus('ready');
                if (editor.isEditable && liveName && liveName !== folderName) {
                    updateAttributes({ folderName: liveName });
                }
            })
            .catch((error) => {
                if (!active) return;
                logger.error('Failed to resolve inline folder', error);
                setStatus('unavailable');
            });

        return () => {
            active = false;
        };
    }, [editor.isEditable, folderId, folderName, updateAttributes]);

    const openFolder = useCallback(() => {
        if (status === 'ready') setDialogOpen(true);
    }, [status]);

    const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLSpanElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            openFolder();
        }
    }, [openFolder]);

    const label = displayName || folderName || t('inlineFolder.unavailable');
    const unavailable = status === 'unavailable';

    return (
        <NodeViewWrapper as="span" className="node-folder-inline inline align-baseline" contentEditable={false}>
            <span
                role="button"
                tabIndex={0}
                aria-disabled={unavailable}
                aria-label={status === 'loading'
                    ? t('inlineFolder.loading')
                    : unavailable
                        ? t('inlineFolder.unavailableDescription')
                        : t('inlineFolder.openLabel', { name: label })}
                title={unavailable ? t('inlineFolder.unavailableDescription') : label}
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openFolder();
                }}
                onKeyDown={handleKeyDown}
                className={cn(
                    "inline-flex min-h-11 max-w-full cursor-pointer items-center gap-1.5 align-middle",
                    "rounded-md border border-border/70 bg-muted/50 px-2 py-1 text-sm text-foreground",
                    "transition-colors hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "lg:min-h-7 lg:px-1.5 lg:py-0.5",
                    selected && "border-primary/40 bg-primary/10 ring-1 ring-primary/20",
                    unavailable && "cursor-not-allowed border-dashed text-muted-foreground line-through opacity-70",
                )}
            >
                {status === 'loading'
                    ? <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
                    : <FolderIcon className="h-4 w-4 flex-shrink-0 text-amber-500" />}
                <span className="max-w-[280px] truncate">
                    {unavailable ? t('inlineFolder.unavailable') : label}
                </span>
            </span>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="flex h-[100dvh] w-full max-w-none flex-col gap-0 p-0 sm:h-[80vh] sm:w-[85vw] sm:max-w-5xl">
                    <DialogHeader className="border-b px-4 py-3">
                        <DialogTitle>{t('inlineFolder.dialogTitle', { name: label })}</DialogTitle>
                        <DialogDescription>{t('inlineFolder.dialogDescription')}</DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-hidden">
                        {dialogOpen && folderId && (
                            <FileManagerView
                                folderId={folderId}
                                showSidebar={false}
                                className="h-full rounded-none border-0"
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </NodeViewWrapper>
    );
});

FolderInlineView.displayName = 'FolderInlineView';
