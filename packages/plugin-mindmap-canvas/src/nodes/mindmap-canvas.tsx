import { PMNode as Node, ReactNodeViewRenderer } from "@kn/editor";
import { mergeAttributes } from "@tiptap/core";
import { MindmapCanvasView } from "../views/MindmapCanvasView";
import { createDefaultMindmap } from "./default-data";

declare module "@kn/editor" {
    interface Commands<ReturnType> {
        mindmapCanvas: {
            insertMindmapCanvas: () => ReturnType;
        };
    }
}

export const MindmapCanvasNode = Node.create({
    name: "mindmap-canvas",
    group: "block",
    atom: true,
    defining: true,

    addAttributes() {
        return {
            data: {
                default: createDefaultMindmap(),
            },
        };
    },

    renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
        return ["div", mergeAttributes(HTMLAttributes, { class: "node-mindmap-canvas" })];
    },

    addNodeView() {
        return ReactNodeViewRenderer(MindmapCanvasView, {
            stopEvent: () => true,
        });
    },

    addCommands() {
        return {
            insertMindmapCanvas:
                () =>
                    ({ commands }: { commands: { insertContent: (data: unknown) => boolean } }) =>
                        commands.insertContent({
                            type: this.name,
                            attrs: {
                                data: createDefaultMindmap(),
                            },
                        }),
        };
    },
});
