package com.knowledge.agent.llm;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Streaming chunk DTO.
 * Each chunk represents a delta from the LLM streaming response.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StreamChunk {

    /**
     * Chunk type: "content", "tool_call", "done".
     */
    private String type;

    /**
     * Text content delta (for type="content").
     */
    private String content;

    /**
     * Tool call ID (for type="tool_call").
     */
    private String toolCallId;

    /**
     * Tool call name (for type="tool_call").
     */
    private String toolCallName;

    /**
     * Tool call arguments delta (for type="tool_call").
     */
    private String toolCallArgumentsDelta;

    /**
     * Tool call index from streaming delta (for type="tool_call").
     * Used to associate subsequent chunks with the initial tool call when
     * the streaming API omits the "id" field on continuation chunks.
     */
    private Integer toolCallIndex;

    /**
     * Reasoning content delta from thinking mode (for type="reasoning_content").
     * DeepSeek returns chain-of-thought reasoning via this field, which must
     * be passed back in subsequent requests when tool_calls are involved.
     */
    private String reasoningContent;

    /**
     * Token usage (for type="done").
     */
    private LlmResponse.Usage usage;

    /**
     * Finish reason (for type="done").
     */
    private String finishReason;

    // ---- Factory methods ----

    public static StreamChunk content(String delta) {
        return StreamChunk.builder()
                .type("content")
                .content(delta != null ? delta : "")
                .build();
    }

    public static StreamChunk reasoningContent(String delta) {
        return StreamChunk.builder()
                .type("reasoning_content")
                .reasoningContent(delta != null ? delta : "")
                .build();
    }

    public static StreamChunk toolCall(String id, String name, String argsDelta, Integer index) {
        return StreamChunk.builder()
                .type("tool_call")
                .toolCallId(id)
                .toolCallName(name)
                .toolCallArgumentsDelta(argsDelta != null ? argsDelta : "")
                .toolCallIndex(index)
                .build();
    }

    public static StreamChunk done(String finishReason, LlmResponse.Usage usage) {
        return StreamChunk.builder()
                .type("done")
                .finishReason(finishReason)
                .usage(usage)
                .build();
    }
}
