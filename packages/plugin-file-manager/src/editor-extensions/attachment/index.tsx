import React from "react";
import { ExtensionWrapper } from "@kn/common";
import { Attachment, AttachmentInline } from "./attachment";
import { FileIcon, FileTextIcon } from "@kn/icon";
import { Editor, ReactRenderer } from "@kn/editor";
import { FolderDlg } from "../component/FolderDlg";
import { FileItem } from "../component/FileContext";

// Helper function to show file manager dialog for attachments
const showAttachmentDlg = (editor: Editor, onConfirm?: (files: FileItem[]) => void) => {
    const component = new ReactRenderer(FolderDlg, {
        editor: editor,
        props: {
            open: true,
            selectable: true,
            target: 'file',
            onCancel: () => {
                component.updateProps({ open: false });
                component.destroy();
            },
            onConfirm: (files: FileItem[]) => {
                onConfirm?.(files);
                component.updateProps({ open: false });
                component.destroy();
            }
        }
    });
    component.render();
};

export const AttachmentExtension: ExtensionWrapper = {
    name: "attachment",
    extendsion: [Attachment, AttachmentInline],
    slashConfig: [
        {
            text: 'Attachment (Block)',
            slash: '/attachment',
            icon: <FileIcon className="h-4 w-4" />,
            action: (editor) => {
                showAttachmentDlg(editor, (files) => {
                    if (files && files.length > 0) {
                        const file = files[0];
                        editor.commands.insertBlockAttachment({
                            id: file.id,
                            name: file.name,
                            path: file.path || file.id,
                            size: file.size || 0,
                            fileType: file.type?.value || 'file'
                        });
                    }
                });
            }
        },
        {
            text: 'Attachment (Inline)',
            slash: '/attachment-inline',
            icon: <FileTextIcon className="h-4 w-4" />,
            action: (editor) => {
                showAttachmentDlg(editor, (files) => {
                    if (files && files.length > 0) {
                        files.forEach((file) => {
                            editor.commands.insertInlineAttachment({
                                id: file.id,
                                name: file.name,
                                path: file.path || file.id,
                                size: file.size || 0,
                                fileType: file.type?.value || 'file'
                            });
                            // Add a space after the inline attachment
                            editor.commands.insertContent(' ');
                        });
                    }
                });
            }
        }
    ]
};
