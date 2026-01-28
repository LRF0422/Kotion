import { Editor, ReactRenderer } from "@kn/editor";
import { FolderDlg } from "../component/FolderDlg";
import { FileSelectorOptions, SelectedFile } from "@kn/common";
import { FileItem } from "../component/FileContext";

/**
 * Show file selector dialog using ReactRenderer for proper context injection
 * Similar to showFolderDlg but returns a Promise with selected files
 */
export const showFileSelector = (
    editor: Editor,
    options?: FileSelectorOptions
): Promise<SelectedFile[] | null> => {
    const { multiple = false, target = 'file', title } = options || {};

    return new Promise((resolve) => {
        const component = new ReactRenderer(FolderDlg, {
            editor: editor,
            props: {
                open: true,
                selectable: true,
                multiple: multiple,
                target: target,
                onCancel: () => {
                    component.updateProps({ open: false });
                    component.destroy();
                    resolve(null);
                },
                onConfirm: (files: FileItem[]) => {
                    const selectedFiles: SelectedFile[] = files.map(file => ({
                        id: file.id,
                        name: file.name,
                        path: file.path,
                        isFolder: file.isFolder,
                    }));
                    component.updateProps({ open: false });
                    setTimeout(() => component.destroy(), 500);
                    resolve(selectedFiles);
                }
            }
        });
        component.render();
    });
};
