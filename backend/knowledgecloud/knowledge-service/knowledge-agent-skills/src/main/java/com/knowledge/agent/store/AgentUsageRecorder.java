package com.knowledge.agent.store;

import com.knowledge.agent.store.entity.AgentUsageRecordEntity;
import com.knowledge.agent.store.mapper.AgentUsageRecordMapper;
import com.knowledge.agent.v2.engine.AgentUsageListener;
import com.knowledge.agent.v2.session.AgentIdentity;
import com.knowledge.agent.v2.session.AgentSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.time.LocalDateTime;

/**
 * Persists per-session token usage into {@code agent_usage_record}.
 *
 * <p>
 * Invoked by {@code AgentEngine} at session completion. The DB write is
 * offloaded to a bounded-elastic scheduler so the reactive engine thread is
 * never blocked, and any failure is logged but never propagated — usage
 * accounting must not break agent execution.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AgentUsageRecorder implements AgentUsageListener {

    private final AgentUsageRecordMapper usageRecordMapper;

    /**
     * Record (upsert) the cumulative usage of a finished session.
     *
     * @param session      the completed/suspended session
     * @param finishReason terminal reason (stop / suspended:xxx)
     * @param durationMs   session elapsed time in milliseconds
     */
    @Override
    public void record(AgentSession session, String finishReason, long durationMs) {
        AgentUsageRecordEntity entity = new AgentUsageRecordEntity();
        entity.setSessionId(session.getSessionId());
        entity.setConversationId(session.getConversationId());
        AgentIdentity identity = session.getIdentity();
        if (identity != null) {
            entity.setUserId(identity.getUserId());
            entity.setTenantId(identity.getTenantId());
            entity.setUserName(identity.getUserName());
        }
        entity.setModelName(session.getModelName());
        entity.setPromptTokens(session.getExecution().getTotalPromptTokens());
        entity.setCompletionTokens(session.getExecution().getTotalCompletionTokens());
        entity.setTotalTokens(entity.getPromptTokens() + entity.getCompletionTokens());
        entity.setDurationMs(durationMs);
        entity.setFinishReason(finishReason);
        entity.setCreateTime(LocalDateTime.now());

        Mono.fromRunnable(() -> usageRecordMapper.upsertBySessionId(entity))
                .subscribeOn(Schedulers.boundedElastic())
                .subscribe(
                        v -> {
                        },
                        e -> log.warn("Failed to record agent usage: sessionId={}",
                                session.getSessionId(), e));
    }
}
