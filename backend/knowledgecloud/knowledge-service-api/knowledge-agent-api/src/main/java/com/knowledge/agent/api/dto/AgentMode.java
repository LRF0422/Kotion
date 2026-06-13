package com.knowledge.agent.api.dto;

/**
 * Agent run mode (P7).
 *
 * <ul>
 *   <li>{@link #EXECUTE} — normal operation; all tools available.</li>
 *   <li>{@link #PLAN} — read-only research; the agent may only call non-mutating
 *       tools and must finish by proposing a plan via {@code present_plan},
 *       which pauses for user approval.</li>
 * </ul>
 */
public enum AgentMode {
    EXECUTE,
    PLAN;

    /**
     * Parse a wire value ({@code "plan"} / {@code "execute"} / null) into a mode.
     * Defaults to {@link #EXECUTE} for null/unknown values.
     */
    public static AgentMode from(String value) {
        if (value == null) {
            return EXECUTE;
        }
        return "plan".equalsIgnoreCase(value.trim()) ? PLAN : EXECUTE;
    }
}
