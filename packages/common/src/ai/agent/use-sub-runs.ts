/**
 * useSubRuns — drives delegated child runs and releases each child's editor
 * target when it settles.
 *
 * Extracted from useEditorAgent so the run hook is not also the sub-agent
 * lifecycle owner. One SubRunWorker drives every live child (each child gets its
 * own stream + resume round-trips); this hook only supervises attach/detach and
 * private-document release.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { Dispatch, MutableRefObject } from 'react'
import { SubRunWorker, type SubRunClient } from './sub-run-worker'
import type { AgentRunStore } from './persistence'
import type { EditorToolExecutor } from './tool-executor'
import type { SessionPageBinding } from '../session-page-binding'
import type { Action, SubRunRecord, ToolCallRecord } from './editor-agent-state'

export interface UseSubRunsOptions {
    client: SubRunClient
    store: AgentRunStore
    executor: EditorToolExecutor
    /** Host edit-target binding (injected; defaults to the global in the caller). */
    getSessionBinding: () => SessionPageBinding | null
    dispatch: Dispatch<Action>
    /** Live child records from the run state. */
    subRuns: SubRunRecord[]
    /** The shared tool tape (child calls are tagged with a subRunId). */
    toolCalls: ToolCallRecord[]
    /** Mounted flag; a settled child's merge report is ignored after unmount. */
    mountedRef: MutableRefObject<boolean>
}

export interface UseSubRunsApi {
    /** Detach every child and discard their private documents (cancel/reset). */
    stopAll: () => void
}

export function useSubRuns(options: UseSubRunsOptions): UseSubRunsApi {
    const { client, store, executor, getSessionBinding, dispatch, subRuns, toolCalls, mountedRef } = options

    /** Delegated agents seen in this turn, so their editor targets can be freed. */
    const ownedAgentIdsRef = useRef<Set<string>>(new Set())

    const releaseOwnerTarget = useCallback((owner: string, opts?: { commit?: boolean }) => {
        ownedAgentIdsRef.current.delete(owner)
        // `releaseOwner` merges the agent's private document back into the live
        // page and hands back the report; the tree shows it on the child.
        void Promise.resolve(getSessionBinding()?.releaseOwner?.(owner, opts))
            .then(report => {
                if (report && mountedRef.current) {
                    dispatch({ type: 'sub-merged', subRunId: owner, report })
                }
            })
            .catch(() => { /* the tree already shows the child's own error */ })
    }, [dispatch, getSessionBinding, mountedRef])

    const releaseAllOwnerTargets = useCallback(() => {
        const ids = [...ownedAgentIdsRef.current]
        ownedAgentIdsRef.current.clear()
        const binding = getSessionBinding()
        if (!binding?.releaseOwner) return
        // A cancelled/reset turn discards private documents: merging half-done
        // work into the page would be worse than losing it.
        for (const owner of ids) void binding.releaseOwner(owner, { commit: false })
    }, [getSessionBinding])

    const subRunWorker = useMemo(() => new SubRunWorker({
        client,
        store,
        executeTool: (callId, tool, args, owner) => executor.execute(callId, tool, args, owner),
        onEvent: (runId, event) => dispatch({ type: 'sub-event', subRunId: runId, event }),
        onSettled: (runId, settlement) => {
            // The child can no longer edit anything: hand its editor back, drop
            // its tool-result journal, and merge its private document — but only
            // when it finished normally (a cancelled/timed-out child's partial
            // edits are discarded rather than written into the page).
            ownedAgentIdsRef.current.delete(runId)
            void Promise.resolve(
                getSessionBinding()?.releaseOwner?.(runId, { commit: settlement === 'completed' })
            ).then(report => {
                if (report && mountedRef.current) {
                    dispatch({ type: 'sub-merged', subRunId: runId, report })
                }
            }).catch(() => { /* the tree already shows the child's own error */ })
            store.clearToolResults(runId)
        },
    }), [client, store, executor, dispatch, getSessionBinding, mountedRef])

    // A delegated child's editor target dies with it: releasing on terminal
    // avoids pinning an off-screen session (and its editor) for an agent that
    // can no longer edit anything. A call that is still executing keeps the
    // target alive until its result is applied — destroying the editor under a
    // running tool is worse than holding the session a moment longer. Live
    // children are attached here, which is also how a re-attached parent resumes
    // driving children it did not spawn in this tab.
    useEffect(() => {
        for (const sub of subRuns) {
            if (sub.status === 'running') {
                ownedAgentIdsRef.current.add(sub.subRunId)
                subRunWorker.attach(sub.subRunId)
                continue
            }
            if (!ownedAgentIdsRef.current.has(sub.subRunId)) continue
            const stillRunning = toolCalls.some(
                call => call.subRunId === sub.subRunId && call.status === 'running'
            )
            if (stillRunning) continue
            // Pass the real settlement so the worker's onSettled performs the
            // merge/discard with the correct commit flag.
            subRunWorker.detach(
                sub.subRunId,
                sub.status === 'completed' ? 'completed'
                    : sub.status === 'failed' ? 'failed' : 'cancelled'
            )
            releaseOwnerTarget(sub.subRunId, { commit: sub.status === 'completed' })
        }
    }, [subRuns, toolCalls, releaseOwnerTarget, subRunWorker])

    // Dispose the worker on unmount (and if it is ever replaced). Children keep
    // running server-side; this tab simply stops driving them.
    useEffect(() => () => { subRunWorker.dispose() }, [subRunWorker])

    const stopAll = useCallback(() => {
        subRunWorker.stopAll()
        releaseAllOwnerTargets()
    }, [subRunWorker, releaseAllOwnerTargets])

    return { stopAll }
}
