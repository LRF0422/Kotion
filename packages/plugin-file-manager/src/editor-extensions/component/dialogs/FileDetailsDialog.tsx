import React from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Button,
    Separator,
} from "@kn/ui";
import { FolderIcon, FileIcon, CalendarIcon, HardDriveIcon, MapPinIcon } from "@kn/icon";
import { FileItem } from "../FileContext";
import { formatFileSize } from "../../../utils/fileUtils";

export interface FileDetailsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    file: FileItem | null;
}

interface DetailRowProps {
    label: string;
    value: string | React.ReactNode;
    icon?: React.ReactNode;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value, icon }) => (
    <div className="flex items-start gap-3 py-2">
        {icon && <div className="text-muted-foreground mt-0.5">{icon}</div>}
        <div className="flex-1 min-w-0">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="text-sm font-medium truncate">{value}</div>
        </div>
    </div>
);

export const FileDetailsDialog: React.FC<FileDetailsDialogProps> = ({
    open,
    onOpenChange,
    file,
}) => {
    if (!file) return null;

    const formatDate = (dateString?: string) => {
        if (!dateString) return "Unknown";
        try {
            return new Date(dateString).toLocaleString();
        } catch {
            return "Unknown";
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[450px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {file.isFolder ? (
                            <FolderIcon className="h-5 w-5 text-yellow-500" />
                        ) : (
                            <FileIcon className="h-5 w-5 text-blue-500" />
                        )}
                        <span className="truncate">{file.name}</span>
                    </DialogTitle>
                    <DialogDescription>
                        {file.isFolder ? "Folder" : "File"} properties
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-1">
                    {/* Basic Info Section */}
                    <div className="bg-muted/50 rounded-lg p-4 space-y-1">
                        <h4 className="text-sm font-semibold mb-2">Basic Information</h4>

                        <DetailRow
                            label="Name"
                            value={file.name}
                        />

                        <DetailRow
                            label="Type"
                            value={file.isFolder ? "Folder" : "File"}
                        />

                        {file.path && (
                            <DetailRow
                                label="Location"
                                value={file.path}
                                icon={<MapPinIcon className="h-4 w-4" />}
                            />
                        )}
                    </div>

                    <Separator />

                    {/* Size & Dates Section */}
                    <div className="bg-muted/50 rounded-lg p-4 space-y-1">
                        <h4 className="text-sm font-semibold mb-2">Details</h4>

                        {!file.isFolder && file.size !== undefined && (
                            <DetailRow
                                label="Size"
                                value={formatFileSize(file.size)}
                                icon={<HardDriveIcon className="h-4 w-4" />}
                            />
                        )}

                        <DetailRow
                            label="Created"
                            value={formatDate(file.createdAt)}
                            icon={<CalendarIcon className="h-4 w-4" />}
                        />

                        <DetailRow
                            label="Modified"
                            value={formatDate(file.updatedAt)}
                            icon={<CalendarIcon className="h-4 w-4" />}
                        />
                    </div>

                    {/* ID Section (for debugging/reference) */}
                    <div className="bg-muted/50 rounded-lg p-4">
                        <h4 className="text-sm font-semibold mb-2">Technical Details</h4>
                        <DetailRow
                            label="ID"
                            value={
                                <code className="text-xs bg-muted px-1 py-0.5 rounded break-all">
                                    {file.id}
                                </code>
                            }
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
