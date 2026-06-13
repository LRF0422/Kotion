package com.knowledge.agent.harness;

import com.knowledge.agent.core.engine.StreamEvent;
import com.knowledge.agent.llm.LlmResponse;
import com.knowledge.agent.llm.StreamChunk;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Incremental assembler for one LLM streaming turn.
 *
 * <p>This is the streaming counterpart of the old
 * {@code HarnessLoop.assembleResponse(List&lt;StreamChunk&gt;)}: instead of
 * collecting the whole stream into a list and assembling at the end (which
 * defeated token-level streaming), the harness now {@link #feed(StreamChunk)}s
 * each chunk as it arrives — emitting live deltas via
 * {@link #toDeltaEvent(StreamChunk)} — and calls {@link #assemble()} only once
 * the stream completes, to obtain the full content + tool calls needed to drive
 * the loop and build the assistant message.
 *
 * <p>One instance per iteration. Not shared across iterations or threads — a
 * single LLM stream is consumed on one reactive chain.
 */
public class ResponseAccumulator {

    private final StringBuilder content = new StringBuilder();
    private final StringBuilder reasoningContent = new StringBuilder();

    /** tool-call index → id, captured from the first chunk that carries both. */
    private final Map<Integer, String> indexToId = new LinkedHashMap<>();
    /** effective tool-call id → accumulated raw argument JSON. Insertion order = emit order. */
    private final Map<String, StringBuilder> toolCallArgs = new LinkedHashMap<>();
    /** effective tool-call id → function name. */
    private final Map<String, String> toolCallNames = new LinkedHashMap<>();

    private String finishReason = "stop";
    private LlmResponse.Usage usage = LlmResponse.Usage.builder().build();

    /**
     * Accumulate a single chunk into the running response state. Mirrors the
     * original assembleResponse() switch exactly so behaviour is identical.
     */
    public void feed(StreamChunk chunk) {
        if (chunk == null || chunk.getType() == null) {
            return;
        }
        switch (chunk.getType()) {
            case "content":
                if (chunk.getContent() != null) {
                    content.append(chunk.getContent());
                }
                break;
            case "reasoning_content":
                if (chunk.getReasoningContent() != null) {
                    reasoningContent.append(chunk.getReasoningContent());
                }
                break;
            case "tool_call": {
                String id = chunk.getToolCallId();
                Integer idx = chunk.getToolCallIndex();

                // First chunk of a tool call carries both id and index
                if (id != null && !id.isEmpty() && idx != null) {
                    indexToId.put(idx, id);
                }

                // Resolve effective id: prefer explicit id, fall back to index lookup
                String effectiveId = (id != null && !id.isEmpty())
                        ? id
                        : (idx != null ? indexToId.get(idx) : null);

                if (effectiveId != null) {
                    if (chunk.getToolCallName() != null && !chunk.getToolCallName().isEmpty()) {
                        // Start of a new tool call: (re)initialise the args buffer
                        toolCallArgs.put(effectiveId, new StringBuilder());
                        toolCallNames.put(effectiveId, chunk.getToolCallName());
                    }
                    if (chunk.getToolCallArgumentsDelta() != null) {
                        toolCallArgs.computeIfAbsent(effectiveId, k -> new StringBuilder())
                                .append(chunk.getToolCallArgumentsDelta());
                    }
                }
                break;
            }
            case "done":
                if (chunk.getFinishReason() != null) {
                    finishReason = chunk.getFinishReason();
                }
                if (chunk.getUsage() != null) {
                    usage = chunk.getUsage();
                }
                break;
            default:
                break;
        }
    }

    /**
     * Map a raw chunk to a live delta event to forward to the client, or
     * {@code null} if the chunk produces no user-visible delta (tool-call
     * fragments and the terminal "done" chunk accumulate silently — tool calls
     * are surfaced after assembly when the loop dispatches them).
     */
    public static StreamEvent toDeltaEvent(StreamChunk chunk) {
        if (chunk == null || chunk.getType() == null) {
            return null;
        }
        switch (chunk.getType()) {
            case "content":
                if (chunk.getContent() != null && !chunk.getContent().isEmpty()) {
                    return StreamEvent.TextEvent.builder().content(chunk.getContent()).build();
                }
                return null;
            case "reasoning_content":
                if (chunk.getReasoningContent() != null && !chunk.getReasoningContent().isEmpty()) {
                    return StreamEvent.ReasoningEvent.builder()
                            .reasoningContent(chunk.getReasoningContent())
                            .build();
                }
                return null;
            default:
                return null;
        }
    }

    /**
     * Build the final {@link LlmResponse} from everything accumulated so far.
     * Call once after the LLM stream completes.
     */
    public LlmResponse assemble() {
        List<LlmResponse.ToolCall> toolCalls = new ArrayList<>();
        for (Map.Entry<String, StringBuilder> entry : toolCallArgs.entrySet()) {
            String name = toolCallNames.getOrDefault(entry.getKey(), "");
            toolCalls.add(LlmResponse.ToolCall.builder()
                    .id(entry.getKey())
                    .name(name)
                    .arguments(entry.getValue().toString())
                    .build());
        }
        return LlmResponse.builder()
                .content(content.toString())
                .reasoningContent(reasoningContent.toString())
                .toolCalls(toolCalls)
                .finishReason(finishReason)
                .usage(usage)
                .build();
    }
}
