import type { NodeViewProps } from "@kn/editor";
import { NodeViewWrapper } from "@kn/editor";
import { Loader2 } from "@kn/icon";
import React, { Suspense, lazy } from "react";

const LogicFlowEditor = lazy(() =>
  import("../workspace/LogicFlowEditor").then((module) => ({
    default: module.LogicFlowEditor,
  })),
);

function LogicFlowViewComponent(props: NodeViewProps) {
  return (
    <NodeViewWrapper className="w-full" contentEditable={false}>
      <Suspense
        fallback={
          <div className="flex h-72 items-center justify-center rounded-lg border bg-card text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading LogicFlow…
          </div>
        }
      >
        <LogicFlowEditor {...props} />
      </Suspense>
    </NodeViewWrapper>
  );
}

export const LogicFlowView = React.memo(
  LogicFlowViewComponent,
  (previous, next) =>
    previous.editor === next.editor && previous.node.eq(next.node),
);

LogicFlowView.displayName = "LogicFlowView";
