import { Background, ControlButton, Controls, MiniMap, Panel, ReactFlow, addEdge, applyEdgeChanges, applyNodeChanges, useEdgesState, useNodesState, useReactFlow } from "@xyflow/react";
import React, { useCallback, useRef } from "react";
import { Circle, CircleShape } from "./nodes/circle";
import { useFullscreen } from "ahooks";
import { NodeViewProps } from "@tiptap/core";
import { useDnD } from "./DndContext";
import { Fullscreen } from "@repo/icon";
import Sider from "./Sider";
import { v4 as uuidv4 } from "uuid";
import { Triangle, TriangleShape } from "./nodes/triangle";

const types = {
    circle: Circle,
    triangle: Triangle
}

let id = 0;
const getId = () => `dndnode_${uuidv4()}`;

export const FlowViewCore: React.FC<NodeViewProps> = (props) => {
    const ref = useRef<any>()
    const [fullScreen, { toggleFullscreen }] = useFullscreen(ref)

    const [nodes, setNodes, onNodesChange] = useNodesState(props.node.attrs.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(props.node.attrs.edges);
    const { screenToFlowPosition } = useReactFlow();
    const [type] = useDnD();

    const updateNode = (id: string, noteDate: any) => {
        setNodes(allNodes => allNodes.map((node) => {
            if (node.id === id) {
                return {
                    ...node,
                    data: {
                        ...node.data
                    }
                }
            }
            return node;
        }))
    }

    const onConnect = useCallback(
        (params: any) => setEdges((eds) => {
            const e = addEdge(params, eds)
            props.updateAttributes({
                ...props.node.attrs,
                edges: e
            })
            return e
        }),
        [],
    );

    const onDragOver = useCallback((event: any) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: any) => {
            event.preventDefault();

            // check if the dropped element is valid
            if (!type) {
                return;
            }

            // project was renamed to screenToFlowPosition
            // and you don't need to subtract the reactFlowBounds.left/top anymore
            // details: https://reactflow.dev/whats-new/2023-11-10
            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });
            const newNode = {
                id: getId(),
                type,
                position,
                data: { label: `${type} node` },
            };
            // @ts-ignore
            setNodes((nds) => nds.concat(newNode));
        },
        [screenToFlowPosition, type],
    );

    return <ReactFlow
        ref={ref}
        edges={edges}
        nodes={nodes}
        onNodesChange={(changes) => {
            props.updateAttributes({
                ...props.node.attrs,
                nodes: applyNodeChanges(changes, nodes)
            })
            onNodesChange(changes)
        }}
        onEdgesChange={(changes) => {
            props.updateAttributes({
                ...props.node.attrs,
                edges: applyEdgeChanges(changes, edges)
            })
            onEdgesChange(changes)
        }}
        onConnect={onConnect}
        nodeTypes={types}
        onDragOver={onDragOver}
        onDrop={onDrop}
    // fitView
    >
        <Background />
        <Controls >
            <ControlButton onClick={toggleFullscreen}>
                <Fullscreen className="h-4 w-4" />
            </ControlButton>
        </Controls>
        <MiniMap />
        {
            props.editor.isEditable && <Panel position="top-right" >
                <div className="  h-[300px] w-[200px] bg-muted rounded-sm ">
                    <Sider shapes={[CircleShape, TriangleShape]} updateNode={updateNode} />
                </div>
            </Panel>
        }
    </ReactFlow>
}