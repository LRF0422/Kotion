export interface PendingToolBatch {
    runId: string
    callIds: string[]
}

export function createPendingToolBatch(runId: string, callIds: string[]): PendingToolBatch {
    return { runId, callIds: [...callIds] }
}

export function matchesPendingToolBatch(
    batch: PendingToolBatch | null,
    runId: string,
    callIds: string[]
): boolean {
    return !!batch
        && batch.runId === runId
        && callIds.length > 0
        && callIds.every(id => batch.callIds.includes(id))
}
