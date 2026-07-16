package com.knowledge.agent.v2.tool;

import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.event.ToolEvent;
import com.knowledge.agent.v2.session.AgentSession;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Unified tool routing and dispatch engine.
 *
 * <p>Replaces V1's scattered frontend/backend classification logic with a
 * clean strategy chain pattern. The router:
 * <ol>
 *   <li>Consults the {@link RoutingStrategy} chain to determine where each tool runs</li>
 *   <li>Dispatches backend tools to {@link BackendExecutor}</li>
 *   <li>Marks frontend tools for SSE pause (client executes)</li>
 *   <li>Emits {@link ToolEvent} for observability</li>
 * </ol>
 *
 * <p>The router does NOT execute frontend tools — those cause the engine
 * to enter SUSPENDED state, awaiting client response.
 */
@Slf4j
public class ToolRouter {

    private final List<RoutingStrategy> strategies;
    private final BackendExecutor backendExecutor;
    private final AgentProperties.ToolConfig config;

    public ToolRouter(List<RoutingStrategy> strategies,
                      BackendExecutor backendExecutor,
                      AgentProperties.ToolConfig config) {
        // Sort strategies by order
        this.strategies = strategies.stream()
                .sorted(Comparator.comparingInt(RoutingStrategy::order))
                .collect(Collectors.toList());
        this.backendExecutor = backendExecutor;
        this.config = config;
    }

    /**
     * Dispatch a list of tool calls.
     *
     * <p>Backend tools are executed sequentially (preserving deterministic ordering).
     * Frontend tools cause an immediate return with dispatch events only (the engine
     * enters SUSPENDED state and waits for client results).
     *
     * @param calls   the tool calls to dispatch
     * @param session the current agent session
     * @return a Flux of events (dispatched/progress/completed/failed for each tool)
     */
    public Flux<AgentEvent> dispatch(List<ToolCall> calls, AgentSession session) {
        if (calls == null || calls.isEmpty()) {
            return Flux.empty();
        }

        // Classify all calls
        List<RoutedCall> routed = calls.stream()
                .map(call -> new RoutedCall(call, resolveLocation(call.getName(), session)))
                .collect(Collectors.toList());

        // Check if any are frontend — if so, emit dispatch events and suspend
        List<RoutedCall> frontendCalls = routed.stream()
                .filter(r -> r.location == ToolEvent.ToolLocation.FRONTEND)
                .collect(Collectors.toList());

        if (!frontendCalls.isEmpty()) {
            // Frontend tools: emit dispatched events only (engine will suspend)
            return Flux.fromIterable(frontendCalls)
                    .map(r -> (AgentEvent) new ToolEvent.ToolDispatched(
                            session.getSessionId(), r.call.getId(), r.call.getName(),
                            r.call.getArguments(), ToolEvent.ToolLocation.FRONTEND));
        }

        // All backend: execute sequentially
        return Flux.fromIterable(routed)
                .concatMap(r -> executeOne(r, session));
    }

    /**
     * Resolve the location for a single tool.
     */
    public ToolEvent.ToolLocation resolveLocation(String toolName, AgentSession session) {
        for (RoutingStrategy strategy : strategies) {
            Optional<ToolEvent.ToolLocation> location = strategy.resolve(toolName, session);
            if (location.isPresent()) {
                return location.get();
            }
        }
        // Default: backend
        return ToolEvent.ToolLocation.BACKEND;
    }

    /**
     * Check if any of the given tool calls target the frontend.
     */
    public boolean hasFrontendCalls(List<ToolCall> calls, AgentSession session) {
        return calls.stream()
                .anyMatch(call -> resolveLocation(call.getName(), session) == ToolEvent.ToolLocation.FRONTEND);
    }

    /**
     * Execute a single routed tool call and emit events.
     */
    private Flux<AgentEvent> executeOne(RoutedCall routed, AgentSession session) {
        ToolCall call = routed.call;
        String sessionId = session.getSessionId();

        // Emit dispatched event
        ToolEvent.ToolDispatched dispatched = new ToolEvent.ToolDispatched(
                sessionId, call.getId(), call.getName(),
                call.getArguments(), routed.location);

        // Execute via backend executor
        return Flux.concat(
                Flux.just(dispatched),
                backendExecutor.execute(call, session)
                        .map(outcome -> outcomeToEvent(sessionId, outcome))
        );
    }

    private AgentEvent outcomeToEvent(String sessionId, ToolOutcome outcome) {
        if (outcome.isSuccess()) {
            return new ToolEvent.ToolCompleted(
                    sessionId, outcome.getToolCallId(), outcome.getToolName(),
                    outcome.getOutput(), outcome.getDurationMs());
        } else {
            String code = outcome.getStatus() == ToolOutcome.Status.TIMEOUT ? "TIMEOUT" : "EXECUTION_ERROR";
            return new ToolEvent.ToolFailed(
                    sessionId, outcome.getToolCallId(), outcome.getToolName(),
                    code, outcome.getErrorMessage(),
                    outcome.getStatus() == ToolOutcome.Status.TIMEOUT,
                    outcome.getDurationMs());
        }
    }

    /**
     * Internal DTO pairing a call with its resolved location.
     */
    private static class RoutedCall {
        final ToolCall call;
        final ToolEvent.ToolLocation location;

        RoutedCall(ToolCall call, ToolEvent.ToolLocation location) {
            this.call = call;
            this.location = location;
        }
    }
}
