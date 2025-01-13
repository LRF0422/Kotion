import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { AiImageView } from "./AiImageView";




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
    renderHTML({HTMLAttributes}) {
        return ['div', mergeAttributes(HTMLAttributes, {class: 'node-ai-image'})]
    },
    addCommands() {
        return  {
            insertAiImage: () => ({commands}) => {
                return commands.insertContent({
                    type: this.name
                })
            }
        }
    }
})