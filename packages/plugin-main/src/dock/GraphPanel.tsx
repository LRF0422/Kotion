import React from "react"
import { DockPanelProps } from "@kn/common"
import { SpaceGraph } from "../pages/SpaceGraph"

/**
 * Relation graph as a dock panel. `SpaceGraph` sizes itself to its container,
 * so the narrow dock column works without any graph-side change; the props just
 * override what it would otherwise read from the route.
 */
export const GraphPanel: React.FC<DockPanelProps> = ({ spaceId, pageId }) => (
    <div className="h-full w-full">
        <SpaceGraph focusId={pageId ?? null} currentSpaceId={spaceId} />
    </div>
)
