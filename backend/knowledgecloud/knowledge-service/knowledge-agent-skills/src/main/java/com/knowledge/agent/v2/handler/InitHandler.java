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
 * <p>
 * Responsibilities:
 * <ul>
 * <li>Validate the session has required data (messages, model, etc.)</li>
 * <li>Inject system prompt if not already present</li>
 * <li>Initialize the execution state (set iteration to 0)</li>
 * <li>Transition to THINK state to begin the first LLM call</li>
 * </ul>
 *
 * <p>
 * This handler runs exactly once per engine invocation, at the start.
 * It replaces the initialization logic scattered at the top of V1's
 * {@code HarnessLoop.run()} method.
 */
@Slf4j
public class InitHandler implements StateHandler {

    /**
     * Guidance appended to the system prompt so the agent maintains its
     * scratchpad ({@code update_task_state}) during long tasks. The marker
     * doubles as an idempotency check across resumes.
     */
    static final String TASK_STATE_GUIDANCE = "\n\n[长任务须知] 对于多步骤的长任务，请定期调用 update_task_state 工具记录任务目标、计划、"
            + "进度与关键事实（ID、路径、决策等）。这些笔记不会因上下文压缩而丢失；"
            + "当早期对话被压缩成摘要后，可调用 get_task_state 找回完整任务状态。";

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
                // Prepend system message. Note: getMessages() returns a
                // defensive copy, so mutate the local list and write it back.
                messages.add(0, sysMsg);
                session.getExecution().setMessages(messages);
                log.debug("InitHandler: injected system prompt ({} chars)", systemPrompt.length());
            }
        }

        // Append scratchpad guidance to the leading system message (idempotent).
        appendTaskStateGuidance(session);

        // Reset iteration counter for this run
        session.getExecution().setIteration(0);

        log.info("InitHandler: session {} initialized with {} messages, model={}, mode={}",
                session.getSessionId(), session.getExecution().getMessageCount(),
                session.getModelName(), session.getMode());

        // Transition to THINK
        return Flux.just(Transition.toThink(session.getSessionId()));
    }

    /**
     * Append {@link #TASK_STATE_GUIDANCE} to the first system message so the
     * LLM knows to use the scratchpad tools. Reads the current message list
     * via a defensive copy and writes the modified list back. No-ops when
     * there is no system message or the guidance is already present.
     */
    private void appendTaskStateGuidance(AgentSession session) {
        List<ConversationMessage> current = session.getExecution().getMessages();
        for (int i = 0; i < current.size(); i++) {
            ConversationMessage msg = current.get(i);
            if (!"system".equals(msg.getRole())) {
                continue;
            }
            String content = msg.getContent() != null ? msg.getContent() : "";
            if (!content.contains("[长任务须知]")) {
                current.set(i, ConversationMessage.builder()
                        .role("system")
                        .content(content + TASK_STATE_GUIDANCE)
                        .build());
                session.getExecution().setMessages(current);
            }
            return; // only the first system message carries the guidance
        }
    }
}
