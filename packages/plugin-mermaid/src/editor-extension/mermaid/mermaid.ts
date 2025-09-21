import { PMNode as Node, ReactNodeViewRenderer } from "@kn/editor";
import { MermaidView } from "./MermaidView";


declare module '@kn/editor' {
    interface Commands<ReturnType> {
        mermaid: {
            insertMermaid: () => ReturnType;
        };
    }
}

export const Mermaid = Node.create({
    name: "mermaid",
    group: "block",
    renderHTML() {
        return ["div", { class: "node-mermaid" }, 0];
    },

    addNodeView() {
        return ReactNodeViewRenderer(MermaidView, {
            stopEvent: () => true
        })
    },

    addAttributes() {
        return {
            data: {
                default: null
            }
        }
    },

    addCommands() {
        return {
            insertMermaid: () => ({ commands }) => {
                return commands.insertContent({
                    type: this.name
                })
            }
        }
    }
})