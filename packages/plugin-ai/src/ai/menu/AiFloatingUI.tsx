import React from "react";
import { Editor } from "@kn/editor";
import { ExpandableChatDemo } from "./Chat";
import { AiToolsPanel } from "./AiToolsPanel";

/**
 * Aggregates the AI plugin's always-mounted floating UIs into the single
 * `floatingUI` slot the ExtensionWrapper exposes:
 *  - the chat widget
 *  - the AI Tools preview panel (driven by bubble-menu events)
 */
export const AiFloatingUI: React.FC<{ editor: Editor }> = ({ editor }) => {
    return (
        <>
            <ExpandableChatDemo editor={editor} />
            <AiToolsPanel editor={editor} />
        </>
    );
};
