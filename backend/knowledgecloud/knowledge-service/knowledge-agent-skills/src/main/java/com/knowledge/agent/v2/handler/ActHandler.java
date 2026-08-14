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
import com.knowledge.agent.v2.tool.ToolRouter;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;

import java.util.ArrayList;
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

        // Split by routing location. The LLM may mix frontend and backend
        // tools in one turn; each must be answered by a tool result message or
        // providers like DeepSeek reject the next request (orphaned
        // tool_calls).
        List<ToolCall> backendCalls = new ArrayList<>();
        List<ToolCall> frontendCalls = new ArrayList<>();
        List<InferenceResponse.ToolCallData> frontendPending = new ArrayList<>();
        for (InferenceResponse.ToolCallData tc : pendingCalls) {
            ToolCall call = ToolCall.fromInference(tc);
            if (toolRouter.resolveLocation(tc.getName(), session)
                    == ToolEvent.ToolLocation.FRONTEND) {
                frontendCalls.add(call);
                frontendPending.add(tc);
            } else {
                backendCalls.add(call);
            }
        }

        log.debug("ActHandler: dispatching {} backend + {} frontend tool(s) for session {}: {}",
                backendCalls.size(), frontendCalls.size(), sessionId,
                pendingCalls.stream().map(InferenceResponse.ToolCallData::getName)
                        .collect(Collectors.joining(", ")));

        if (frontendCalls.isEmpty()) {
            // All backend: dispatch and collect outcomes for OBSERVE
            return Flux.concat(
                    withOutcomeAppending(session, toolRouter.dispatch(backendCalls, session)),
                    // After all tools execute, clear pending and transition to OBSERVE
                    Flux.defer(() -> {
                        session.getExecution().clearPendingToolCalls();
                        return Flux.just(Transition.toObserve(sessionId));
                    }));
        }

        // Frontend tools present (possibly mixed with backend ones):
        // 1. Execute the backend calls FIRST and append their results, so the
        //    assistant tool_calls message is fully answered.
        // 2. Keep ONLY the frontend calls as pending — the suspension
        //    checkpoint must not re-list already-executed backend tools.
        // 3. Dispatch the frontend calls and suspend for the client.
        Flux<AgentEvent> backendExecution = backendCalls.isEmpty()
                ? Flux.empty()
                : withOutcomeAppending(session, toolRouter.dispatch(backendCalls, session));
        Flux<AgentEvent> frontendDispatch = toolRouter.dispatch(frontendCalls, session);

        return Flux.concat(
                backendExecution,
                Flux.defer(() -> {
                    session.getExecution().setPendingToolCalls(frontendPending);
                    return Flux.empty();
                }),
                frontendDispatch,
                Flux.just(Transition.toSuspended(sessionId, "frontend_tool_calls")));
    }

    /**
     * Append tool-completed/failed outcomes to the conversation history as
     * {@code tool} messages so the assistant tool_calls are answered.
     */
    private Flux<AgentEvent> withOutcomeAppending(AgentSession session, Flux<AgentEvent> events) {
        return events.doOnNext(event -> {
            if (event instanceof ToolEvent.ToolCompleted) {
                ToolEvent.ToolCompleted completed = (ToolEvent.ToolCompleted) event;
                appendToolMessage(session, completed.getToolCallId(),
                        completed.getToolName(), completed.getResult());
            } else if (event instanceof ToolEvent.ToolFailed) {
                ToolEvent.ToolFailed failed = (ToolEvent.ToolFailed) event;
                appendToolMessage(session, failed.getToolCallId(),
                        failed.getToolName(), failed.getErrorMessage());
            }
        });
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
