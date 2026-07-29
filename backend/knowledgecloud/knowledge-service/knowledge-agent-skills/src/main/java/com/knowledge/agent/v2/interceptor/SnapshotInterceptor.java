package com.knowledge.agent.v2.interceptor;

import com.knowledge.agent.store.AgentStateSnapshot;
import com.knowledge.agent.store.AgentStateStore;
import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.pipeline.AgentInterceptor;
import com.knowledge.agent.v2.pipeline.InterceptorChain;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.state.SessionSnapshotCodec;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;

/**
 * Snapshot interceptor — persists session state at commit points.
 *
 * <p>
 * Order 100 (innermost): runs closest to the handler, after all other
 * interceptors. Saves state at:
 * <ul>
 * <li>Every THINK entry after tool rounds (each tool round ends by
 * transitioning back to THINK — with from==to pipeline semantics the
 * ACT→OBSERVE boundary is not observable here)</li>
 * <li>Every N iterations (configurable safety net)</li>
 * </ul>
 *
 * <p>
 * The snapshot is fire-and-forget — serialization happens synchronously
 * (to avoid racing with message mutation) but the DB write is queued on the
 * store's bounded executor and never blocks the reactive chain. This enables
 * crash recovery: {@code AgentV2Controller.resume()} reloads the last
 * snapshot when the session is no longer in memory.
 */
@Slf4j
public class SnapshotInterceptor implements AgentInterceptor {

    private final AgentProperties.StateConfig stateConfig;
    private final AgentStateStore stateStore;
    private final SessionSnapshotCodec codec;

    public SnapshotInterceptor(AgentProperties.StateConfig stateConfig,
            AgentStateStore stateStore,
            SessionSnapshotCodec codec) {
        this.stateConfig = stateConfig;
        this.stateStore = stateStore;
        this.codec = codec;
    }

    @Override
    public int order() {
        return 100;
    }

    @Override
    public boolean appliesTo(AgentState from, AgentState to) {
        // Snapshot at tool-call boundaries (ACT → OBSERVE) and periodically
        return to == AgentState.OBSERVE || to == AgentState.THINK;
    }

    @Override
    public Flux<AgentEvent> intercept(AgentSession session, AgentState from, AgentState to,
            InterceptorChain chain) {
        if (stateStore == null || "none".equals(stateConfig.getBackend())) {
            return chain.proceed(session);
        }

        return chain.proceed(session)
                .doOnComplete(() -> {
                    if (shouldSnapshot(session, from, to)) {
                        saveSnapshot(session);
                    }
                });
    }

    private boolean shouldSnapshot(AgentSession session, AgentState from, AgentState to) {
        // Always snapshot at tool-call boundaries
        if (from == AgentState.ACT && to == AgentState.OBSERVE) {
            return true;
        }

        // Interval-based: every N iterations
        int interval = stateConfig.getSnapshotInterval();
        if (interval > 0 && to == AgentState.THINK) {
            int iteration = session.getExecution().getIteration();
            return iteration > 0 && iteration % interval == 0;
        }

        return false;
    }

    /**
     * Serialize synchronously (consistent view of the message list), then
     * hand the write off to the store's async executor. Failures are logged
     * and swallowed — snapshot persistence must never break the loop.
     */
    private void saveSnapshot(AgentSession session) {
        try {
            AgentStateSnapshot snapshot = codec.encode(session);
            stateStore.save(session.getSessionId(), snapshot);
            log.debug("Snapshot: saved session {} at iteration {} (backend={})",
                    session.getSessionId(),
                    session.getExecution().getIteration(),
                    stateConfig.getBackend());
        } catch (Exception e) {
            log.warn("Snapshot: failed to save session {}: {}",
                    session.getSessionId(), e.getMessage());
        }
    }
}
