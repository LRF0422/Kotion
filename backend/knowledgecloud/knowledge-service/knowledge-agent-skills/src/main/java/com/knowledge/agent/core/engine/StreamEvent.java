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
     * Monotonic per-turn sequence number, stamped by the transport layer just
     * before the event is sent. Used as the SSE {@code id:} for resumable
     * streaming (Last-Event-ID replay). {@code -1} means "not yet stamped".
     */
    private long seq = -1L;

    /**
     * Wall-clock timestamp (epoch millis) when the event was stamped for send.
     * {@code 0} means "not yet stamped".
     */
    private long ts = 0L;

    public long getSeq() {
        return seq;
    }

    public void setSeq(long seq) {
        this.seq = seq;
    }

    public long getTs() {
        return ts;
    }

    public void setTs(long ts) {
        this.ts = ts;
    }

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

        /**
         * Machine-readable error class name (see {@code AgentErrorCode}).
         * Optional — null on legacy/unclassified errors, omitted from the wire
         * when null so older clients are unaffected.
         */
        private String code;

        /**
         * Whether the client may retry. Optional (nullable); omitted from the
         * wire when null.
         */
        private Boolean retriable;

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
