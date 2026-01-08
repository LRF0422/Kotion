import { ExtensionWrapper } from "@kn/common";
import { MindmapCanvasNode } from "./nodes/mindmap-canvas";
import React from "react";

export const MindmapCanvasExtension: ExtensionWrapper = {
    name: "mindmap-canvas",
    extendsion: [MindmapCanvasNode],
    slashConfig: [
        {
            text: "Mindmap (Canvas)",
            slash: "/mindmap",
            action: (editor: any) => {
                editor.chain().focus().insertMindmapCanvas().run();
            },
        },
    ],
};
