export const LOGICFLOW_AWARENESS_FIELD = "logicflow";
export const DEFAULT_LOGICFLOW_PRESENCE_TTL_MS = 30_000;

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export interface AwarenessLike {
  clientID: number;
  getLocalState(): Record<string, unknown> | null;
  setLocalStateField(field: string, value: unknown): void;
  getStates(): Map<number, Record<string, unknown>>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  off?(event: string, listener: (...args: unknown[]) => void): void;
}

export interface LogicFlowAwarenessEntry {
  updatedAt: number;
  [key: string]: unknown;
}

export interface RemoteLogicFlowPresence<TUser = unknown> {
  clientId: number;
  user: TUser;
  presence: LogicFlowAwarenessEntry;
}

export interface PresenceFilterOptions {
  now?: number;
  staleAfterMs?: number;
  pageId?: string;
}

type LogicFlowAwarenessState = Record<string, LogicFlowAwarenessEntry>;

/**
 * Awareness only supports replacing a top-level field. Keep one merged object per
 * instance so updating one diagram block never erases another block's presence.
 */
const localLogicFlowState = new WeakMap<
  AwarenessLike,
  LogicFlowAwarenessState
>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readLogicFlowState(value: unknown): LogicFlowAwarenessState {
  if (!isRecord(value)) return {};
  const result: LogicFlowAwarenessState = {};
  for (const [diagramId, entry] of Object.entries(value)) {
    if (
      BLOCKED_KEYS.has(diagramId) ||
      !isRecord(entry) ||
      typeof entry.updatedAt !== "number" ||
      !Number.isFinite(entry.updatedAt)
    ) {
      continue;
    }
    result[diagramId] = entry as LogicFlowAwarenessEntry;
  }
  return result;
}

function getMergedLocalState(
  awareness: AwarenessLike,
): LogicFlowAwarenessState {
  const cached = localLogicFlowState.get(awareness) ?? {};
  const current = readLogicFlowState(
    awareness.getLocalState()?.[LOGICFLOW_AWARENESS_FIELD],
  );
  return { ...cached, ...current };
}

function resolveFilterOptions(options: PresenceFilterOptions): {
  now: number;
  staleAfterMs: number;
} {
  return {
    now: options.now ?? Date.now(),
    staleAfterMs: Math.max(
      0,
      options.staleAfterMs ?? DEFAULT_LOGICFLOW_PRESENCE_TTL_MS,
    ),
  };
}

export function isLogicFlowPresenceFresh(
  presence: unknown,
  options: PresenceFilterOptions = {},
): presence is LogicFlowAwarenessEntry {
  if (
    !isRecord(presence) ||
    typeof presence.updatedAt !== "number" ||
    !Number.isFinite(presence.updatedAt)
  ) {
    return false;
  }
  const { now, staleAfterMs } = resolveFilterOptions(options);
  return now - presence.updatedAt <= staleAfterMs;
}

/** Publish or refresh this client's presence for one diagram block. */
export function updateLogicFlowAwareness(
  awareness: AwarenessLike,
  diagramId: string,
  presence: Record<string, unknown>,
  now = Date.now(),
): LogicFlowAwarenessEntry {
  const nextEntry: LogicFlowAwarenessEntry = {
    ...presence,
    updatedAt: now,
  };
  const nextState = {
    ...getMergedLocalState(awareness),
    [diagramId]: nextEntry,
  };
  localLogicFlowState.set(awareness, nextState);
  awareness.setLocalStateField(LOGICFLOW_AWARENESS_FIELD, nextState);
  return nextEntry;
}

/** Remove only this client's presence for one diagram block. */
export function removeLogicFlowAwareness(
  awareness: AwarenessLike,
  diagramId: string,
): void {
  const nextState = { ...getMergedLocalState(awareness) };
  if (!(diagramId in nextState)) return;
  delete nextState[diagramId];
  localLogicFlowState.set(awareness, nextState);
  awareness.setLocalStateField(LOGICFLOW_AWARENESS_FIELD, nextState);
}

/** List fresh remote collaborators for a diagram, reusing awareness.user. */
export function listRemoteLogicFlowPresence<TUser = unknown>(
  awareness: AwarenessLike,
  diagramId: string,
  options: PresenceFilterOptions = {},
): RemoteLogicFlowPresence<TUser>[] {
  const result: RemoteLogicFlowPresence<TUser>[] = [];
  for (const [clientId, state] of awareness.getStates()) {
    if (clientId === awareness.clientID) continue;
    const presence = readLogicFlowState(state[LOGICFLOW_AWARENESS_FIELD])[
      diagramId
    ];
    if (!isLogicFlowPresenceFresh(presence, options)) continue;
    if (options.pageId && presence.pageId !== options.pageId) continue;
    result.push({
      clientId,
      user: state.user as TUser,
      presence,
    });
  }
  return result.sort((left, right) => left.clientId - right.clientId);
}

/**
 * The lowest fresh client id advertising a diagram is its checkpoint leader.
 * Includes the local client so every participant independently reaches the same
 * deterministic answer.
 */
export function getLogicFlowCheckpointLeader(
  awareness: AwarenessLike,
  diagramId: string,
  options: PresenceFilterOptions = {},
): number | null {
  let leader: number | null = null;
  for (const [clientId, state] of awareness.getStates()) {
    const presence = readLogicFlowState(state[LOGICFLOW_AWARENESS_FIELD])[
      diagramId
    ];
    if (!isLogicFlowPresenceFresh(presence, options)) continue;
    if (leader === null || clientId < leader) leader = clientId;
  }
  return leader;
}

export const setLogicFlowAwareness = updateLogicFlowAwareness;
export const clearLogicFlowAwareness = removeLogicFlowAwareness;
export const getRemoteLogicFlowPresence = listRemoteLogicFlowPresence;
export const chooseLogicFlowCheckpointLeader = getLogicFlowCheckpointLeader;
