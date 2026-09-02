import {
    CommandProps,
    PMNode as Node,
    RawCommands,
    ReactNodeViewRenderer,
    mergeAttributes,
} from "@kn/editor";
import { FolderInlineView } from "./FolderInlineView";

export interface FolderInlineAttributes {
    folderId: string | null;
    folderName: string | null;
}

export const FolderInline = Node.create({
    name: "folderInline",
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,

    addOptions() {
        return {
            HTMLAttributes: {},
        };
    },

    addAttributes() {
        return {
            folderId: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-folder-id'),
            },
            folderName: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-folder-name'),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-type="folder-inline"]' }];
    },

    renderHTML({ node, HTMLAttributes }) {
        const folderName = node.attrs.folderName || '';
        return [
            'span',
            mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
                'data-type': 'folder-inline',
                'data-folder-id': node.attrs.folderId,
                'data-folder-name': folderName,
                class: 'node-folder-inline',
            }),
            folderName,
        ];
    },

    renderText({ node }) {
        return node.attrs.folderName || '';
    },

    addNodeView() {
        return ReactNodeViewRenderer(FolderInlineView);
    },

    addCommands() {
        return {
            insertInlineFolder:
                ({ folderId, folderName }: { folderId: string; folderName: string }) =>
                    ({ chain }: CommandProps) => chain()
                        .focus()
                        .insertContent([
                            {
                                type: this.name,
                                attrs: {
                                    folderId: String(folderId),
                                    folderName,
                                },
                            },
                            { type: 'text', text: ' ' },
                        ])
                        .run(),
        } as Partial<RawCommands>;
    },
});
