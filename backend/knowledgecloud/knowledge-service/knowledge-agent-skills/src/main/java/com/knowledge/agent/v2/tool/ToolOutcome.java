package com.knowledge.agent.v2.tool;

/**
 * Outcome of a tool execution.
 *
 * <p>Unified result type that replaces V1's disparate result handling.
 * Every tool execution produces exactly one {@code ToolOutcome} with a
 * clear status discriminator.
 */
public class ToolOutcome {

    public enum Status {
        SUCCESS,
        ERROR,
        TIMEOUT,
        CANCELLED
    }

    private final String toolCallId;
    private final String toolName;
    private final Status status;
    private final String output;
    private final String errorMessage;
    private final long durationMs;

    private ToolOutcome(Builder builder) {
        this.toolCallId = builder.toolCallId;
        this.toolName = builder.toolName;
        this.status = builder.status;
        this.output = builder.output;
        this.errorMessage = builder.errorMessage;
        this.durationMs = builder.durationMs;
    }

    public String getToolCallId() { return toolCallId; }
    public String getToolName() { return toolName; }
    public Status getStatus() { return status; }
    public String getOutput() { return output; }
    public String getErrorMessage() { return errorMessage; }
    public long getDurationMs() { return durationMs; }

    public boolean isSuccess() { return status == Status.SUCCESS; }

    /**
     * Get the content to append to the conversation (for the tool result message).
     */
    public String getContentForMessage() {
        if (isSuccess()) {
            return output != null ? output : "";
        }
        return errorMessage != null ? errorMessage : "Error: " + status.name();
    }

    // ---- Factory methods ----

    public static ToolOutcome success(String toolCallId, String toolName, String output, long durationMs) {
        return new Builder().toolCallId(toolCallId).toolName(toolName)
                .status(Status.SUCCESS).output(output).durationMs(durationMs).build();
    }

    public static ToolOutcome error(String toolCallId, String toolName, String message, long durationMs) {
        return new Builder().toolCallId(toolCallId).toolName(toolName)
                .status(Status.ERROR).errorMessage(message).durationMs(durationMs).build();
    }

    public static ToolOutcome timeout(String toolCallId, String toolName, long timeoutSeconds, long durationMs) {
        return new Builder().toolCallId(toolCallId).toolName(toolName)
                .status(Status.TIMEOUT)
                .errorMessage("Tool " + toolName + " timed out after " + timeoutSeconds + "s")
                .durationMs(durationMs).build();
    }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private String toolCallId;
        private String toolName;
        private Status status;
        private String output;
        private String errorMessage;
        private long durationMs;

        public Builder toolCallId(String val) { this.toolCallId = val; return this; }
        public Builder toolName(String val) { this.toolName = val; return this; }
        public Builder status(Status val) { this.status = val; return this; }
        public Builder output(String val) { this.output = val; return this; }
        public Builder errorMessage(String val) { this.errorMessage = val; return this; }
        public Builder durationMs(long val) { this.durationMs = val; return this; }

        public ToolOutcome build() { return new ToolOutcome(this); }
    }
}
