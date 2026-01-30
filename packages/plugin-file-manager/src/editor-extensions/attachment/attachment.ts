import { PMNode as Node, ReactNodeViewRenderer, mergeAttributes, CommandProps, RawCommands } from "@kn/editor";
import { AttachmentView } from "./AttachmentView";

declare module "@kn/editor" {
    interface Commands<ReturnType> {
        attachment: {
            insertBlockAttachment: (options: {
                id: string;
                name: string;
                path: string;
                size?: number;
                fileType?: string;
            }) => ReturnType;
            insertInlineAttachment: (options: {
                id: string;
                name: string;
                path: string;
                size?: number;
                fileType?: string;
            }) => ReturnType;
        };
    }
}

export const Attachment = Node.create({
    name: "attachment",
    group: "block",
    inline: false,
    atom: true,
    draggable: true,

    addOptions() {
        return {
            inline: false,
            HTMLAttributes: {}
        };
    },

    addAttributes() {
        return {
            id: {
                default: null
            },
            name: {
                default: null
            },
            path: {
                default: null
            },
            size: {
                default: 0
            },
            fileType: {
                default: null
            }
        }
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="attachment"]'
            }
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { class: 'node-attachment', 'data-type': 'attachment' })]
    },

    addNodeView() {
        return ReactNodeViewRenderer(AttachmentView, {
            stopEvent: () => true
        })
    },

    addCommands() {
        return {
            insertBlockAttachment: (options: {
                id: string;
                name: string;
                path: string;
                size?: number;
                fileType?: string;
            }) => ({ commands }: CommandProps) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: {
                        id: options.id,
                        name: options.name,
                        path: options.path,
                        size: options.size || 0,
                        fileType: options.fileType || 'file'
                    }
                })
            }
        } as Partial<RawCommands>
    }
});

export const AttachmentInline = Node.create({
    name: "attachmentInline",
    group: "inline",
    inline: true,
    atom: true,
    draggable: true,

    addOptions() {
        return {
            inline: true,
            HTMLAttributes: {}
        };
    },

    addAttributes() {
        return {
            id: {
                default: null
            },
            name: {
                default: null
            },
            path: {
                default: null
            },
            size: {
                default: 0
            },
            fileType: {
                default: null
            }
        }
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-type="attachment-inline"]'
            }
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { class: 'node-attachment-inline', 'data-type': 'attachment-inline' })]
    },

    addNodeView() {
        return ReactNodeViewRenderer(AttachmentView, {
            stopEvent: () => true
        })
    },

    addCommands() {
        return {
            insertInlineAttachment: (options: {
                id: string;
                name: string;
                path: string;
                size?: number;
                fileType?: string;
            }) => ({ commands }: CommandProps) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: {
                        id: options.id,
                        name: options.name,
                        path: options.path,
                        size: options.size || 0,
                        fileType: options.fileType || 'file'
                    }
                })
            }
        } as Partial<RawCommands>
    }
});