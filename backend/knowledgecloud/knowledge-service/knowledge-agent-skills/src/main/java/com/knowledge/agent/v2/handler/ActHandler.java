package com.knowledge.agent.v2.handler;

import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.context.ContextCompactor;
import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.engine.StateHandler;
import com.knowledge.agent.v2.engine.Transition;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.event.ToolEvent;
import com.knowledge.agent.v2.llm.InferenceResponse;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.ConversationMessage;
import com.knowledge.agent.v2.tool.ToolCall;
import com.knowledge.agent.v2.tool.ToolOutcome;
import com.knowledge.agent.v2.tool.ToolRouter;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Handles the ACT state — tool execution.
 *
 * <p>
 * Responsibilities:
 * <ul>
 * <li>Read pending tool calls from the session execution state</li>
 * <li>Route each call through the {@link ToolRouter}</li>
 * <li>For backend tools: execute and transition to OBSERVE</li>
 * <li>For frontend tools: emit dispatch events and transition to SUSPENDED</li>
 * </ul>
 *
 * <p>
 * This handler replaces V1's {@code continueOrFinish()} and
 * {@code executeBackendToolsStreaming()} methods.
 */
@Slf4j
public class ActHandler implements StateHandler {

    private final ToolRouter toolRouter;
    private final AgentProperties.ContextConfig contextConfig;

    public ActHandler(ToolRouter toolRouter, AgentProperties.ContextConfig contextConfig) {
        this.toolRouter = toolRouter;
        this.contextConfig = contextConfig;
    }

    @Override
    public Flux<AgentEvent> handle(AgentSession session, AgentState state) {
        String sessionId = session.getSessionId();

        // Get pending tool calls from execution state
        List<InferenceResponse.ToolCallData> pendingCalls = session.getExecution().getPendingToolCalls();
        if (pendingCalls == null || pendingCalls.isEmpty()) {
            log.warn("ActHandler: no pending tool calls in session {}", sessionId);
            return Flux.just(Transition.toError(sessionId, "no_pending_tool_calls"));
        }

        // Convert to V2 ToolCall objects
        List<ToolCall> calls = pendingCalls.stream()
                .map(ToolCall::fromInference)
                .collect(Collectors.toList());

        log.debug("ActHandler: dispatching {} tool(s) for session {}: {}",
                calls.size(), sessionId,
                calls.stream().map(ToolCall::getName).collect(Collectors.joining(", ")));

        // Check if any are frontend tools
        if (toolRouter.hasFrontendCalls(calls, session)) {
            // Frontend tools: emit dispatch events and suspend
            Flux<AgentEvent> dispatchEvents = toolRouter.dispatch(calls, session);
            return Flux.concat(
                    dispatchEvents,
                    Flux.just(Transition.toSuspended(sessionId, "frontend_tool_calls")));
        }

        // All backend: dispatch and collect outcomes for OBSERVE
        return Flux.concat(
                toolRouter.dispatch(calls, session)
                        .doOnNext(event -> {
                            // When tool completes, append result to conversation
                            if (event instanceof ToolEvent.ToolCompleted) {
                                ToolEvent.ToolCompleted completed = (ToolEvent.ToolCompleted) event;
                                appendToolMessage(session, completed.getToolCallId(),
                                        completed.getToolName(), completed.getResult());
                            } else if (event instanceof ToolEvent.ToolFailed) {
                                ToolEvent.ToolFailed failed = (ToolEvent.ToolFailed) event;
                                appendToolMessage(session, failed.getToolCallId(),
                                        failed.getToolName(), failed.getErrorMessage());
                            }
                        }),
                // After all tools execute, clear pending and transition to OBSERVE
                Flux.defer(() -> {
                    session.getExecution().clearPendingToolCalls();
                    return Flux.just(Transition.toObserve(sessionId));
                }));
    }

    /**
     * Append a tool result message to the conversation history.
     *
     * <p>
     * Content is capped at {@code toolResultMaxChars} — the full result
     * has already been emitted to the frontend via the ToolCompleted event;
     * only the LLM-visible conversation message is truncated.
     */
    private void appendToolMessage(AgentSession session, String toolCallId,
            String toolName, String content) {
        String governed = ContextCompactor.truncateToolResult(
                content != null ? content : "", contextConfig.getToolResultMaxChars());
        ConversationMessage toolMsg = ConversationMessage.builder()
                .role("tool")
                .toolCallId(toolCallId)
                .name(toolName)
                .content(governed)
                .build();
        session.getExecution().addMessage(toolMsg);
    }
}
