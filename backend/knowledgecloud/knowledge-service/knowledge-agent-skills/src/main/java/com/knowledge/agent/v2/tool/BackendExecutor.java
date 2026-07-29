package com.knowledge.agent.v2.tool;

import com.knowledge.agent.tool.AsyncTool;
import com.knowledge.agent.tool.Tool;
import com.knowledge.agent.tool.ToolContext;
import com.knowledge.agent.tool.ToolRegistry;
import com.knowledge.agent.tool.ToolResult;
import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.session.AgentSession;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.time.Duration;
import java.util.concurrent.TimeoutException;

/**
 * Executes backend tools (server-side) with timeout and error handling.
 *
 * <p>
 * Bridges the V2 engine to V1's {@link ToolRegistry} and {@link Tool}
 * implementations. Handles both sync and async tools, applying per-tool
 * timeout to prevent runaway executions.
 *
 * <p>
 * Each execution returns a single {@link ToolOutcome} wrapped in a Flux
 * (to allow streaming progress events for async tools in the future).
 */
@Slf4j
public class BackendExecutor {

    private final ToolRegistry toolRegistry;
    private final AgentProperties.ToolConfig config;

    public BackendExecutor(ToolRegistry toolRegistry, AgentProperties.ToolConfig config) {
        this.toolRegistry = toolRegistry;
        this.config = config;
    }

    /**
     * Execute a single tool call and return the outcome.
     *
     * @param call    the tool call to execute
     * @param session the current agent session (for building ToolContext)
     * @return a Flux containing the tool outcome (may include progress events
     *         later)
     */
    public Flux<ToolOutcome> execute(ToolCall call, AgentSession session) {
        Tool tool = toolRegistry.get(call.getName());

        if (tool == null) {
            log.warn("BackendExecutor: unknown tool '{}' in session {}",
                    call.getName(), session.getSessionId());
            return Flux.just(ToolOutcome.error(
                    call.getId(), call.getName(),
                    "Unknown tool: " + call.getName(), 0));
        }

        ToolContext context = buildToolContext(session);

        if (tool instanceof AsyncTool) {
            return executeAsync((AsyncTool) tool, call, context);
        }

        return executeSync(tool, call, context);
    }

    /**
     * Execute a synchronous tool on the bounded-elastic scheduler with timeout.
     */
    private Flux<ToolOutcome> executeSync(Tool tool, ToolCall call, ToolContext context) {
        long startMs = System.currentTimeMillis();
        long timeoutSeconds = resolveTimeout(tool);

        return Mono.fromCallable(() -> {
            ToolResult result = tool.execute(context, call.getArguments());
            long duration = System.currentTimeMillis() - startMs;

            if (result.isSuccess()) {
                return ToolOutcome.success(call.getId(), call.getName(),
                        result.getOutput() != null ? result.getOutput() : "", duration);
            } else {
                return ToolOutcome.error(call.getId(), call.getName(),
                        result.getError() != null ? result.getError() : "Unknown error", duration);
            }
        })
                .subscribeOn(Schedulers.boundedElastic())
                .timeout(Duration.ofSeconds(timeoutSeconds))
                .onErrorResume(err -> {
                    long duration = System.currentTimeMillis() - startMs;
                    if (err instanceof TimeoutException) {
                        log.warn("Tool '{}' timed out after {}s in session {}",
                                call.getName(), timeoutSeconds, context.getSessionId());
                        return Mono.just(ToolOutcome.timeout(
                                call.getId(), call.getName(), timeoutSeconds, duration));
                    }
                    log.error("Tool '{}' failed in session {}: {}",
                            call.getName(), context.getSessionId(), err.getMessage(), err);
                    return Mono.just(ToolOutcome.error(
                            call.getId(), call.getName(),
                            "Tool " + call.getName() + " failed: " + err.getMessage(), duration));
                })
                .flux();
    }

    /**
     * Execute an async tool that returns a reactive stream.
     */
    private Flux<ToolOutcome> executeAsync(AsyncTool asyncTool, ToolCall call, ToolContext context) {
        long startMs = System.currentTimeMillis();
        long timeoutSeconds = resolveTimeout(asyncTool);
        StringBuilder resultHolder = new StringBuilder();

        return asyncTool.executeAsync(context, call.getArguments())
                .doOnNext(ev -> {
                    if (ev instanceof com.knowledge.agent.core.engine.StreamEvent.ToolResultEvent) {
                        Object result = ((com.knowledge.agent.core.engine.StreamEvent.ToolResultEvent) ev).getResult();
                        resultHolder.setLength(0);
                        resultHolder.append(result != null ? result.toString() : "");
                    }
                })
                .then(Mono.defer(() -> {
                    long duration = System.currentTimeMillis() - startMs;
                    String output = resultHolder.toString();
                    return Mono.just(ToolOutcome.success(call.getId(), call.getName(), output, duration));
                }))
                .timeout(Duration.ofSeconds(timeoutSeconds))
                .onErrorResume(err -> {
                    long duration = System.currentTimeMillis() - startMs;
                    if (err instanceof TimeoutException) {
                        return Mono.just(ToolOutcome.timeout(
                                call.getId(), call.getName(), timeoutSeconds, duration));
                    }
                    return Mono.just(ToolOutcome.error(
                            call.getId(), call.getName(),
                            "Async tool " + call.getName() + " failed: " + err.getMessage(), duration));
                })
                .flux();
    }

    /**
     * Per-tool timeout: the tool's override if present, else the global default.
     */
    private long resolveTimeout(Tool tool) {
        Integer override = tool.getTimeoutOverrideSeconds();
        return override != null ? override : config.getTimeoutSeconds();
    }

    /**
     * Build a V1-compatible ToolContext from the V2 AgentSession.
     */
    private ToolContext buildToolContext(AgentSession session) {
        ToolContext.ToolContextBuilder builder = ToolContext.builder()
                .sessionId(session.getSessionId())
                .conversationId(session.getConversationId())
                .modelName(session.getModelName())
                // Live metadata reference — lets scratchpad tools
                // (update_task_state / get_task_state) mutate session state.
                .sessionMetadata(session.getMetadata());

        if (session.getIdentity() != null) {
            builder.userId(session.getIdentity().getUserId())
                    .tenantId(session.getIdentity().getTenantId())
                    .token(session.getIdentity().getToken())
                    .userName(session.getIdentity().getUserName())
                    .account(session.getIdentity().getAccount())
                    .roleName(session.getIdentity().getRoleName());
        }

        return builder.build();
    }
}
