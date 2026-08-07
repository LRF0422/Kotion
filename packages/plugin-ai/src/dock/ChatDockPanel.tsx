import React from "react"
import { DockPanelConfig, DockPanelProps, useTranslation } from "@kn/common"
import { Editor } from "@kn/editor"
import { Sparkles } from "@kn/icon"
import { ExpandableChatDemo } from "../ai/menu/Chat"

/**
 * Chat hosted in the side dock.
 *
 * Every agent tool binds to the editor handed to `ExpandableChatDemo`, so the
 * chat only mounts once a document is open; without one there is nothing for
 * the agent to edit and the hook has no editor to bind.
 */
const ChatDockPanel: React.FC<DockPanelProps> = ({ editor, close }) => {
    const { t } = useTranslation()

    if (!editor) {
        return (
            <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
                {t("dock.agentNoEditor", "Open a page to chat with the agent")}
            </div>
        )
    }

    return <ExpandableChatDemo editor={editor as Editor} embedded onClose={close} />
}

/**
 * The agent panel keeps the `agent` id the host's entry points already target
 * (the sidebar item, Ctrl+Shift+A, the mobile tab bar), so swapping the
 * implementation behind it needs no change on the host side.
 */
export const chatDockPanel: DockPanelConfig = {
    id: "agent",
    title: "dock.agent",
    icon: <Sparkles className="h-4 w-4" />,
    order: 10,
    defaultWidth: 400,
    minWidth: 320,
    component: ChatDockPanel,
}
