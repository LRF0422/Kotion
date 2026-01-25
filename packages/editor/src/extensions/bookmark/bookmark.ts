import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { BookmarkView } from "./bookmark-view";

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        bookmark: {
            insertBookmark: (options?: {
                url?: string;
                title?: string;
                description?: string;
                favicon?: string;
                image?: string;
            }) => ReturnType;
        };
    }
}

export const Bookmark = Node.create({
    name: 'bookmark',
    group: 'block',
    draggable: true,

    addOptions() {
        return {
            HTMLAttributes: {},
        }
    },

    addAttributes() {
        return {
            url: {
                default: '',
                parseHTML: element => element.getAttribute('data-url'),
                renderHTML: attributes => {
                    if (!attributes.url) {
                        return {}
                    }
                    return {
                        'data-url': attributes.url,
                    }
                },
            },
            title: {
                default: '',
                parseHTML: element => element.getAttribute('data-title'),
                renderHTML: attributes => {
                    if (!attributes.title) {
                        return {}
                    }
                    return {
                        'data-title': attributes.title,
                    }
                },
            },
            description: {
                default: '',
                parseHTML: element => element.getAttribute('data-description'),
                renderHTML: attributes => {
                    if (!attributes.description) {
                        return {}
                    }
                    return {
                        'data-description': attributes.description,
                    }
                },
            },
            favicon: {
                default: '',
                parseHTML: element => element.getAttribute('data-favicon'),
                renderHTML: attributes => {
                    if (!attributes.favicon) {
                        return {}
                    }
                    return {
                        'data-favicon': attributes.favicon,
                    }
                },
            },
            image: {
                default: '',
                parseHTML: element => element.getAttribute('data-image'),
                renderHTML: attributes => {
                    if (!attributes.image) {
                        return {}
                    }
                    return {
                        'data-image': attributes.image,
                    }
                },
            },
        }
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="bookmark"]',
            },
        ]
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-type': 'bookmark' }), 0]
    },

    addNodeView() {
        return ReactNodeViewRenderer(BookmarkView)
    },

    addKeyboardShortcuts() {
        return {
            'Mod-Shift-k': () => this.editor.commands.insertBookmark(),
        }
    },

    addCommands() {
        return {
            insertBookmark: (options) => ({ chain }) => {
                return chain()
                    .focus()
                    .insertContent({
                        type: this.name,
                        attrs: options,
                    })
                    .run()
            },
        }
    },
})
