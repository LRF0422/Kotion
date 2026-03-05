import { PMNode as Node, mergeAttributes } from "@kn/editor"
import { ReactNodeViewRenderer } from "@kn/editor"
import { SlideView } from "./SlideView"
import { DEFAULT_SLIDE_HEIGHT } from "./constants"

declare module "@kn/editor" {
    interface Commands<ReturnType> {
        slide: {
            insertSlide: (slideData?: Record<string, any> | null) => ReturnType
        }
    }
}

export const SlideNode = Node.create({
    name: 'slide',
    group: 'block',
    atom: true,

    addAttributes() {
        return {
            slideData: {
                default: null,
            },
            height: {
                default: DEFAULT_SLIDE_HEIGHT,
            },
        }
    },

    parseHTML() {
        return [{ tag: 'div[data-type="slide"]' }]
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'slide', class: 'node-slide' })]
    },

    addCommands() {
        return {
            insertSlide:
                (slideData?: Record<string, any> | null) =>
                ({ commands }) => {
                    return commands.insertContent({
                        type: this.name,
                        attrs: {
                            slideData: slideData ?? null,
                        },
                    })
                },
        }
    },

    addNodeView() {
        return ReactNodeViewRenderer(SlideView, {
            stopEvent: () => true,
        })
    },
})