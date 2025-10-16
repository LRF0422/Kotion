import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@kn/ui";
import React, { useState } from "react";
import { ReactNode } from "react";
import ReactDOM, { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";


export const createReactElement = (element: ReactNode) => {

    console.log('create');
    const div = document.createElement('div')
    document.body.appendChild(div)
    return ReactDOM.createPortal(element, div)
}

export const showDlg = (title: string, desc: string, onOk: () => void, onCancel: () => void) => {

    const container = document.getElementById("ref")
    const root = createRoot(container)
    const cancel = () => {
        onCancel()
        setTimeout(() => {
            root.unmount()
        }, 500);
    }
    const ok = () => {
        onOk()
        setTimeout(() => {
            root.unmount()
        }, 500);
    }
    root.render((
        createPortal(<AuthDlg title={title} desc={desc} onOk={ok} onCancel={cancel} />, container)
    ))
}

export const AuthDlg: React.FC<{ title: string, desc: string, onOk: () => void, onCancel: () => void }> = (props) => {

    const { title, desc, onOk, onCancel } = props
    const [open, setOpen] = useState(true)
    return <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger />
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>{title}</AlertDialogTitle>
                <AlertDialogDescription>{desc}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogAction onClick={onOk}>Confirm</AlertDialogAction>
                <AlertDialogCancel onClick={() => {
                    onCancel()
                }}>Cancel</AlertDialogCancel>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>

}