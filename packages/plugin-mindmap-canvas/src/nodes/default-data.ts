export interface MindmapNodeData {
    id: string;
    label: string;
    x: number;
    y: number;
    parentId: string | null;
    side: "left" | "right" | "center";
}

export interface MindmapDataPayload {
    nodes: MindmapNodeData[];
}

export const createDefaultMindmap = (): MindmapDataPayload => ({
    nodes: [
        {
            id: "root",
            label: "中心主题",
            x: 360,
            y: 180,
            parentId: null,
            side: "center",
        },
        {
            id: "idea-1",
            label: "想法 1",
            x: 180,
            y: 120,
            parentId: "root",
            side: "left",
        },
        {
            id: "idea-2",
            label: "想法 2",
            x: 540,
            y: 120,
            parentId: "root",
            side: "right",
        },
    ],
});
