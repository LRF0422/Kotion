import { Handle, NodeProps, NodeResizer, Position, useNodeId, useReactFlow } from "@xyflow/react";
import { useKeyPress } from "ahooks";
import { RectangleHorizontal, TriangleIcon } from "@kn/icon";
import React, { useRef } from "react";

export const Triangle_: React.FC<NodeProps> = (props) => {

    const { setNodes } = useReactFlow()
    const ref = useRef<any>()
    const id = useNodeId()

    useKeyPress('Delete', (e) => {
        console.log('current', ref.current);
        console.log('target', e.target)
        if (e.target === ref.current) {
            setNodes(nodes => nodes.filter(it => it.id !== id))
        }
    })

    return <>
        <NodeResizer
            color="#ff0071"
            isVisible={props.selected}
            minHeight={40}
            minWidth={67}
        />
        <div className="flex justify-center items-center w-full h-full">
            <RectangleHorizontal className="min-h-[40px] min-w-[67px] w-full h-full" fill="white" strokeWidth={0.1} />
            {/* <input className="absolute m-auto w-[30px] bg-transparent" /> */}
        </div>
        <Handle
            isConnectableEnd
            isConnectableStart
            className=" top-[6px]"
            position={Position.Top}
            isConnectable={props.isConnectable}
            type='target'
        />
        <Handle
            isConnectableEnd
            isConnectableStart
            className=" bottom-[6px]"
            position={Position.Bottom}
            isConnectable={props.isConnectable}
            type='target'
        />
        <Handle
            isConnectableEnd
            isConnectableStart
            className=" right-[6px]"
            position={Position.Right}
            isConnectable={props.isConnectable}
            type='target'
        />
        <Handle
            className=" left-[6px]"
            position={Position.Left}
            isConnectableEnd
            isConnectableStart
            isConnectable={props.isConnectable}
            type='target'
        />
        <Handle
            className=" left-[6px]"
            position={Position.Left}
            isConnectableEnd
            isConnectableStart
            isConnectable={props.isConnectable}
            type='source'
        />

    </>
}
export const Triangle = React.memo(Triangle_)

export const TriangleShape: React.FC = (props) => {
    return <div
        {...props}
        className="flex justify-center items-center h-[60px] w-[60px]">
        <TriangleIcon className="h-full w-full" fill="white" strokeWidth={0.5} />
    </div>
}

TriangleShape.displayName = "triangle"