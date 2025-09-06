import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@kn/ui";
import React, { useEffect } from "react";


export interface PluginPublisherProps extends React.PropsWithChildren {

}
export const PluginPublisher: React.FC<PluginPublisherProps> = (props) => {

    useEffect(() => {
        console.log('PluginPublisher');
        
    }, [])
    return <Dialog>
        <DialogTrigger asChild>{props.children}</DialogTrigger>
        <DialogContent className="">
            <DialogHeader>
                <DialogTitle>发布你的插件</DialogTitle>
            </DialogHeader>
            <div className="">
            </div>
        </DialogContent>
    </Dialog>
}