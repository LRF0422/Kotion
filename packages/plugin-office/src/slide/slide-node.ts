import React from "react"
import { PMNode as Node, mergeAttributes, NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer, withNodeViewErrorBoundary } from "@kn/editor"
import { DEFAULT_SLIDE_HEIGHT } from "./constants"

const LazySlideView = React.lazy(async () => {
    const module = await import("./SlideView")
    return { default: module.SlideView }
})

const SlideNodeView: React.FC<NodeViewProps> = (props) => React.createElement(
    React.Suspense,
    {
        fallback: React.createElement(NodeViewWrapper, {
            className: "relative my-2 rounded-md border bg-muted/20",
            style: { height: props.node.attrs.height ?? DEFAULT_SLIDE_HEIGHT },
        }),
    },
    React.createElement(LazySlideView, props),
)

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
        return ReactNodeViewRenderer(withNodeViewErrorBoundary(SlideNodeView), {
            stopEvent: () => true,
        })
    },
})