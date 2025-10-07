import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@kn/ui";
import { FileManagerProps, FileManagerView } from "./FileManager";
import React from "react";


export interface FolderDlgProps extends FileManagerProps {

    open: boolean
}

export const FolderDlg: React.FC<FolderDlgProps> = (props) => { 

    return <Dialog open={props.open}>
        <DialogTrigger></DialogTrigger>
        <DialogContent className="max-w-none w-[80%]">
            <DialogHeader>
                <DialogTitle>请选择文件</DialogTitle>
                <DialogDescription></DialogDescription>
            </DialogHeader>
            <FileManagerView {...props} />
            <DialogClose onClick={props.onCancel} />
        </DialogContent>
    </Dialog>
}