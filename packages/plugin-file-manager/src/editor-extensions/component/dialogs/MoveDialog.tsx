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
import { useApi } from "@kn/core";
import { APIS } from "../../../api";

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
    const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([
        { id: "", name: "Home", path: "" }
    ]);

    // Fetch folders on open
    useEffect(() => {
        if (open) {
            fetchFolders("");
            setSelectedFolderId("");
            setBreadcrumb([{ id: "", name: "Home", path: "" }]);
        }
    }, [open]);

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
            console.error('Failed to load folders:', err);
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
                    <DialogTitle>Move {files.length} item{files.length > 1 ? 's' : ''}</DialogTitle>
                    <DialogDescription>
                        Select a destination folder
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
                            No folders available
                        </div>
                    ) : (
                        <div className="p-2 space-y-1">
                            {folders.map((folder) => (
                                <div
                                    key={folder.id}
                                    onClick={() => handleFolderClick(folder)}
                                    onDoubleClick={() => handleFolderDoubleClick(folder)}
                                    className={cn(
                                        "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
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
                        <span>Move to: <strong>{folders.find(f => f.id === selectedFolderId)?.name}</strong></span>
                    ) : (
                        <span>Move to current folder: <strong>{breadcrumb[breadcrumb.length - 1].name}</strong></span>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleConfirm} disabled={!canMove || loading}>
                        Move Here
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
