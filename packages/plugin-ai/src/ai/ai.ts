import { mergeAttributes, PMNode as Node } from "@kn/editor";
import { ReactNodeViewRenderer } from "@kn/editor";
import { AiView } from "./AiView";

declare module "@kn/editor" {
    interface Commands<ReturnType> {
        ai: {
            insertAIBlock: () => ReturnType;
            insertAiImage: () => ReturnType;
        };
    }
}



export const Ai = Node.create({
    name: 'ai',
    group: 'block',
    content: 'block+',
    addAttributes() {
        return {
            prompt: {
                default: null
            },
            generateDate: {
                default: null,
            }
        }
    },
    addStorage() {
        return {
            underEditorSelection: null
        }
    },
    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { class: 'node-ai' }), 0]
    },
    addNodeView() {
        return ReactNodeViewRenderer(AiView)
    },
    addCommands() {
        return {
            insertAIBlock: () => ({ chain }) => {
                return chain().insertContent({
                    type: this.name,
                    content: [
                        {
                            type: 'paragraph'
                        }
                    ]
                }).scrollIntoView().run()
            }
        }
    }
})