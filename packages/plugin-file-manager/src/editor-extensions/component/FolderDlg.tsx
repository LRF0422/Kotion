import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@kn/ui";
import { FileManagerProps, FileManagerView } from "./FileManager";
import React from "react";


export interface FolderDlgProps extends FileManagerProps {

    open: boolean
}

export const FolderDlg: React.FC<FolderDlgProps> = (props) => { 

    return <Dialog open={props.open}>
        <DialogTrigger></DialogTrigger>
        <DialogContent className=" max-w-none w-[80%]">
            <DialogHeader className="">
                <DialogTitle>请选择文件</DialogTitle>
                <DialogDescription></DialogDescription>
            </DialogHeader>
            <FileManagerView {...props} className="w-full h-[calc(100vh*0.8)]" />
        </DialogContent>
    </Dialog>
}