package com.knowledge.agent.v2.interceptor;

import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.pipeline.AgentInterceptor;
import com.knowledge.agent.v2.pipeline.InterceptorChain;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.ConversationMessage;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;

import java.util.List;

/**
 * Context window interceptor — compresses conversation history when needed.
 *
 * <p>Order 50: runs before THINK state to ensure the message list stays
 * within the model's context window. When messages exceed the threshold,
 * older messages are summarized or truncated.
 *
 * <p>Current implementation: simple truncation (keeps system prompt + last N
 * messages). Future enhancement: LLM-based summarization of older context.
 */
@Slf4j
public class ContextWindowInterceptor implements AgentInterceptor {

    /** Maximum messages to keep in the working window. */
    private static final int MAX_MESSAGES = 80;
    /** Minimum messages to always preserve (system + recent). */
    private static final int KEEP_RECENT = 20;

    @Override
    public int order() {
        return 50;
    }

    @Override
    public boolean appliesTo(AgentState from, AgentState to) {
        // Only compress before THINK (when we're about to send to LLM)
        return to == AgentState.THINK;
    }

    @Override
    public Flux<AgentEvent> intercept(AgentSession session, AgentState from, AgentState to,
                                       InterceptorChain chain) {
        compressIfNeeded(session);
        return chain.proceed(session);
    }

    private void compressIfNeeded(AgentSession session) {
        List<ConversationMessage> messages = session.getExecution().getMessages();
        if (messages.size() <= MAX_MESSAGES) {
            return;
        }

        int excess = messages.size() - MAX_MESSAGES;
        log.info("ContextWindow: session {} has {} messages, truncating {} from middle",
                session.getSessionId(), messages.size(), excess);

        // Strategy: keep system message(s) at the start + last KEEP_RECENT messages
        // Remove from position 1 (after system) up to (size - KEEP_RECENT)
        int systemMsgCount = 0;
        for (ConversationMessage msg : messages) {
            if ("system".equals(msg.getRole())) {
                systemMsgCount++;
            } else {
                break;
            }
        }

        int removeFrom = systemMsgCount;
        int removeTo = messages.size() - KEEP_RECENT;

        if (removeTo > removeFrom) {
            // Insert a summary placeholder
            ConversationMessage summary = ConversationMessage.builder()
                    .role("system")
                    .content("[Earlier conversation messages truncated for context window management. "
                            + (removeTo - removeFrom) + " messages removed.]")
                    .build();

            synchronized (messages) {
                messages.subList(removeFrom, removeTo).clear();
                messages.add(removeFrom, summary);
            }
            log.debug("ContextWindow: session {} trimmed to {} messages",
                    session.getSessionId(), messages.size());
        }
    }
}
