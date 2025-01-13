import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { PageContentView } from "./PageContentView";

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        pageContent: {
            insertPageContent: () => ReturnType;
        };
    }
}


export const PageContent = Node.create({
    name: 'pageContent',
    group: 'block',

    renderHTML({HTMLAttributes}) {
        return ['div', mergeAttributes(HTMLAttributes, { class: 'node-paghe-content'})]
    },

    addCommands() {
        return {
            insertPageContent: () => ({commands}) => {
                return commands.insertContent({
                    type: this.name
                })
            }
        }
    },

    addNodeView() {
        return ReactNodeViewRenderer(PageContentView)
    }
})