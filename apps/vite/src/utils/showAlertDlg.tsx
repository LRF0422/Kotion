import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@repo/ui";
import { CircleAlert } from "@repo/icon";
import { ReactNode, useState } from "react";
import { createRoot } from "@repo/core";
import React from "react";


export interface AlertProps {
    title: ReactNode
    desc?: ReactNode
    content: ReactNode
    onOk?: () => void
    onCancel?: () => void
    canCancel?: boolean
    icon?: ReactNode
}

export const showAlertDlg = (props: AlertProps) => {

    const Dlg = (p: { onClose: () => void }) => {

        const [visible, setVisible] = useState(true)

        return <AlertDialog open={visible}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex flex-row items-center gap-2">{props.icon}{props.title}</AlertDialogTitle>
                    <AlertDialogDescription>{props.content}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogAction onClick={() => {
                        setVisible(false)
                        p.onClose && p.onClose()
                        props.onOk && props.onOk()
                    }}>
                        Continue
                    </AlertDialogAction>
                    {props.canCancel && <AlertDialogCancel onClick={() => props.onCancel && props.onCancel()}>Cancel</AlertDialogCancel>}
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    }
    const div = document.createElement('div')
    const root = createRoot(div)
    root.render(<Dlg onClose={() => {
        setTimeout(() => {
            root.unmount()
        }, 1000);
    }} />)
}

export const showWarningAlert = (props: AlertProps) => {
    props.icon = <CircleAlert />
    showAlertDlg(props)
}