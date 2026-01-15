import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@kn/ui";
import { FileManagerProps, FileManagerView } from "./FileManager";
import React from "react";


export interface FolderDlgProps extends FileManagerProps {

    open: boolean
}

export const FolderDlg: React.FC<FolderDlgProps> = (props) => {

    return <Dialog open={props.open} onOpenChange={(open) => {
        if (!open && props.onCancel) {
            props.onCancel();
        }
    }}>
        <DialogTrigger></DialogTrigger>
        <DialogContent className=" max-w-none w-[80%]">
            <DialogHeader className="">
                <DialogTitle>{props.target === 'file' ? '请选择图片' : '请选择文件'}</DialogTitle>
                <DialogDescription></DialogDescription>
            </DialogHeader>
            <FileManagerView {...props} className="w-full h-[calc(100vh*0.8)]" />
        </DialogContent>
    </Dialog>
}