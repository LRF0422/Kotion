import React from "react";
import { cn } from "@repo/ui";
import { Handle, NodeProps, Position } from "@xyflow/react";

export const NodeWrapper = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { selected?: boolean }
>(({ className, selected, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-md border bg-card p-5 text-card-foreground",
      className,
      selected ? "border-muted-foreground shadow-lg" : "",
      "hover:ring-1",
    )}
    {...props}
  />
));

export const BaseNode: React.FC<NodeProps> = (props) => {
  return <NodeWrapper>
    <>
      {props.data.label}
      <Handle type="source" position={Position.Right} />
      <Handle type="target" position={Position.Left} />
    </>
  </NodeWrapper>
}