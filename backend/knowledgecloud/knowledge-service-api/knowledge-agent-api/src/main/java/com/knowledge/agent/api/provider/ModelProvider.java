package com.knowledge.agent.api.provider;

import com.knowledge.agent.api.dto.ChatTool;
import com.knowledge.agent.api.dto.ChatMessage;
import reactor.core.publisher.Flux;

import java.util.List;

/**
 * Model provider interface for AI models.
 * Supports pluggable implementations for different AI providers (DeepSeek,
 * Claude, GPT-4, etc.).
 */
public interface ModelProvider {

    /**
     * Returns the provider name (e.g., "deepseek", "claude", "gpt-4")
     */
    String getProviderName();

    /**
     * Returns the default model name for this provider
     */
    String getDefaultModel();

    /**
     * Returns list of available models for this provider
     */
    List<String> getAvailableModels();

    /**
     * Synchronous chat completion without tools
     */
    String chat(String userMessage);

    /**
     * Synchronous chat completion with full message history
     */
    String chatWithMessages(List<ChatMessage> messages);

    /**
     * Synchronous chat completion with tools
     */
    String chatWithTools(List<ChatMessage> messages, List<ChatTool> tools);

    /**
     * Synchronous chat completion returning full response (including tool calls)
     */
    ChatMessageBody chatFull(List<ChatMessage> messages, List<ChatTool> tools);

    /**
     * Streaming chat completion
     */
    Flux<ChatChunk> streamChunks(List<ChatMessage> messages, List<ChatTool> tools);

    /**
     * Chat message body with tool call support
     */
    class ChatMessageBody {
        private String role;
        private String content;
        private String reasoningContent;
        private List<ToolCall> toolCalls;
        private String toolCallId; // for role=tool messages

        public ChatMessageBody() {
        }

        public ChatMessageBody(String role, String content, List<ToolCall> toolCalls) {
            this.role = role;
            this.content = content;
            this.toolCalls = toolCalls;
        }

        public String getRole() {
            return role;
        }

        public void setRole(String role) {
            this.role = role;
        }

        public String getContent() {
            return content;
        }

        public void setContent(String content) {
            this.content = content;
        }

        public String getReasoningContent() {
            return reasoningContent;
        }

        public void setReasoningContent(String reasoningContent) {
            this.reasoningContent = reasoningContent;
        }

        public List<ToolCall> getToolCalls() {
            return toolCalls;
        }

        public void setToolCalls(List<ToolCall> toolCalls) {
            this.toolCalls = toolCalls;
        }

        public String getToolCallId() {
            return toolCallId;
        }

        public void setToolCallId(String toolCallId) {
            this.toolCallId = toolCallId;
        }
    }

    /**
     * Tool call from model response
     */
    class ToolCall {
        private String id;
        private String type;
        private String name;
        private String arguments;
        private Integer index;

        public ToolCall() {
        }

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public String getArguments() {
            return arguments;
        }

        public void setArguments(String arguments) {
            this.arguments = arguments;
        }

        public Integer getIndex() {
            return index;
        }

        public void setIndex(Integer index) {
            this.index = index;
        }
    }

    /**
     * Streaming chat chunk
     */
    class ChatChunk {
        private List<Choice> choices;

        public List<Choice> getChoices() {
            return choices;
        }

        public void setChoices(List<Choice> choices) {
            this.choices = choices;
        }

        public static class Choice {
            private Delta delta;
            private String finishReason;

            public Delta getDelta() {
                return delta;
            }

            public void setDelta(Delta delta) {
                this.delta = delta;
            }

            public String getFinishReason() {
                return finishReason;
            }

            public void setFinishReason(String finishReason) {
                this.finishReason = finishReason;
            }
        }

        public static class Delta {
            private String content;
            private String reasoningContent;
            private String role;
            private List<ToolCall> toolCalls;

            public String getContent() {
                return content;
            }

            public void setContent(String content) {
                this.content = content;
            }

            public String getReasoningContent() {
                return reasoningContent;
            }

            public void setReasoningContent(String reasoningContent) {
                this.reasoningContent = reasoningContent;
            }

            public String getRole() {
                return role;
            }

            public void setRole(String role) {
                this.role = role;
            }

            public List<ToolCall> getToolCalls() {
                return toolCalls;
            }

            public void setToolCalls(List<ToolCall> toolCalls) {
                this.toolCalls = toolCalls;
            }
        }
    }
}
