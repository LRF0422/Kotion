package com.knowledge.agent.core.engine;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Base class for streaming events in the agent engine.
 * Represents structured events that can be converted to various wire formats
 * (SSE, Data Stream Protocol v2, etc.)
 */
public abstract class StreamEvent {

    /**
     * Returns the event type identifier.
     */
    public abstract String getType();

    // -------------------------------------------------------------------------
    // Text delta event: 0:"content"
    // -------------------------------------------------------------------------

    /**
     * Text content delta event.
     * Data Stream Protocol v2 format: 0:"content"
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TextEvent extends StreamEvent {
        private String content;

        @Override
        public String getType() {
            return "text";
        }
    }

    // -------------------------------------------------------------------------
    // Reasoning content delta event (DeepSeek thinking mode)
    // -------------------------------------------------------------------------

    /**
     * Chain-of-thought reasoning delta event.
     * DeepSeek thinking mode outputs reasoning_content alongside content.
     * The frontend can display this in a collapsible "thinking" section.
     * SSE format: {"choices":[{"delta":{"reasoning_content":"..."}}]}
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ReasoningEvent extends StreamEvent {
        private String reasoningContent;

        @Override
        public String getType() {
            return "reasoning";
        }
    }

    // -------------------------------------------------------------------------
    // Tool call event: 9:{"toolCallId":"x","toolName":"fn","args":{}}
    // -------------------------------------------------------------------------

    /**
     * Tool call start event.
     * Data Stream Protocol v2 format:
     * 9:{"toolCallId":"x","toolName":"fn","args":{}}
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ToolCallEvent extends StreamEvent {
        private String toolCallId;
        private String toolName;
        private String args;

        @Override
        public String getType() {
            return "tool_call";
        }
    }

    // -------------------------------------------------------------------------
    // Tool result event: a:{"toolCallId":"x","result":"..."}
    // -------------------------------------------------------------------------

    /**
     * Tool execution result event.
     * Data Stream Protocol v2 format: a:{"toolCallId":"x","result":"..."}
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ToolResultEvent extends StreamEvent {
        private String toolCallId;
        private Object result;

        @Override
        public String getType() {
            return "tool_result";
        }
    }

    // -------------------------------------------------------------------------
    // Finish event: e:{"finishReason":"stop","usage":{...}}
    // -------------------------------------------------------------------------

    /**
     * Stream finish event with usage statistics.
     * Data Stream Protocol v2 format:
     * e:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FinishEvent extends StreamEvent {
        private String finishReason;
        private Integer promptTokens;
        private Integer completionTokens;

        @Override
        public String getType() {
            return "finish";
        }
    }

    // -------------------------------------------------------------------------
    // Error event: d:{"error":"message"}
    // -------------------------------------------------------------------------

    /**
     * Error event.
     * Data Stream Protocol v2 format: d:{"error":"message"}
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ErrorEvent extends StreamEvent {
        private String error;

        @Override
        public String getType() {
            return "error";
        }
    }

    // -------------------------------------------------------------------------
    // Data annotation event: 8:[{...}]
    // -------------------------------------------------------------------------

    /**
     * Data/annotation event for metadata like team activity.
     * Data Stream Protocol v2 format: 8:[{...}]
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DataEvent extends StreamEvent {
        private List<Object> data;

        @Override
        public String getType() {
            return "data";
        }
    }
}
