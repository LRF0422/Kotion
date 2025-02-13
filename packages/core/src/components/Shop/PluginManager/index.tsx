import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@repo/ui";
import React, { PropsWithChildren } from "react";


export const PluginManager: React.FC<PropsWithChildren> = ({ children }) => {
    return <Dialog>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className=" max-w-none w-[80%] h-[80%]">
            <DialogHeader>
                <DialogTitle></DialogTitle>
                <DialogDescription></DialogDescription>
            </DialogHeader>
        </DialogContent>
    </Dialog>
}