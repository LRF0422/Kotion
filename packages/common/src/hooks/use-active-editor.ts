import { useEffect, useState } from "react"
import { ActiveEditorState, getActiveEditor, subscribeActiveEditor } from "../core/active-editor"

/**
 * Subscribe to the active page tab's editor (see `core/active-editor`).
 * Used by views living outside the editor subtree, e.g. dock panels.
 */
export function useActiveEditor(): ActiveEditorState {
    const [state, setState] = useState<ActiveEditorState>(getActiveEditor)

    useEffect(() => {
        // Re-sync on mount: the active tab may have published before we subscribed.
        setState(getActiveEditor())
        return subscribeActiveEditor(setState)
    }, [])

    return state
}
