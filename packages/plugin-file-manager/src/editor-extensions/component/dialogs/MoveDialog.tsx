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
import { FolderIcon, ChevronRight, HomeIcon } from "@kn/icon";
import { FileItem, BreadcrumbItem } from "../FileContext";
import { logger, useApi } from "@kn/common";
import { APIS } from "../../../api";
import { useI18n } from "../../../i18n/use-i18n";

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
                .filter((item: any) => item.type.value === 'FOLDER' && !movingIds.includes(item.id))
                .map((item: any) => ({
                    id: item.id,
                    name: item.name,
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
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{t('move.title', { count: files.length })}</DialogTitle>
                    <DialogDescription>
                        {t('move.description')}
                    </DialogDescription>
                </DialogHeader>

                {/* Breadcrumb navigation */}
                <div className="flex items-center gap-1 text-sm text-muted-foreground py-2 border-b overflow-x-auto">
                    {breadcrumb.map((item, index) => (
                        <React.Fragment key={item.id || 'home'}>
                            {index > 0 && <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                            <button
                                onClick={() => handleBreadcrumbClick(index)}
                                className={cn(
                                    "hover:text-foreground transition-colors flex items-center gap-1 whitespace-nowrap",
                                    index === breadcrumb.length - 1 && "text-foreground font-medium"
                                )}
                            >
                                {index === 0 && <HomeIcon className="h-4 w-4" />}
                                {item.name}
                            </button>
                        </React.Fragment>
                    ))}
                </div>

                {/* Folder list */}
                <ScrollArea className="h-[300px] border rounded-md">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                    ) : folders.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                            {t('move.noFolders')}
                        </div>
                    ) : (
                        <div role="listbox" className="space-y-1 p-2">
                            {folders.map((folder) => (
                                <div
                                    key={folder.id}
                                    role="option"
                                    tabIndex={0}
                                    aria-selected={selectedFolderId === folder.id}
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
                                        "flex min-h-11 items-center gap-2 rounded-md p-2 cursor-pointer outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                                        "hover:bg-accent",
                                        selectedFolderId === folder.id && "bg-accent border border-primary"
                                    )}
                                >
                                    <FolderIcon className="h-5 w-5 text-yellow-500" />
                                    <span className="truncate">{folder.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>

                <div className="text-sm text-muted-foreground">
                    {selectedFolderId ? (
                        <span>{t('move.moveTo')} <strong>{folders.find(f => f.id === selectedFolderId)?.name}</strong></span>
                    ) : (
                        <span>{t('move.moveToCurrent')} <strong>{breadcrumb[breadcrumb.length - 1].name}</strong></span>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('move.cancel')}
                    </Button>
                    <Button onClick={handleConfirm} disabled={!canMove || loading}>
                        {t('move.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
