import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { FlowView } from "./FlowView";

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        flow: {
            insertFlow: () => ReturnType;
        };
    }
}

export const Flow = Node.create({
    name: 'flow',
    group: 'block',
    addAttributes() {
        return {
            nodes: {
                default:  [
                    {
                        id: 'provider-1',
                        type: 'input',
                        data: { label: 'Node 1' },
                        position: { x: 250, y: 5 },
                    },
                    { id: 'provider-2', data: { label: 'Node 2' }, position: { x: 100, y: 100 } },
                    { id: 'provider-3', data: { label: 'Node 3' }, position: { x: 400, y: 100 } },
                    { id: 'provider-4', data: { label: 'Node 4' }, position: { x: 400, y: 200 } },
                    {
                        id: '123123', data: {
                            label: '123123'
                        },
                        position: { x: 600, y: 200 },
                        type: 'circle'
                    }
                ]
                   
            },
            edges: {
                default: [
                    {
                        id: 'provider-e1-2',
                        source: 'provider-1',
                        target: 'provider-2',
                        animated: true,
                    },
                    { id: 'provider-e1-3', source: 'provider-1', target: 'provider-3' },
                ]
            }
        }
},
    renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'node-flow' })]
},
    addNodeView() {
    return ReactNodeViewRenderer(FlowView, {
        stopEvent: () => true
    })
},
    addCommands() {
    return {
        insertFlow: () => ({ commands }) => {
            return commands.insertContent({
                type: this.name
            })
        }
    }
}
})