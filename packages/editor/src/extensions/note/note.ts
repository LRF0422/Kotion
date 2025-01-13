import { Mark, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        note: {
            setNote: () => ReturnType
            unSetNote: () => ReturnType
            toggleNote: () => ReturnType
        };
    }
}


export const NoteMark = Mark.create({
    name: 'nodeMark',
    addAttributes() {
        return {
            style: {
                renderHTML(attributes) {
                    return {
                        ...attributes,
                        style: 'text-decoration: underline dotted;cursor: pointer'
                    }
                },
            }
        }
    },
    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { class: 'node-note' })]
    },

    addCommands() {
        return {
            setNode: () => ({ commands }) => {
                return commands.setMark(this.name)
            },
            unSetNote: () => ({ commands }) => {
                return commands.unsetMark(this.name)
            },
            toggleNote: () => ({ commands }) => {
                return commands.toggleMark(this.name)
            }
        }
    }
})