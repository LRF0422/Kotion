import { cn } from "@kn/ui";
import { FileManagerProps, FileManagerView } from "./FileManager";
import React from "react";
import { useI18n } from "../../i18n/use-i18n";
import { FileManagerDialogShell } from "./FileManagerDialogShell";

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
        <FileManagerDialogShell
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) onCancel?.();
            }}
            title={title || t(`folderDialog.${type}Title`)}
            description={description || t(`folderDialog.${type}Description`)}
        >
            <FileManagerView
                {...fileManagerProps}
                target={target}
                accept={accept}
                onCancel={onCancel}
                className={cn("h-full w-full rounded-none border-0", className)}
            />
        </FileManagerDialogShell>
    );
};
