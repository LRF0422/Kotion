import { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import React, { useCallback } from "react";
import { addEdge, Background, Controls, Node, NodeOrigin, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow } from "@xyflow/react";
import { BaseNode } from "./component/base-node";

const nodeTypes = {
    baseNode: BaseNode,
};

const defaultNodes = [
    {
        id: "0",
        position: { x: 0, y: 0 },
        type: "baseNode",
        data: {
            label: "Custom Node",
        },
    },
];

let id = 1;
const getId = () => `${id++}`;
const nodeOrigin: NodeOrigin = [0.5, 0];

export const _MindMapView: React.FC<NodeViewProps> = (props) => {

    const { node, updateAttributes, editor } = props

    const [nodes, setNodes, onNodesChange] = useNodesState<any>(defaultNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
    const { screenToFlowPosition } = useReactFlow();
    const onConnect = useCallback((params: any) => setEdges((eds) => addEdge(params, eds)),
        [],
    );

    const onConnectEnd = useCallback((event: any, connectionState: any) => {
        // when a connection is dropped on the pane it's not valid
        if (!connectionState.isValid) {
            // we need to remove the wrapper bounds, in order to get the correct position
            const id = getId();
            const { clientX, clientY } =
                'changedTouches' in event ? event.changedTouches[0] : event;
            const newNode: Node = {
                id,
                position: screenToFlowPosition({
                    x: clientX,
                    y: clientY,
                }),
                type: 'baseNode',
                data: { label: `Node ${id}` },
                origin: [0.5, 0.0],
            };

            setNodes((nds) => nds.concat(newNode));
            setEdges((eds) =>
                eds.concat({ id, source: connectionState.fromNode.id, target: id }),
            );
        }
    },
        [screenToFlowPosition],
    );


    return <ReactFlow
        nodeTypes={nodeTypes}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        fitView
        fitViewOptions={{ padding: 2 }}
        nodeOrigin={nodeOrigin}
    >
        <Background />
        <Controls />
    </ReactFlow>

}

export const MindMapView: React.FC<NodeViewProps> = (props) => {
    return <NodeViewWrapper className="h-[600px] w-full">
        <ReactFlowProvider>
            <_MindMapView {...props} />
        </ReactFlowProvider>
    </NodeViewWrapper>
}