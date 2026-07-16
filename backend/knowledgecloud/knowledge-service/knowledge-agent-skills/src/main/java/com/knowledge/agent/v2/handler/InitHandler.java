package com.knowledge.agent.v2.handler;

import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.engine.StateHandler;
import com.knowledge.agent.v2.engine.Transition;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.ConversationMessage;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;

import java.util.List;

/**
 * Handles the INIT state — session initialization.
 *
 * <p>Responsibilities:
 * <ul>
 *   <li>Validate the session has required data (messages, model, etc.)</li>
 *   <li>Inject system prompt if not already present</li>
 *   <li>Initialize the execution state (set iteration to 0)</li>
 *   <li>Transition to THINK state to begin the first LLM call</li>
 * </ul>
 *
 * <p>This handler runs exactly once per engine invocation, at the start.
 * It replaces the initialization logic scattered at the top of V1's
 * {@code HarnessLoop.run()} method.
 */
@Slf4j
public class InitHandler implements StateHandler {

    @Override
    public Flux<AgentEvent> handle(AgentSession session, AgentState state) {
        log.debug("InitHandler: initializing session {}", session.getSessionId());

        // Validate messages exist
        List<ConversationMessage> messages = session.getExecution().getMessages();
        if (messages == null || messages.isEmpty()) {
            log.error("InitHandler: no messages in session {}", session.getSessionId());
            return Flux.just(Transition.toError(session.getSessionId(), "no_messages"));
        }

        // Inject system prompt if not already present
        String systemPrompt = session.getSystemPrompt();
        if (systemPrompt != null && !systemPrompt.isEmpty()) {
            boolean hasSystemMsg = messages.stream()
                    .anyMatch(m -> "system".equals(m.getRole()));
            if (!hasSystemMsg) {
                ConversationMessage sysMsg = ConversationMessage.builder()
                        .role("system")
                        .content(systemPrompt)
                        .build();
                // Prepend system message
                session.getExecution().getMessages().add(0, sysMsg);
                log.debug("InitHandler: injected system prompt ({} chars)", systemPrompt.length());
            }
        }

        // Reset iteration counter for this run
        session.getExecution().setIteration(0);

        log.info("InitHandler: session {} initialized with {} messages, model={}, mode={}",
                session.getSessionId(), session.getExecution().getMessageCount(),
                session.getModelName(), session.getMode());

        // Transition to THINK
        return Flux.just(Transition.toThink(session.getSessionId()));
    }
}
