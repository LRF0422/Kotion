import { Handle, NodeResizer, Position } from "@xyflow/react";
import React from "react";

export const Circle = React.memo((props: any) => {

    return <>
        <NodeResizer
            color="#ff0071"
            isVisible={props.selected}
        />
        <div
            className={`h-full w-full min-h-[60px] min-w-[60px] border rounded-full bg-white flex justify-center items-center`}>
            <input className="w-[60px] border-none text-center text-sm overflow-hidden text-ellipsis" defaultValue={props.data.label} onChange={(e) => {
                const data = props.data
                data.label = e.target.value
                props.updateNode && props.updateNode(props.id, data)
            }} />
        </div>
        <Handle
            position={Position.Top}
            isConnectable={props.isConnectable}
            type='target'
        />
        <Handle
            position={Position.Bottom}
            isConnectable={props.isConnectable}
            type='target'
        />
        <Handle
            position={Position.Left}
            isConnectable={props.isConnectable}
            type='target'
        />
        <Handle
            position={Position.Right}
            isConnectable={props.isConnectable}
            type='target'
        />
        <Handle
            position={Position.Right}
            isConnectable={props.isConnectable}
            type='source'
        />
        <Handle
            position={Position.Left}
            isConnectable={props.isConnectable}
            type='source'
        />
        <Handle
            position={Position.Bottom}
            isConnectable={props.isConnectable}
            type='source'
        />
        <Handle
            position={Position.Top}
            isConnectable={props.isConnectable}
            type='source'
        />
    </>
})

export const CircleShape: React.FC = (prpos) => {
    return <div
        {...prpos}
        className="w-[60px] h-[60px] rounded-full border flex justify-center items-center bg-white">
        Circle
    </div>
}

CircleShape.displayName = "circle"