import { Editor, ReactRenderer } from "@kn/editor";
import { FolderDlg } from "../component/FolderDlg";


export const showFolderDlg = (editor: Editor, onConfirm?: (files: any[]) => void) => {

    const component = new ReactRenderer(FolderDlg, {
        editor: editor,
        props: {
            open: true,
            selectable: true,
            target: 'file',
            onCancel: () => {
                component.updateProps({ open: false })
                component.destroy()
            },
            onConfirm: (files: any[]) => {
                onConfirm?.(files)
                component.updateProps({ open: false })
                setTimeout(() => component.destroy(), 500)
            }
        }
    })
    component.render()

}