import { mergeAttributes, PMNode as Node } from "@kn/editor";
import { ReactNodeViewRenderer } from "@kn/editor";
import { AiImageView } from "./AiImageView";

/**
 * AI Image Generation Node Extension
 * Provides a block-level node for AI-generated images
 * 
 * Features:
 * - Text-to-image generation
 * - Custom prompt input
 * - Image preview
 * - URL storage
 */




export const AiImage = Node.create({
    name: 'aiImage',
    group: 'block',

    addAttributes() {
        return {
            prompt: {
                default: null
            },
            url: {
                default: null
            }
        }
    },
    addNodeView() {
        return ReactNodeViewRenderer(AiImageView)
    },
    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { class: 'node-ai-image' })]
    },
    addCommands() {
        return {
            insertAiImage: () => ({ commands }) => {
                return commands.insertContent({
                    type: this.name
                })
            }
        }
    }
})