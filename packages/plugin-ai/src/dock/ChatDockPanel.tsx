import React from "react"
import { DockPanelConfig, DockPanelProps, useTranslation } from "@kn/common"
import { Editor } from "@kn/editor"
import { ExpandableChatDemo } from "../ai/menu/Chat"

/**
 * Custom 4-point sparkle icon with a smaller companion star. Designed to look
 * clean at 16px and to pair with the dock-rail running animation (pulse +
 * emanating particles) without visual clutter.
 */
const AgentSparkleIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        {/* Main 4-point star with concave curves */}
        <path d="M8 1C8.5 4.5 9.5 5.5 13 6C9.5 6.5 8.5 7.5 8 11C7.5 7.5 6.5 6.5 3 6C6.5 5.5 7.5 4.5 8 1Z" />
        {/* Smaller companion sparkle */}
        <path d="M12 9C12.2 10.5 12.6 10.9 14.1 11C12.6 11.1 12.2 11.5 12 13C11.8 11.5 11.4 11.1 9.9 11C11.4 10.9 11.8 10.5 12 9Z" opacity="0.55" />
    </svg>
)

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
    icon: <AgentSparkleIcon className="h-4 w-4" />,
    order: 10,
    defaultWidth: 400,
    minWidth: 320,
    component: ChatDockPanel,
}
