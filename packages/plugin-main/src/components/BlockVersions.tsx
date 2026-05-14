import React, { useCallback, useEffect, useState } from 'react'
import { Editor, Node } from '@kn/editor'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@kn/ui'
import { ScrollArea, Button } from '@kn/ui'
import { History, Loader2, RotateCcw } from '@kn/icon'
import { useApi } from '@kn/common'
import { APIS } from '../api'
import { findNodeByBlockId } from '@kn/editor'

export interface BlockVersion {
    id: string
    blockId: string
    content: any
    createdBy?: string
    createdAt: number
    updatedAt: number
    version?: number
    description?: string
}

/**
 * Module-level callback to bridge the imperative blockMenuConfig action
 * with the React dialog state.
 */
let triggerVersionsDialog: ((blockId: string) => void) | null = null

/**
 * Call this from the blockMenuConfig action to open the versions dialog.
 */
export function openBlockVersionsDialog(blockId: string) {
    if (triggerVersionsDialog) {
        triggerVersionsDialog(blockId)
    }
}

/**
 * BlockVersionsDialog - Floating UI component that displays block version history.
 * Always mounted as a floatingUI component, shows/hides via internal state.
 */
export const BlockVersionsFloatingUI: React.FC<{ editor: Editor }> = ({ editor }) => {
    const [open, setOpen] = useState(false)
    const [blockId, setBlockId] = useState('')
    const [versions, setVersions] = useState<BlockVersion[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [restoring, setRestoring] = useState<string | null>(null)

    // Register the trigger callback so blockMenuConfig action can open this dialog
    useEffect(() => {
        triggerVersionsDialog = (id: string) => {
            setBlockId(id)
            setOpen(true)
        }
        return () => {
            triggerVersionsDialog = null
        }
    }, [])

    const fetchVersions = useCallback(async () => {
        if (!blockId) return

        setLoading(true)
        setError(null)

        try {
            const res = await useApi(APIS.GET_BLOCK_VERSIONS, { blockId })
            setVersions(res.data || [])
        } catch (err) {
            console.error('Failed to fetch block versions:', err)
            setError('Failed to load version history')
        } finally {
            setLoading(false)
        }
    }, [blockId])

    useEffect(() => {
        if (open && blockId) {
            fetchVersions()
        }
    }, [open, blockId, fetchVersions])

    const handleRestore = useCallback(async (version: BlockVersion) => {
        if (!editor || !version.content) return

        setRestoring(version.id)

        try {
            const result = findNodeByBlockId(editor.state, blockId)

            if (result) {
                const { node, pos } = result
                // Replace the node with the version content using editor commands
                // Parse version content through the editor schema
                let replacementContent = version.content
                if (typeof version.content === 'object' && !Array.isArray(version.content)) {
                    replacementContent = [version.content]
                }
                // Use the editor's schema to parse the JSON content into a Fragment
                const fragment = Node.fromJSON(editor.state.schema, replacementContent)
                const tr = editor.state.tr
                tr.replaceWith(pos, pos + node.nodeSize, fragment)
                editor.view.dispatch(tr.scrollIntoView())
            }
        } catch (err) {
            console.error('Failed to restore version:', err)
        } finally {
            setRestoring(null)
            setOpen(false)
        }
    }, [editor, blockId])

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffMins = Math.floor(diffMs / 60000)
        const diffHours = Math.floor(diffMs / 3600000)
        const diffDays = Math.floor(diffMs / 86400000)

        if (diffMins < 1) return 'Just now'
        if (diffMins < 60) return `${diffMins}m ago`
        if (diffHours < 24) return `${diffHours}h ago`
        if (diffDays < 7) return `${diffDays}d ago`

        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        Version History
                    </DialogTitle>
                </DialogHeader>

                <div className="text-xs text-muted-foreground mb-2">
                    Block ID: <span className="font-mono">{blockId}</span>
                </div>

                {loading && (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">Loading versions...</span>
                    </div>
                )}

                {error && (
                    <div className="text-center text-destructive text-sm py-4">
                        {error}
                    </div>
                )}

                {!loading && !error && versions.length === 0 && (
                    <div className="text-center text-muted-foreground text-sm py-8">
                        No version history available for this block.
                    </div>
                )}

                {!loading && !error && versions.length > 0 && (
                    <ScrollArea className="max-h-[400px]">
                        <div className="space-y-2 pr-3">
                            {versions.map((version, index) => (
                                <div
                                    key={version.id || index}
                                    className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50 transition-colors"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium">
                                            {version.description || `Version ${versions.length - index}`}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                            {formatTime(version.updatedAt || version.createdAt)}
                                            {version.createdBy && (
                                                <span> by {version.createdBy}</span>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRestore(version)}
                                        disabled={restoring !== null}
                                        className="ml-2 shrink-0"
                                    >
                                        {restoring === version.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <RotateCcw className="h-4 w-4" />
                                        )}
                                        <span className="ml-1">Restore</span>
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                )}
            </DialogContent>
        </Dialog>
    )
}
