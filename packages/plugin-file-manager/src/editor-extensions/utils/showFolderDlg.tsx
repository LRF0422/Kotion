import { Editor, ReactRenderer } from "@kn/editor";
import { FolderDlg } from "../component/FolderDlg";


export const showFolderDlg = (editor: Editor) => {

    const component = new ReactRenderer(FolderDlg, {
        editor: editor,
        props: {
            open: true,
            selectable: true,
            onCancel: () => {
                component.updateProps({ open: false })
                component.destroy()
                // editor.view.dom.removeChild(component.element)
            }
        }
    })
    component.render()
    // editor.view.dom.appendChild(component.element)

}