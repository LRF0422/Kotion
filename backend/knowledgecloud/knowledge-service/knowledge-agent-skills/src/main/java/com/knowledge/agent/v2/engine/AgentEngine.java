package com.knowledge.agent.v2.engine;

import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.event.LifecycleEvent;
import com.knowledge.agent.v2.event.StateEvent;
import com.knowledge.agent.v2.eventbus.AgentEventBus;
import com.knowledge.agent.v2.pipeline.InterceptorPipeline;
import com.knowledge.agent.v2.session.AgentSession;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.Map;

/**
 * The Agent execution engine — a reactive state machine.
 *
 * <p>
 * This is the heart of the V2 architecture. It replaces the 1288-line
 * {@code HarnessLoop} God Class with a clean, minimal state machine that:
 * <ol>
 * <li>Enters a state by invoking the corresponding {@link StateHandler}</li>
 * <li>Emits events produced by the handler through the pipeline</li>
 * <li>Consumes the terminal {@link Transition} event to determine the next
 * state</li>
 * <li>Repeats until a terminal state is reached</li>
 * </ol>
 *
 * <p>
 * The engine itself contains NO business logic — all behavior is defined by
 * the registered {@link StateHandler}s and
 * {@link com.knowledge.agent.v2.pipeline.AgentInterceptor}s.
 *
 * <p>
 * Thread model: The engine runs entirely on Reactor's scheduler. No thread
 * is blocked. The recursive loop is expressed as
 * {@code Flux.defer() + concatWith()}
 * to avoid stack overflow on deep iterations.
 */
@Slf4j
public class AgentEngine {

    private final Map<AgentState, StateHandler> handlers;
    private final InterceptorPipeline pipeline;
    private final AgentEventBus eventBus;
    private final AgentProperties properties;
    /** Optional usage accounting hook; may be null when not configured. */
    private final AgentUsageListener usageListener;

    public AgentEngine(Map<AgentState, StateHandler> handlers,
            InterceptorPipeline pipeline,
            AgentEventBus eventBus,
            AgentProperties properties) {
        this(handlers, pipeline, eventBus, properties, null);
    }

    public AgentEngine(Map<AgentState, StateHandler> handlers,
            InterceptorPipeline pipeline,
            AgentEventBus eventBus,
            AgentProperties properties,
            AgentUsageListener usageListener) {
        this.handlers = handlers;
        this.pipeline = pipeline;
        this.eventBus = eventBus;
        this.properties = properties;
        this.usageListener = usageListener;
    }

    /**
     * Run the agent engine for a session.
     *
     * <p>
     * Returns a Flux that emits all {@link AgentEvent}s produced during
     * execution. The Flux completes when the engine reaches a terminal state
     * ({@link AgentState#DONE}, {@link AgentState#ERROR}, or
     * {@link AgentState#SUSPENDED}).
     *
     * <p>
     * Events are also published to the {@link AgentEventBus} for other
     * consumers (metrics, audit, etc.).
     *
     * @param session the agent session to execute
     * @return a Flux of events, completing when the session terminates
     */
    public Flux<AgentEvent> run(AgentSession session) {
        log.info("AgentEngine starting: sessionId={}, traceId={}, mode={}",
                session.getSessionId(), session.getTraceId(), session.getMode());

        // Emit session created event
        LifecycleEvent.SessionCreated createdEvent = new LifecycleEvent.SessionCreated(
                session.getSessionId(), session.getConversationId(), session.getTraceId());
        eventBus.publish(createdEvent);

        // Start the state machine loop from INIT
        session.getExecution().transitionTo(AgentState.INIT);

        return buildFlux(session, createdEvent);
    }

    /**
     * Resume a suspended session from its current state (typically OBSERVE).
     * Does NOT reset the state to INIT — picks up where it left off.
     */
    public Flux<AgentEvent> resume(AgentSession session) {
        log.info("AgentEngine resuming: sessionId={}, state={}",
                session.getSessionId(), session.getCurrentState());

        // Emit a session.created so the frontend gets the sessionId again
        LifecycleEvent.SessionCreated createdEvent = new LifecycleEvent.SessionCreated(
                session.getSessionId(), session.getConversationId(), session.getTraceId());
        eventBus.publish(createdEvent);

        // Do NOT reset state — resume from current state
        return buildFlux(session, createdEvent);
    }

    private Flux<AgentEvent> buildFlux(AgentSession session, LifecycleEvent.SessionCreated createdEvent) {
        return Flux.concat(
                Flux.just((AgentEvent) createdEvent),
                Flux.defer(() -> executeState(session)),
                // Emit SessionCompleted as the last event in the stream
                Flux.defer(() -> {
                    long elapsed = session.getExecution().getElapsedMs();
                    AgentState finalState = session.getCurrentState();
                    if (finalState == AgentState.DONE || finalState == AgentState.SUSPENDED) {
                        String finishReason = "stop";
                        if (finalState == AgentState.SUSPENDED) {
                            // Carry the suspend reason so the frontend can tell
                            // budget exhaustion apart from frontend tool dispatch
                            String suspendReason = session.getExecution().getSuspendReason();
                            finishReason = suspendReason != null
                                    ? "suspended:" + suspendReason
                                    : "suspended";
                        }
                        LifecycleEvent.SessionCompleted completedEvent = new LifecycleEvent.SessionCompleted(
                                session.getSessionId(),
                                finishReason,
                                session.getExecution().getTotalPromptTokens(),
                                session.getExecution().getTotalCompletionTokens(),
                                elapsed);
                        eventBus.publish(completedEvent);
                        notifyUsageListener(session, finishReason, elapsed);
                        return Flux.just((AgentEvent) completedEvent);
                    } else if (finalState == AgentState.ERROR) {
                        LifecycleEvent.SessionFailed failedEvent = new LifecycleEvent.SessionFailed(
                                session.getSessionId(), "INTERNAL", "Agent ended in ERROR state", false);
                        eventBus.publish(failedEvent);
                        return Flux.just((AgentEvent) failedEvent);
                    }
                    return Flux.empty();
                })).doOnComplete(() -> {
                    log.info("AgentEngine completed: sessionId={}, iterations={}, elapsed={}ms",
                            session.getSessionId(), session.getExecution().getIteration(),
                            session.getExecution().getElapsedMs());
                }).doOnError(e -> {
                    LifecycleEvent.SessionFailed failedEvent = new LifecycleEvent.SessionFailed(
                            session.getSessionId(), "INTERNAL", e.getMessage(), false);
                    eventBus.publish(failedEvent);
                    log.error("AgentEngine failed: sessionId={}", session.getSessionId(), e);
                });
    }

    /**
     * Notify the usage listener, never letting accounting failures break
     * the event stream.
     */
    private void notifyUsageListener(AgentSession session, String finishReason, long elapsed) {
        if (usageListener == null) {
            return;
        }
        try {
            usageListener.record(session, finishReason, elapsed);
        } catch (Exception e) {
            log.warn("Usage listener failed: sessionId={}", session.getSessionId(), e);
        }
    }

    /**
     * Execute the current state and recursively transition to the next.
     *
     * <p>
     * This is the core loop expressed as a reactive chain:
     * <ol>
     * <li>Get the handler for the current state</li>
     * <li>Execute it through the interceptor pipeline</li>
     * <li>Collect events, extracting the Transition</li>
     * <li>If terminal: complete; otherwise: recurse via concatWith(defer)</li>
     * </ol>
     */
    private Flux<AgentEvent> executeState(AgentSession session) {
        AgentState currentState = session.getCurrentState();

        // Terminal check
        if (currentState.isTerminal()) {
            return Flux.empty();
        }

        // Safety: iteration limit — suspend (not DONE) so the user can grant
        // another budget round via /chat/resume {action:"continue"}
        if (session.hasReachedMaxIterations()) {
            log.warn("AgentEngine: max iterations reached ({}), suspending",
                    session.getMaxIterations());
            session.getExecution().setSuspendReason("iteration_budget_exhausted");
            session.getExecution().transitionTo(AgentState.SUSPENDED);
            return Flux.just(Transition.toSuspended(session.getSessionId(), "iteration_budget_exhausted"));
        }

        // Find the handler for this state
        StateHandler handler = handlers.get(currentState);
        if (handler == null) {
            log.error("AgentEngine: no handler registered for state {}", currentState);
            session.getExecution().transitionTo(AgentState.ERROR);
            return Flux.just(Transition.toError(session.getSessionId(), "no_handler_for_" + currentState));
        }

        // Execute through the pipeline, collecting events and the transition.
        // Pass the REAL from/to pair (ExecutionState tracks the last state) so
        // interceptors can observe true transition boundaries (ACT→OBSERVE etc.).
        AgentState transitionFromState = session.getExecution().getLastState();
        return pipeline.execute(session, transitionFromState, currentState, handler)
                .doOnNext(event -> {
                    // Publish non-internal events to the EventBus
                    if (!(event instanceof Transition)) {
                        eventBus.publish(event);
                    }
                })
                .windowUntil(event -> event instanceof Transition, true)
                .concatMap(window -> window.collectList().flatMapMany(events -> {
                    // Find the transition in this window
                    Transition transition = null;
                    for (AgentEvent event : events) {
                        if (event instanceof Transition) {
                            transition = (Transition) event;
                        }
                    }

                    // Emit non-transition events
                    Flux<AgentEvent> emitted = Flux.fromIterable(events)
                            .filter(e -> !(e instanceof Transition));

                    if (transition == null) {
                        // A handler that completes without a Transition is a stuck
                        // state — fail loudly instead of silently ending the stream
                        // without a SessionCompleted/Failed lifecycle event. The raw
                        // Transition is intentionally NOT emitted (it is internal);
                        // buildFlux() sees ERROR and emits SessionFailed.
                        log.error("AgentEngine: handler for state {} completed without a transition — marking session {} ERROR",
                                currentState, session.getSessionId());
                        session.getExecution().transitionTo(AgentState.ERROR);
                        return emitted;
                    }

                    // Apply the transition
                    AgentState nextState = transition.getNextState();
                    AgentState fromState = session.getCurrentState();
                    if (nextState == AgentState.SUSPENDED) {
                        session.getExecution().setSuspendReason(transition.getReason());
                    }
                    session.getExecution().transitionTo(nextState);

                    // Emit state transition event for observability
                    StateEvent.StateTransition stateTransitionEvent = new StateEvent.StateTransition(
                            session.getSessionId(), fromState, nextState,
                            session.getExecution().getIteration());
                    eventBus.publish(stateTransitionEvent);

                    log.debug("AgentEngine: {} → {} (reason: {})",
                            fromState, nextState, transition.getReason());

                    if (nextState.isTerminal()) {
                        // Terminal state: emit remaining events + transition event and complete
                        return Flux.concat(emitted, Flux.just(stateTransitionEvent));
                    }

                    // Non-terminal: emit events then recurse
                    return Flux.concat(
                            emitted,
                            Flux.just(stateTransitionEvent),
                            Flux.defer(() -> executeState(session)));
                }));
    }
}
