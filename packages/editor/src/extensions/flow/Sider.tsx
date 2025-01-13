import React, { ElementType } from "react";
import { useDnD } from "./DndContext";

export default (prope: { shapes: React.FunctionComponent<any>[], updateNode: (id: string, nodeData: any) => void }) => {

    const [_, setType] = useDnD();

    const onDragStart = (event: any, nodeType?: string) => {

        console.log('dddd', nodeType);

        setType && setType(nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    return <div>
        <div className="grid p-1" draggable>
            {
                prope.shapes.map((Shape: React.FunctionComponent<any>, index) => (
                    <Shape
                        key={index}
                        updateNode={prope.updateNode}
                        draggable
                        onDragStart={(event: any) => onDragStart(event, Shape?.displayName)}
                    />
                ))
            }
        </div>
    </div>
}