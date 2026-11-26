package com.knowledge.agent.core.state;

/**
 * Stable business code + message for runtime-state operations (tool ledger,
 * forms, approvals, active-run discovery).
 */
public class AgentStateException extends RuntimeException {

    private final String code;

    public AgentStateException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}