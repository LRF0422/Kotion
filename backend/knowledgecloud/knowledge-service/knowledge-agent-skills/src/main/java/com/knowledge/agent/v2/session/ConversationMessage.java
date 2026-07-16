package com.knowledge.agent.v2.session;

import java.util.List;
import java.util.Map;

/**
 * Immutable conversation message (replaces mutable ChatMessage in the V2 model).
 *
 * <p>Represents a single message in the conversation history. Messages are
 * immutable value objects — once created, they cannot be modified. This
 * eliminates the race conditions found in the V1 architecture where
 * ChatMessage objects were shared between threads.
 */
public class ConversationMessage {

    private final String role;        // "system", "user", "assistant", "tool"
    private final String content;
    private final String name;        // tool name (for role="tool")
    private final String toolCallId;  // tool call ID (for role="tool")
    private final String reasoningContent;  // thinking/reasoning (for role="assistant")
    private final List<ToolCallInfo> toolCalls;  // tool calls (for role="assistant")

    private ConversationMessage(Builder builder) {
        this.role = builder.role;
        this.content = builder.content;
        this.name = builder.name;
        this.toolCallId = builder.toolCallId;
        this.reasoningContent = builder.reasoningContent;
        this.toolCalls = builder.toolCalls;
    }

    public String getRole() {
        return role;
    }

    public String getContent() {
        return content;
    }

    public String getName() {
        return name;
    }

    public String getToolCallId() {
        return toolCallId;
    }

    public String getReasoningContent() {
        return reasoningContent;
    }

    public List<ToolCallInfo> getToolCalls() {
        return toolCalls;
    }

    public static Builder builder() {
        return new Builder();
    }

    // ---- Builder ----

    public static class Builder {
        private String role;
        private String content;
        private String name;
        private String toolCallId;
        private String reasoningContent;
        private List<ToolCallInfo> toolCalls;

        public Builder role(String role) {
            this.role = role;
            return this;
        }

        public Builder content(String content) {
            this.content = content;
            return this;
        }

        public Builder name(String name) {
            this.name = name;
            return this;
        }

        public Builder toolCallId(String toolCallId) {
            this.toolCallId = toolCallId;
            return this;
        }

        public Builder reasoningContent(String reasoningContent) {
            this.reasoningContent = reasoningContent;
            return this;
        }

        public Builder toolCalls(List<ToolCallInfo> toolCalls) {
            this.toolCalls = toolCalls;
            return this;
        }

        public ConversationMessage build() {
            return new ConversationMessage(this);
        }
    }

    // ---- Nested types ----

    /**
     * Represents a tool call within an assistant message.
     */
    public static class ToolCallInfo {
        private final String id;
        private final String type;  // "function"
        private final String functionName;
        private final String functionArguments;

        public ToolCallInfo(String id, String type, String functionName, String functionArguments) {
            this.id = id;
            this.type = type;
            this.functionName = functionName;
            this.functionArguments = functionArguments;
        }

        public String getId() {
            return id;
        }

        public String getType() {
            return type;
        }

        public String getFunctionName() {
            return functionName;
        }

        public String getFunctionArguments() {
            return functionArguments;
        }
    }

    // ---- Factory methods ----

    public static ConversationMessage system(String content) {
        return builder().role("system").content(content).build();
    }

    public static ConversationMessage user(String content) {
        return builder().role("user").content(content).build();
    }

    public static ConversationMessage assistant(String content) {
        return builder().role("assistant").content(content).build();
    }

    public static ConversationMessage toolResult(String toolCallId, String toolName, String content) {
        return builder().role("tool").toolCallId(toolCallId).name(toolName).content(content).build();
    }
}
