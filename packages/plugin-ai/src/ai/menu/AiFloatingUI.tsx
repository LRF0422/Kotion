import React from "react";
import { Editor } from "@kn/editor";
import { AiToolsPanel } from "./AiToolsPanel";

/**
 * Aggregates the AI plugin's always-mounted floating UIs into the single
 * `floatingUI` slot the ExtensionWrapper exposes:
 *  - the AI Tools preview panel (driven by bubble-menu events)
 *
 * Chat is not here: it lives in the side dock (see ../../dock/ChatDockPanel),
 * so exactly one instance exists per workspace rather than one per editor tab.
 */
export const AiFloatingUI: React.FC<{ editor: Editor }> = ({ editor }) => {
    return <AiToolsPanel editor={editor} />;
};
