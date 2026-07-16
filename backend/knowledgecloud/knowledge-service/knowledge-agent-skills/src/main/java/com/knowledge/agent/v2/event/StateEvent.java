package com.knowledge.agent.v2.event;

import com.knowledge.agent.v2.engine.AgentState;

/**
 * State events — internal state transitions and persistence.
 */
public abstract class StateEvent extends AgentEvent {

    protected StateEvent(String sessionId) {
        super(sessionId);
    }

    /**
     * Emitted when the engine transitions between states.
     */
    public static class StateTransition extends StateEvent {
        private final AgentState fromState;
        private final AgentState toState;
        private final int iteration;

        public StateTransition(String sessionId, AgentState fromState, AgentState toState, int iteration) {
            super(sessionId);
            this.fromState = fromState;
            this.toState = toState;
            this.iteration = iteration;
        }

        @Override
        public String type() {
            return "state.transition";
        }

        public AgentState getFromState() {
            return fromState;
        }

        public AgentState getToState() {
            return toState;
        }

        public int getIteration() {
            return iteration;
        }
    }

    /**
     * Emitted when a state snapshot is persisted.
     */
    public static class SnapshotSaved extends StateEvent {
        private final int iteration;
        private final String storeType;

        public SnapshotSaved(String sessionId, int iteration, String storeType) {
            super(sessionId);
            this.iteration = iteration;
            this.storeType = storeType;
        }

        @Override
        public String type() {
            return "state.snapshot_saved";
        }

        public int getIteration() {
            return iteration;
        }

        public String getStoreType() {
            return storeType;
        }
    }

    /**
     * Emitted when a state snapshot is restored (crash recovery).
     */
    public static class SnapshotRestored extends StateEvent {
        private final int iteration;

        public SnapshotRestored(String sessionId, int iteration) {
            super(sessionId);
            this.iteration = iteration;
        }

        @Override
        public String type() {
            return "state.snapshot_restored";
        }

        public int getIteration() {
            return iteration;
        }
    }
}
