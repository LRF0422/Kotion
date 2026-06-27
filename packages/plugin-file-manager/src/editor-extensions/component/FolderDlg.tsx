import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@kn/ui";
import { FileManagerProps, FileManagerView } from "./FileManager";
import React from "react";
import { useI18n } from "../../i18n/use-i18n";


export interface FolderDlgProps extends FileManagerProps {

    open: boolean
}

export const FolderDlg: React.FC<FolderDlgProps> = (props) => {
    const { t } = useI18n();

    return <Dialog open={props.open} onOpenChange={(open) => {
        if (!open && props.onCancel) {
            props.onCancel();
        }
    }}>
        <DialogTrigger></DialogTrigger>
        <DialogContent className=" max-w-none w-[80%]">
            <DialogHeader className="">
                <DialogTitle>{props.target === 'file' ? t('folderDialog.selectFile') : t('folderDialog.selectImage')}</DialogTitle>
                <DialogDescription></DialogDescription>
            </DialogHeader>
            <FileManagerView {...props} className="w-full h-[calc(100vh*0.8)]" />
        </DialogContent>
    </Dialog>
}