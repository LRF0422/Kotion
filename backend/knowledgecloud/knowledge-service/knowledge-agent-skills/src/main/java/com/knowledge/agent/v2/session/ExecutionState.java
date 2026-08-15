package com.knowledge.agent.v2.session;

import com.knowledge.agent.v2.engine.AgentState;
import com.knowledge.agent.v2.llm.InferenceResponse;

import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Mutable execution state within an {@link AgentSession}.
 *
 * <p>
 * This is the ONLY mutable part of the session model. All mutations
 * go through atomic operations or synchronized methods to ensure
 * thread-safety in the reactive execution environment.
 *
 * <p>
 * The execution state tracks:
 * <ul>
 * <li>Current iteration number</li>
 * <li>Current state machine state</li>
 * <li>Activated skill names</li>
 * <li>Working messages (conversation context)</li>
 * <li>Accumulated token usage</li>
 * </ul>
 */
public class ExecutionState {

    private final AtomicInteger iteration = new AtomicInteger(0);
    private final AtomicReference<AgentState> currentState = new AtomicReference<>(AgentState.INIT);
    /**
     * The state the engine left when it entered {@link #currentState} — the
     * real {@code from} side of the transition. Lets interceptors observe true
     * transition boundaries (e.g. ACT→OBSERVE) instead of a flattened
     * from==to pair.
     */
    private final AtomicReference<AgentState> lastState = new AtomicReference<>(AgentState.INIT);
    /**
     * Child-agent engine subscriptions spawned by delegated tasks, keyed for
     * cooperative cancellation: disposing the parent must cascade to children.
     */
    private final Set<reactor.core.Disposable> childSubscriptions = Collections.synchronizedSet(new LinkedHashSet<>());
    private final Set<String> activatedSkillNames = Collections.synchronizedSet(new LinkedHashSet<>());
    private final List<ConversationMessage> workingMessages = Collections.synchronizedList(new ArrayList<>());
    private final AtomicInteger totalPromptTokens = new AtomicInteger(0);
    private final AtomicInteger totalCompletionTokens = new AtomicInteger(0);
    /**
     * Provider context-cache accounting accumulated across iterations — the
     * cost-observability signal for how many prompt tokens hit the cache.
     */
    private final AtomicInteger totalPromptCacheHitTokens = new AtomicInteger(0);
    private final AtomicInteger totalPromptCacheMissTokens = new AtomicInteger(0);
    /**
     * Prompt token count reported by the provider for the MOST RECENT
     * inference call — the authoritative measure of the current context
     * size. 0 until the first usage report arrives.
     */
    private volatile int lastPromptTokens = 0;
    /**
     * Reason for the most recent SUSPENDED transition (e.g.
     * "frontend_tool_calls", "iteration_budget_exhausted"). Lets the
     * completion event tell the frontend WHY the session paused.
     */
    private volatile String suspendReason;
    private final long startTimeMs = System.currentTimeMillis();
    private volatile List<InferenceResponse.ToolCallData> pendingToolCalls;

    /**
     * Increment and return the new iteration number.
     */
    public int nextIteration() {
        return iteration.incrementAndGet();
    }

    public int getIteration() {
        return iteration.get();
    }

    public void setIteration(int value) {
        iteration.set(value);
    }

    public AgentState getCurrentState() {
        return currentState.get();
    }

    public void transitionTo(AgentState newState) {
        AgentState previous = currentState.get();
        lastState.set(previous);
        currentState.set(newState);
    }

    /** The state that was active before the current one (real transition {@code from}). */
    public AgentState getLastState() {
        return lastState.get();
    }

    public void activateSkill(String skillName) {
        if (skillName != null) {
            activatedSkillNames.add(skillName);
        }
    }

    public Set<String> getActivatedSkillNames() {
        synchronized (activatedSkillNames) {
            return new LinkedHashSet<>(activatedSkillNames);
        }
    }

    public void addMessage(ConversationMessage message) {
        if (message != null) {
            workingMessages.add(message);
        }
    }

    public void setMessages(List<ConversationMessage> messages) {
        synchronized (workingMessages) {
            workingMessages.clear();
            if (messages != null) {
                workingMessages.addAll(messages);
            }
        }
    }

    public List<ConversationMessage> getMessages() {
        synchronized (workingMessages) {
            return new ArrayList<>(workingMessages);
        }
    }

    public int getMessageCount() {
        return workingMessages.size();
    }

    public void addTokenUsage(int promptTokens, int completionTokens) {
        totalPromptTokens.addAndGet(promptTokens);
        totalCompletionTokens.addAndGet(completionTokens);
    }

    public int getTotalPromptTokens() {
        return totalPromptTokens.get();
    }

    public void addCacheUsage(int promptCacheHitTokens, int promptCacheMissTokens) {
        if (promptCacheHitTokens > 0) {
            totalPromptCacheHitTokens.addAndGet(promptCacheHitTokens);
        }
        if (promptCacheMissTokens > 0) {
            totalPromptCacheMissTokens.addAndGet(promptCacheMissTokens);
        }
    }

    public int getTotalPromptCacheHitTokens() {
        return totalPromptCacheHitTokens.get();
    }

    public int getTotalPromptCacheMissTokens() {
        return totalPromptCacheMissTokens.get();
    }

    public int getTotalCompletionTokens() {
        return totalCompletionTokens.get();
    }

    public int getLastPromptTokens() {
        return lastPromptTokens;
    }

    public void setLastPromptTokens(int promptTokens) {
        this.lastPromptTokens = promptTokens;
    }

    public String getSuspendReason() {
        return suspendReason;
    }

    public void setSuspendReason(String suspendReason) {
        this.suspendReason = suspendReason;
    }

    public long getElapsedMs() {
        return System.currentTimeMillis() - startTimeMs;
    }

    public long getStartTimeMs() {
        return startTimeMs;
    }

    // ---- Pending tool calls (from ThinkHandler → ActHandler) ----

    public void setPendingToolCalls(List<InferenceResponse.ToolCallData> calls) {
        this.pendingToolCalls = calls;
    }

    public List<InferenceResponse.ToolCallData> getPendingToolCalls() {
        return pendingToolCalls;
    }

    public void clearPendingToolCalls() {
        this.pendingToolCalls = null;
    }

    // ---- Child-agent subscriptions (cooperative cancellation) ----

    public void registerChildSubscription(reactor.core.Disposable disposable) {
        if (disposable != null) {
            childSubscriptions.add(disposable);
        }
    }

    public void removeChildSubscription(reactor.core.Disposable disposable) {
        if (disposable != null) {
            childSubscriptions.remove(disposable);
        }
    }

    /** Dispose (cancel) every delegated child-agent execution still running. */
    public void cancelChildSubscriptions() {
        synchronized (childSubscriptions) {
            for (reactor.core.Disposable d : new ArrayList<>(childSubscriptions)) {
                try {
                    if (!d.isDisposed()) {
                        d.dispose();
                    }
                } catch (Exception ignored) {
                    // best-effort cascade
                }
            }
            childSubscriptions.clear();
        }
    }
}
