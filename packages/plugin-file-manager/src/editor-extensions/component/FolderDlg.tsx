import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    cn,
} from "@kn/ui";
import { FileManagerProps, FileManagerView } from "./FileManager";
import React from "react";
import { useI18n } from "../../i18n/use-i18n";

export interface FolderDlgProps extends FileManagerProps {
    open: boolean;
    title?: string;
    description?: string;
}

export const FolderDlg: React.FC<FolderDlgProps> = ({
    open,
    title,
    description,
    onCancel,
    className,
    target = 'both',
    accept,
    ...fileManagerProps
}) => {
    const { t } = useI18n();
    const imageOnly = target === 'file' && accept?.some((pattern) => pattern.toLowerCase() === 'image/*');
    const type = target === 'folder' ? 'folder' : target === 'both' ? 'both' : imageOnly ? 'image' : 'file';

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) onCancel?.();
            }}
        >
            <DialogContent className="flex h-[100dvh] w-full max-w-none flex-col gap-0 p-0 sm:h-[80vh] sm:w-[80vw] sm:max-w-5xl">
                <DialogHeader className="border-b px-4 py-3">
                    <DialogTitle>{title || t(`folderDialog.${type}Title`)}</DialogTitle>
                    <DialogDescription>
                        {description || t(`folderDialog.${type}Description`)}
                    </DialogDescription>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-hidden">
                    <FileManagerView
                        {...fileManagerProps}
                        target={target}
                        accept={accept}
                        onCancel={onCancel}
                        className={cn("h-full w-full rounded-none border-0", className)}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
};
