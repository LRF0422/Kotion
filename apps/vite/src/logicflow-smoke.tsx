import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "@kn/ui/globals.css";
import "../../../packages/plugin-logicflow/src/style/index.css";
import { createDefaultLogicFlowDocument } from "../../../packages/plugin-logicflow/src/model/data";
import type { Page } from "../../../packages/plugin-logicflow/src/model/types";
import { LogicFlowWorkspace } from "../../../packages/plugin-logicflow/src/workspace/LogicFlowWorkspace";

function Smoke() {
  const base = createDefaultLogicFlowDocument();
  base.title = "Architecture Diagram";
  base.pages[0] = {
    ...base.pages[0],
    graph: {
      nodes: [
        { id: "a", type: "cloud", x: 180, y: 180, text: "Cloud", properties: { width: 150, height: 90 } },
        { id: "b", type: "rich-card", x: 500, y: 240, properties: { width: 260, height: 170, richContent: { title: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Service" }] }] }, body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Collaborative rich card" }] }] } } } },
      ],
      edges: [{ id: "ab", type: "polyline", sourceNodeId: "a", targetNodeId: "b" }],
    },
    layers: [{ id: "layer-1", name: "Layer-1", visible: true, locked: false, elementIds: ["a", "b", "ab"] }],
  };
  const [document, setDocument] = useState(base);
  const [activePageId, setActivePageId] = useState("page-1");
  const activePage = document.pages.find((page) => page.id === activePageId)!;
  const updatePage = (page: Page) => setDocument((current) => ({ ...current, pages: current.pages.map((item) => item.id === page.id ? page : item) }));
  return <LogicFlowWorkspace document={document} activePage={activePage} activePageId={activePageId} readOnly={false} dark status="synced" presences={[{ clientId: 2, pageId: activePageId, user: { name: "Collaborator", color: "#f97316" }, cursor: { x: 420, y: 120 }, selectedIds: ["b"] }]} allCollaborators={[]} canUndo canRedo={false} dirtyPageIds={[]} lastSavedAt={Date.now()} saveError={null} onDocumentChange={setDocument} onPageChange={updatePage} onReplaceDocument={setDocument} onActivePageChange={setActivePageId} onUndo={() => undefined} onRedo={() => undefined} onRetrySave={() => undefined} onFlush={() => undefined} onPointerMove={() => undefined} onSelectionChange={() => undefined} onToggleFullscreen={() => undefined} />;
}

window.addEventListener("error", (event) => { document.body.dataset.error = event.message; });
createRoot(document.getElementById("root")!).render(<Smoke />);
