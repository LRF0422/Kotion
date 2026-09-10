export interface LogicFlowEditingContextSnapshot {
  diagramId: string | null;
  position: number | null;
  pageId: string;
  selectedElementIds: string[];
  mode: "inline" | "workspace";
}

interface LogicFlowEditingContextRegistration {
  token: symbol;
  readSnapshot: () => LogicFlowEditingContextSnapshot | null;
}

interface LogicFlowEditingContextState {
  activeToken?: symbol;
  registrations: Map<symbol, LogicFlowEditingContextRegistration>;
}

export interface LogicFlowEditingContextHandle {
  activate: () => void;
  unregister: () => void;
}

const contexts = new WeakMap<object, LogicFlowEditingContextState>();

function readRegistration(
  registration: LogicFlowEditingContextRegistration | undefined,
): LogicFlowEditingContextSnapshot | null {
  if (!registration) return null;
  try {
    const snapshot = registration.readSnapshot();
    if (!snapshot || (!snapshot.diagramId && snapshot.position === null))
      return null;
    return {
      ...snapshot,
      selectedElementIds: [...new Set(snapshot.selectedElementIds)],
    };
  } catch {
    return null;
  }
}

export function registerLogicFlowEditingContext(
  editor: object,
  readSnapshot: () => LogicFlowEditingContextSnapshot | null,
): LogicFlowEditingContextHandle {
  let state = contexts.get(editor);
  if (!state) {
    state = { registrations: new Map() };
    contexts.set(editor, state);
  }
  const token = Symbol("logicflow-editing-context");
  state.registrations.set(token, { token, readSnapshot });

  return {
    activate: () => {
      const current = contexts.get(editor);
      if (current?.registrations.has(token)) current.activeToken = token;
    },
    unregister: () => {
      const current = contexts.get(editor);
      if (!current) return;
      current.registrations.delete(token);
      if (current.activeToken === token) current.activeToken = undefined;
      if (!current.registrations.size) contexts.delete(editor);
    },
  };
}

export function getCurrentLogicFlowEditingContext(
  editor: object,
): LogicFlowEditingContextSnapshot | null {
  const state = contexts.get(editor);
  if (!state) return null;

  const active = state.activeToken
    ? readRegistration(state.registrations.get(state.activeToken))
    : null;
  if (active) return active;

  const snapshots = [...state.registrations.values()]
    .map(readRegistration)
    .filter((snapshot): snapshot is LogicFlowEditingContextSnapshot =>
      Boolean(snapshot),
    );
  return snapshots.length === 1 ? snapshots[0] : null;
}
