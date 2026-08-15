package com.knowledge.agent.v2.handler;

import com.knowledge.agent.api.dto.ChatTool;
import com.knowledge.agent.tool.ToolRegistry;
import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.context.ContextCompactor;
import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.engine.StateHandler;
import com.knowledge.agent.v2.engine.Transition;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.event.PlanEvent;
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
    private final ToolRegistry toolRegistry;
    private final AgentProperties.ContextConfig contextConfig;

    public ActHandler(ToolRouter toolRouter, ToolRegistry toolRegistry,
            AgentProperties.ContextConfig contextConfig) {
        this.toolRouter = toolRouter;
        this.toolRegistry = toolRegistry;
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
        //
        // PLAN mode adds a hard read-only gate (last line of defense): any
        // mutating tool is NEVER executed — it is answered with a
        // PLAN_MODE_VIOLATION tool message so the LLM can self-correct.
        List<ToolCall> backendCalls = new ArrayList<>();
        List<ToolCall> frontendCalls = new ArrayList<>();
        List<InferenceResponse.ToolCallData> frontendPending = new ArrayList<>();
        List<AgentEvent> guardEvents = new ArrayList<>();
        InferenceResponse.ToolCallData planCall = null;
        for (InferenceResponse.ToolCallData tc : pendingCalls) {
            if ("present_plan".equals(tc.getName())) {
                planCall = tc; // intercepted below — never executes normally
                continue;
            }
            ToolEvent.ToolLocation location = toolRouter.resolveLocation(tc.getName(), session);
            if (session.isPlanMode() && !isReadOnly(tc.getName(), location, session)) {
                String violation = "plan 模式下禁止执行写操作工具 " + tc.getName()
                        + "。请改用只读工具调研，或调用 present_plan 提交计划等待批准。";
                guardEvents.add(new ToolEvent.ToolFailed(sessionId, tc.getId(), tc.getName(),
                        "PLAN_MODE_VIOLATION", violation, false, 0));
                appendToolMessage(session, tc.getId(), tc.getName(), "[已拦截] " + violation);
                continue;
            }
            ToolCall call = ToolCall.fromInference(tc);
            if (location == ToolEvent.ToolLocation.FRONTEND) {
                frontendCalls.add(call);
                frontendPending.add(tc);
            } else {
                backendCalls.add(call);
            }
        }

        // present_plan interception — the plan-approval gate (human in the loop).
        // Execute any read-only backend calls collected in the same round first
        // (their results must be answered), then emit plan.proposed and suspend.
        // The present_plan call itself stays pending and is answered by the
        // resume decision (approved/rejected) in ResumeApplier.
        if (planCall != null) {
            final InferenceResponse.ToolCallData finalPlanCall = planCall;
            Flux<AgentEvent> prefix = backendCalls.isEmpty()
                    ? Flux.empty()
                    : withOutcomeAppending(session, toolRouter.dispatch(backendCalls, session));
            return Flux.concat(
                    prefix,
                    Flux.fromIterable(guardEvents),
                    Flux.just((AgentEvent) new PlanEvent.PlanProposed(
                            sessionId, finalPlanCall.getId(), finalPlanCall.getArguments())),
                    Flux.defer(() -> {
                        List<InferenceResponse.ToolCallData> remaining = new ArrayList<>();
                        remaining.add(finalPlanCall);
                        session.getExecution().setPendingToolCalls(remaining);
                        return Flux.just(Transition.toSuspended(sessionId, "plan_approval"));
                    }));
        }

        log.debug("ActHandler: dispatching {} backend + {} frontend tool(s) for session {}: {}",
                backendCalls.size(), frontendCalls.size(), sessionId,
                pendingCalls.stream().map(InferenceResponse.ToolCallData::getName)
                        .collect(Collectors.joining(", ")));

        if (frontendCalls.isEmpty()) {
            // All backend: dispatch and collect outcomes for OBSERVE
            return Flux.concat(
                    Flux.fromIterable(guardEvents),
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
                Flux.fromIterable(guardEvents),
                backendExecution,
                Flux.defer(() -> {
                    session.getExecution().setPendingToolCalls(frontendPending);
                    return Flux.empty();
                }),
                frontendDispatch,
                Flux.just(Transition.toSuspended(sessionId, "frontend_tool_calls")));
    }

    /**
     * PLAN-mode read-only check: backend tools consult the registry's
     * {@code isReadOnly} descriptor; frontend tools consult the {@code readOnly}
     * flag shipped in the client's catalog. Unknown tools are never trusted.
     */
    private boolean isReadOnly(String toolName, ToolEvent.ToolLocation location, AgentSession session) {
        if (location == ToolEvent.ToolLocation.FRONTEND) {
            if (session.getFrontendTools() != null) {
                for (ChatTool ft : session.getFrontendTools()) {
                    if (ft.getFunction() != null && toolName.equals(ft.getFunction().getName())) {
                        return Boolean.TRUE.equals(ft.getReadOnly());
                    }
                }
            }
            return false;
        }
        return toolRegistry.isReadOnlyTool(toolName);
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
