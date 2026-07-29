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
    private final Set<String> activatedSkillNames = Collections.synchronizedSet(new LinkedHashSet<>());
    private final List<ConversationMessage> workingMessages = Collections.synchronizedList(new ArrayList<>());
    private final AtomicInteger totalPromptTokens = new AtomicInteger(0);
    private final AtomicInteger totalCompletionTokens = new AtomicInteger(0);
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
        currentState.set(newState);
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
}
