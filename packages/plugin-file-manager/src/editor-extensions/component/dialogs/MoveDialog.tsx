import React, { useState, useCallback, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Button,
    ScrollArea,
    cn,
} from "@kn/ui";
import { FolderIcon, ChevronRight, HomeIcon, Loader2 } from "@kn/icon";
import { FileItem, BreadcrumbItem } from "../FileContext";
import { logger, useApi } from "@kn/common";
import { APIS } from "../../../api";
import { useI18n } from "../../../i18n/use-i18n";
import { normalizeFileName } from "../../../utils/fileUtils";

export interface MoveDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    files: FileItem[];
    onConfirm: (files: FileItem[], targetFolderId: string) => void;
    currentFolderId: string;
}

interface FolderTreeItem {
    id: string;
    name: string;
    children?: FolderTreeItem[];
    isExpanded?: boolean;
}

export const MoveDialog: React.FC<MoveDialogProps> = ({
    open,
    onOpenChange,
    files,
    onConfirm,
    currentFolderId,
}) => {
    const [selectedFolderId, setSelectedFolderId] = useState<string>("");
    const [folders, setFolders] = useState<FolderTreeItem[]>([]);
    const [loading, setLoading] = useState(false);
    const { t } = useI18n();
    const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([
        { id: "", name: t('move.home'), path: "" }
    ]);
    useEffect(() => {
        if (open) {
            fetchFolders("");
            setSelectedFolderId("");
            setBreadcrumb([{ id: "", name: t('move.home'), path: "" }]);
        }
    }, [open, t]);

    const fetchFolders = async (folderId: string) => {
        setLoading(true);
        try {
            const api = folderId ? APIS.GET_CHILDREN : APIS.GET_ROOT_FOLDER;
            const params = folderId ? { folderId } : undefined;
            const res = await useApi(api, params);

            // Filter only folders and exclude files being moved
            const movingIds = files.map(f => f.id);
            const folderItems: FolderTreeItem[] = res.data
                .filter((item: any) => item.type?.value === 'FOLDER' && !movingIds.includes(String(item.id)))
                .map((item: any) => ({
                    id: String(item.id),
                    name: normalizeFileName(item.name, item.id),
                }));

            setFolders(folderItems);
        } catch (err) {
            logger.error('Failed to load folders for move dialog', err);
        } finally {
            setLoading(false);
        }
    };

    const handleFolderClick = useCallback((folder: FolderTreeItem) => {
        setSelectedFolderId(folder.id);
    }, []);

    const handleFolderDoubleClick = useCallback((folder: FolderTreeItem) => {
        // Navigate into folder
        fetchFolders(folder.id);
        setBreadcrumb(prev => [...prev, { id: folder.id, name: folder.name, path: folder.id }]);
    }, []);

    const handleBreadcrumbClick = useCallback((index: number) => {
        const targetBreadcrumb = breadcrumb[index];
        fetchFolders(targetBreadcrumb.id);
        setBreadcrumb(prev => prev.slice(0, index + 1));
        setSelectedFolderId(targetBreadcrumb.id);
    }, [breadcrumb]);

    const handleConfirm = useCallback(() => {
        if (files.length === 0) return;

        // Use selected folder or current browsed folder
        const targetId = selectedFolderId || breadcrumb[breadcrumb.length - 1].id;

        // Don't allow moving to current folder
        if (targetId === currentFolderId) {
            return;
        }

        onConfirm(files, targetId);
        onOpenChange(false);
    }, [files, selectedFolderId, breadcrumb, currentFolderId, onConfirm, onOpenChange]);

    if (files.length === 0) return null;

    const currentBrowsedFolderId = breadcrumb[breadcrumb.length - 1].id;
    const canMove = (selectedFolderId || currentBrowsedFolderId) !== currentFolderId;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[520px] flex-col gap-0 overflow-hidden p-0 pb-safe sm:max-h-[min(82dvh,680px)] [&>button]:h-11 [&>button]:w-11 lg:[&>button]:h-8 lg:[&>button]:w-8">
                <DialogHeader className="shrink-0 border-b px-4 py-3 pr-14 text-left">
                    <DialogTitle>{t('move.title', { count: files.length })}</DialogTitle>
                    <DialogDescription>{t('move.description')}</DialogDescription>
                </DialogHeader>

                <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
                    <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b pb-2 text-sm text-muted-foreground">
                        {breadcrumb.map((item, index) => (
                            <React.Fragment key={item.id || 'home'}>
                                {index > 0 && <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/40" />}
                                <button
                                    onClick={() => handleBreadcrumbClick(index)}
                                    className={cn(
                                        "flex h-11 flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 outline-none transition-colors duration-150 hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-muted/70 motion-reduce:transition-none lg:h-8 lg:px-1.5",
                                        index === breadcrumb.length - 1 && "font-medium text-foreground",
                                    )}
                                >
                                    {index === 0 && <HomeIcon className="h-4 w-4" />}
                                    {item.name}
                                </button>
                            </React.Fragment>
                        ))}
                    </div>

                    <ScrollArea className="min-h-48 flex-1 rounded-lg border bg-muted/10">
                        {loading ? (
                            <div className="flex h-full min-h-48 items-center justify-center text-muted-foreground">
                                <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-label={t('image.loading')} />
                            </div>
                        ) : folders.length === 0 ? (
                            <div className="flex h-full min-h-48 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                                {t('move.noFolders')}
                            </div>
                        ) : (
                            <div role="listbox" className="space-y-1 p-2">
                                {folders.map((folder) => {
                                    const selected = selectedFolderId === folder.id;
                                    return (
                                        <div
                                            key={folder.id}
                                            role="option"
                                            tabIndex={0}
                                            aria-selected={selected}
                                            onClick={() => handleFolderClick(folder)}
                                            onDoubleClick={() => handleFolderDoubleClick(folder)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') handleFolderDoubleClick(folder);
                                                if (event.key === ' ') {
                                                    event.preventDefault();
                                                    handleFolderClick(folder);
                                                }
                                            }}
                                            className={cn(
                                                "group flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-muted/70 motion-reduce:transition-none lg:min-h-9",
                                                selected
                                                    ? "bg-primary/[0.06] ring-1 ring-inset ring-primary/30 active:bg-primary/10"
                                                    : "hover:bg-muted/60",
                                            )}
                                        >
                                            <FolderIcon className="h-5 w-5 flex-shrink-0 text-amber-500" />
                                            <span className="min-w-0 flex-1 truncate text-sm">{folder.name}</span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-11 w-11 flex-shrink-0 rounded-md text-muted-foreground transition-colors duration-150 hover:text-foreground active:bg-muted/70 motion-reduce:transition-none lg:h-8 lg:w-8"
                                                aria-label={t('move.openFolder', { name: folder.name })}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    if (event.detail > 1) return;
                                                    handleFolderDoubleClick(folder);
                                                }}
                                                onDoubleClick={(event) => event.stopPropagation()}
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </ScrollArea>
                </div>

                <div className="shrink-0 border-t bg-muted/20 px-4 py-3">
                    <div className="mb-3 truncate text-sm text-muted-foreground">
                        {selectedFolderId ? (
                            <span>{t('move.moveTo')} <strong className="font-medium text-foreground">{folders.find(f => f.id === selectedFolderId)?.name}</strong></span>
                        ) : (
                            <span>{t('move.moveToCurrent')} <strong className="font-medium text-foreground">{breadcrumb[breadcrumb.length - 1].name}</strong></span>
                        )}
                    </div>
                    <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                        <Button className="h-11 w-full lg:h-9 lg:w-auto" variant="outline" onClick={() => onOpenChange(false)}>
                            {t('move.cancel')}
                        </Button>
                        <Button className="h-11 w-full lg:h-9 lg:w-auto" onClick={handleConfirm} disabled={!canMove || loading}>
                            {t('move.confirm')}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
};
