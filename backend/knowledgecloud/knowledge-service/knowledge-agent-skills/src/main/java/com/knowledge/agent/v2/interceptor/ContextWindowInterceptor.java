package com.knowledge.agent.v2.interceptor;

import com.knowledge.agent.v2.context.ContextCompactor;
import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.pipeline.AgentInterceptor;
import com.knowledge.agent.v2.pipeline.InterceptorChain;
import com.knowledge.agent.v2.session.AgentSession;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;

/**
 * Context window interceptor — keeps the conversation within the model's
 * real token budget.
 *
 * <p>
 * Order 50: runs before THINK. Triggers when the provider-reported
 * prompt tokens of the last inference call exceed
 * {@code maxContextTokens * compactionThreshold}, then delegates to
 * {@link ContextCompactor} (L1 tool-result eviction → L2 LLM structured
 * summary → hard-truncation fallback).
 *
 * <p>
 * The compacted list is written back via
 * {@code ExecutionState.setMessages(...)} — {@code getMessages()} returns a
 * defensive copy, so in-place mutation would be silently lost.
 */
@Slf4j
public class ContextWindowInterceptor implements AgentInterceptor {

    private final ContextCompactor compactor;

    public ContextWindowInterceptor(ContextCompactor compactor) {
        this.compactor = compactor;
    }

    @Override
    public int order() {
        return 50;
    }

    @Override
    public boolean appliesTo(AgentState from, AgentState to) {
        // Only compact before THINK (when we're about to send to the LLM)
        return to == AgentState.THINK;
    }

    @Override
    public Flux<AgentEvent> intercept(AgentSession session, AgentState from, AgentState to,
            InterceptorChain chain) {
        boolean forced = session.getExecution().isCompactNextThink();
        if (!forced && !compactor.shouldCompact(session)) {
            return chain.proceed(session);
        }
        // Consume the forced-compaction request exactly once. If compaction
        // fails below we proceed uncompacted instead of retrying forever.
        if (forced) {
            session.getExecution().setCompactNextThink(false);
        }

        int before = session.getExecution().getMessageCount();
        int lastPromptTokens = session.getExecution().getLastPromptTokens();
        log.info("ContextWindow: session {} compacting before THINK (lastPromptTokens={}, messages={})",
                session.getSessionId(), lastPromptTokens, before);

        return compactor.compact(session, forced)
                .doOnNext(compacted -> {
                    session.getExecution().setMessages(compacted);
                    log.info("ContextWindow: session {} compacted {} -> {} messages",
                            session.getSessionId(), before, compacted.size());
                })
                .onErrorResume(e -> {
                    // Never block the loop on compaction failure — proceed as-is
                    log.warn("ContextWindow: session {} compaction failed, proceeding uncompacted: {}",
                            session.getSessionId(), e.getMessage());
                    return reactor.core.publisher.Mono.empty();
                })
                .thenMany(Flux.defer(() -> chain.proceed(session)));
    }
}
