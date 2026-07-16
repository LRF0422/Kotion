package com.knowledge.agent.v2.interceptor;

import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.event.StateEvent;
import com.knowledge.agent.v2.pipeline.AgentInterceptor;
import com.knowledge.agent.v2.pipeline.InterceptorChain;
import com.knowledge.agent.v2.session.AgentSession;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;

/**
 * Snapshot interceptor — persists session state at commit points.
 *
 * <p>Order 100 (innermost): runs closest to the handler, after all other
 * interceptors. Saves state at:
 * <ul>
 *   <li>Tool-call boundaries (after ACT completes → entering OBSERVE)</li>
 *   <li>Every N iterations (configurable safety net)</li>
 * </ul>
 *
 * <p>The snapshot is fire-and-forget — it does not block the reactive chain.
 * This enables crash recovery: if the process restarts, the last snapshot
 * can be restored to resume from the last commit point.
 *
 * <p>Note: The actual persistence mechanism is pluggable. Currently logs
 * the save operation. Production implementations would serialize to file/DB.
 */
@Slf4j
public class SnapshotInterceptor implements AgentInterceptor {

    private final AgentProperties.StateConfig stateConfig;

    public SnapshotInterceptor(AgentProperties.StateConfig stateConfig) {
        this.stateConfig = stateConfig;
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
        if ("none".equals(stateConfig.getBackend())) {
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

    private void saveSnapshot(AgentSession session) {
        try {
            log.debug("Snapshot: saving session {} at iteration {} (backend={})",
                    session.getSessionId(),
                    session.getExecution().getIteration(),
                    stateConfig.getBackend());

            // TODO: Implement actual persistence (file/JDBC) based on stateConfig.getBackend()
            // For now, this is a placeholder that logs the save operation.
            // The actual implementation would:
            // 1. Serialize the session execution state (messages, iteration, tool calls)
            // 2. Write to the configured backend (file system or database)
            // 3. Handle errors gracefully (fire-and-forget — never block the chain)

        } catch (Exception e) {
            log.warn("Snapshot: failed to save session {}: {}",
                    session.getSessionId(), e.getMessage());
        }
    }
}
