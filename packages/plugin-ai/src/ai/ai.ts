import { mergeAttributes, PMNode as Node } from "@kn/editor";
import { ReactNodeViewRenderer } from "@kn/editor";
import { AiView } from "./AiView";

/**
 * Extend editor commands with AI-specific commands
 */

declare module "@kn/editor" {
    interface Commands<ReturnType> {
        ai: {
            insertAIBlock: () => ReturnType;
            insertAiImage: () => ReturnType;
        };
    }
}



/**
 * AI Block Node Extension
 * Provides a block-level node for AI-generated text content
 * 
 * Features:
 * - Custom prompt input
 * - Real-time text generation
 * - Generation timestamp tracking
 * - Visual feedback during generation
 */
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