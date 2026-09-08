import { strict as assert } from "node:assert";
import {
  LOGICFLOW_AWARENESS_FIELD,
  getLogicFlowCheckpointLeader,
  listRemoteLogicFlowPresence,
  removeLogicFlowAwareness,
  updateLogicFlowAwareness,
  type AwarenessLike,
} from "./awareness";

class MockAwareness implements AwarenessLike {
  readonly states = new Map<number, Record<string, unknown>>();
  constructor(
    readonly clientID: number,
    localState: Record<string, unknown>,
  ) {
    this.states.set(clientID, localState);
  }
  getLocalState(): Record<string, unknown> | null {
    return this.states.get(this.clientID) ?? null;
  }
  setLocalStateField(field: string, value: unknown): void {
    this.states.set(this.clientID, {
      ...(this.getLocalState() ?? {}),
      [field]: value,
    });
  }
  getStates(): Map<number, Record<string, unknown>> {
    return this.states;
  }
}

const now = 100_000;
const awareness = new MockAwareness(7, { user: { name: "Local" } });
updateLogicFlowAwareness(
  awareness,
  "diagram",
  { pageId: "page-1", selection: ["local"] },
  now,
);
assert.equal(
  (
    awareness.getLocalState()?.[LOGICFLOW_AWARENESS_FIELD] as Record<
      string,
      { pageId: string }
    >
  ).diagram.pageId,
  "page-1",
);

awareness.states.set(2, {
  user: { name: "Page one" },
  logicflow: {
    diagram: { updatedAt: now, pageId: "page-1", selection: ["a"] },
  },
});
awareness.states.set(3, {
  user: { name: "Page two" },
  logicflow: {
    diagram: { updatedAt: now, pageId: "page-2", selection: ["b"] },
  },
});
awareness.states.set(4, {
  user: { name: "Stale" },
  logicflow: {
    diagram: { updatedAt: now - 60_000, pageId: "page-1" },
  },
});

assert.deepEqual(
  listRemoteLogicFlowPresence<{ name: string }>(awareness, "diagram", {
    now,
    pageId: "page-1",
  }).map(({ clientId }) => clientId),
  [2],
);
assert.deepEqual(
  listRemoteLogicFlowPresence(awareness, "diagram", { now }).map(
    ({ clientId }) => clientId,
  ),
  [2, 3],
);
assert.equal(getLogicFlowCheckpointLeader(awareness, "diagram", { now }), 2);
removeLogicFlowAwareness(awareness, "diagram");
assert.deepEqual(awareness.getLocalState()?.logicflow, {});

console.log("LogicFlow page-aware awareness checks passed.");
