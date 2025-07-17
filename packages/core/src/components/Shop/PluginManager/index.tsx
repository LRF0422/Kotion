import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@kn/ui";
import React, { PropsWithChildren } from "react";


export const PluginManager: React.FC<PropsWithChildren> = ({ children }) => {
    return <Dialog>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className=" max-w-none w-[80%]">
            <DialogHeader>
                <DialogTitle>管理你的插件</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-[200px_1fr] h-[calc(100vh*0.8)] w-full">
                <div className="h-full w-full border-r">
                    32123
                </div>
            </div>
        </DialogContent>
    </Dialog>
}