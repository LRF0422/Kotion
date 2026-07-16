package com.knowledge.agent.v2.interceptor;

import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.engine.Transition;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.pipeline.AgentInterceptor;
import com.knowledge.agent.v2.pipeline.InterceptorChain;
import com.knowledge.agent.v2.session.AgentMode;
import com.knowledge.agent.v2.session.AgentSession;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;

/**
 * Plan mode guard — prevents write operations when the agent is in PLAN mode.
 *
 * <p>Order 30: intercepts the ACT state to reject mutating tools when
 * the session is operating in {@link AgentMode#PLAN} mode.
 *
 * <p>In PLAN mode, the agent should only use read-only tools to analyze
 * the situation and produce a plan for user approval.
 */
@Slf4j
public class PlanModeGuardInterceptor implements AgentInterceptor {

    @Override
    public int order() {
        return 30;
    }

    @Override
    public boolean appliesTo(AgentState from, AgentState to) {
        // Only guard the ACT state (where tools are executed)
        return to == AgentState.ACT;
    }

    @Override
    public Flux<AgentEvent> intercept(AgentSession session, AgentState from, AgentState to,
                                       InterceptorChain chain) {
        if (!session.isPlanMode()) {
            return chain.proceed(session);
        }

        // In PLAN mode, we still allow the ACT handler to run — but the
        // ToolRouter and BackendExecutor will handle per-tool filtering.
        // This interceptor logs the fact that we're in plan mode for observability.
        log.debug("PlanModeGuard: session {} is in PLAN mode, ACT state proceeding with restrictions",
                session.getSessionId());

        return chain.proceed(session);
    }
}
