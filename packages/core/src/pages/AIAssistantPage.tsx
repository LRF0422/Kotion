/**
 * AI Assistant Page
 *
 * A standalone page for the editor AI assistant. It hosts the AgentCore
 * AIAssistantPanel (the same floating panel used inline in the workspace)
 * centered on a full-page surface.
 */

import React, { useState } from 'react'
import { AIAssistantPanel } from '../ai/system-agent/AIAssistantPanel'

export const AIAssistantPage: React.FC = () => {
    const [open, setOpen] = useState(true)

    return (
        <div className="flex h-full w-full items-center justify-center bg-background">
            <AIAssistantPanel
                open={open}
                onOpenChange={setOpen}
                position="center"
                width={720}
                height={640}
            />
            {!open && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="rounded-lg border border-border/60 bg-muted/40 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    打开 AI Assistant
                </button>
            )}
        </div>
    )
}

export default AIAssistantPage
