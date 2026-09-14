/**
 * AgentDocumentHost — the hidden editors behind per-agent private documents.
 *
 * Mounted once in the app shell (Layout), next to `OffscreenEditorHost`. For
 * every forked document it mounts one **non-collaborative** editor seeded with
 * the forked content: no collaboration provider, no room, no autosave, so an
 * agent's writes stay private and two agents can edit "the same page" at the
 * same time. Merge happens later, when the agent finishes.
 */

import React, { useEffect, useMemo, useRef, useState } from "react"
import {
    EditorContent,
    useEditor,
    useEditorExtension,
    type AnyExtension,
    type JSONContent,
} from "@kn/editor"
import { agentDocumentManager } from "./agent-document-manager"

interface AgentDocumentSpec {
    owner: string
    pageId: string
    baseline: unknown
}

const AgentDocumentSession: React.FC<{ spec: AgentDocumentSpec }> = ({ spec }) => {
    const [extensions] = useEditorExtension(undefined, true)
    const reportedRef = useRef(false)

    const editor = useEditor(
        {
            editable: true,
            immediatelyRender: false,
            shouldRerenderOnTransaction: false,
            extensions: extensions as AnyExtension[],
            editorProps: {
                attributes: {
                    class: 'ProseMirror',
                    spellcheck: 'false',
                },
            },
        },
        [extensions]
    )

    useEffect(() => {
        if (!editor || reportedRef.current) return
        reportedRef.current = true
        try {
            // The baseline comes from a live editor with this exact extension
            // set, so it can be applied as-is.
            editor.commands.setContent(spec.baseline as JSONContent, { emitUpdate: false })
            agentDocumentManager.markReady(spec.owner, editor)
        } catch (error) {
            agentDocumentManager.markError(
                spec.owner,
                error instanceof Error ? error : new Error(String(error))
            )
        }
    }, [editor, spec.owner, spec.baseline])

    // `useEditor` destroys the instance on unmount; the registry entry is gone
    // by then (release() already removed it).
    return <EditorContent editor={editor} />
}

export const AgentDocumentHost: React.FC = () => {
    const [specs, setSpecs] = useState<AgentDocumentSpec[]>(() => agentDocumentManager.list())

    useEffect(() => agentDocumentManager.subscribe(() => {
        setSpecs(agentDocumentManager.list())
    }), [])

    useEffect(() => () => agentDocumentManager.releaseAll(), [])

    const rendered = useMemo(() => specs, [specs])
    if (rendered.length === 0) return null

    return (
        <div
            aria-hidden="true"
            style={{
                position: 'fixed',
                left: -10000,
                top: 0,
                width: 800,
                height: 600,
                overflow: 'hidden',
                pointerEvents: 'none',
            }}
        >
            {rendered.map(spec => (
                <div key={spec.owner} style={{ width: 800, height: 600, overflow: 'hidden' }}>
                    <AgentDocumentSession spec={spec} />
                </div>
            ))}
        </div>
    )
}
