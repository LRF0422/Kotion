package com.knowledge.agent.core.engine;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Encodes StreamEvent objects to various wire formats:
 * - Data Stream Protocol v2 (Vercel AI SDK)
 * - SSE (OpenAI-compatible)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataStreamEncoder {

    private final ObjectMapper objectMapper;

    // -------------------------------------------------------------------------
    // Data Stream Protocol v2 Encoding
    // -------------------------------------------------------------------------

    /**
     * Encodes a StreamEvent to Data Stream Protocol v2 format.
     * 
     * Protocol codes:
     * - 0: text delta
     * - 8: data/annotations
     * - 9: tool call start
     * - a: tool result
     * - d: error
     * - e: finish with metadata
     */
    public String encodeDataStream(StreamEvent event) {
        // SubAgentEvent: unwrap the inner event and inject agentId
        if (event instanceof SubAgentEvent) {
            return encodeSubAgentDataStream((SubAgentEvent) event);
        }
        if (event instanceof StreamEvent.TextEvent) {
            return encodeTextDataStream((StreamEvent.TextEvent) event);
        } else if (event instanceof StreamEvent.ReasoningEvent) {
            return encodeReasoningDataStream((StreamEvent.ReasoningEvent) event);
        } else if (event instanceof StreamEvent.ToolCallEvent) {
            return encodeToolCallDataStream((StreamEvent.ToolCallEvent) event);
        } else if (event instanceof StreamEvent.ToolResultEvent) {
            return encodeToolResultDataStream((StreamEvent.ToolResultEvent) event);
        } else if (event instanceof StreamEvent.FinishEvent) {
            return encodeFinishDataStream((StreamEvent.FinishEvent) event);
        } else if (event instanceof StreamEvent.ErrorEvent) {
            return encodeErrorDataStream((StreamEvent.ErrorEvent) event);
        } else if (event instanceof StreamEvent.DataEvent) {
            return encodeDataEventDataStream((StreamEvent.DataEvent) event);
        }
        return "";
    }

    private String encodeTextDataStream(StreamEvent.TextEvent event) {
        String content = event.getContent();
        if (content == null) {
            content = "";
        }
        return "0:\"" + escapeForDataStream(content) + "\"\n";
    }

    private String encodeReasoningDataStream(StreamEvent.ReasoningEvent event) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("reasoningContent", event.getReasoningContent() != null ? event.getReasoningContent() : "");
            return "g:" + objectMapper.writeValueAsString(payload) + "\n";
        } catch (JsonProcessingException e) {
            log.error("Failed to encode reasoning event", e);
            return "";
        }
    }

    private String encodeToolCallDataStream(StreamEvent.ToolCallEvent event) {
        try {
            Map<String, Object> payload = new LinkedHashMap<String, Object>();
            payload.put("toolCallId", event.getToolCallId());
            payload.put("toolName", event.getToolName());
            if (event.getArgs() != null && !event.getArgs().isEmpty()) {
                try {
                    Object argsObj = objectMapper.readValue(event.getArgs(), Object.class);
                    payload.put("args", argsObj);
                } catch (Exception e) {
                    payload.put("args", event.getArgs());
                }
            } else {
                payload.put("args", new LinkedHashMap<String, Object>());
            }
            return "9:" + objectMapper.writeValueAsString(payload) + "\n";
        } catch (JsonProcessingException e) {
            log.error("Failed to encode tool call event", e);
            return "";
        }
    }

    private String encodeToolResultDataStream(StreamEvent.ToolResultEvent event) {
        try {
            Map<String, Object> payload = new LinkedHashMap<String, Object>();
            payload.put("toolCallId", event.getToolCallId());
            payload.put("result", event.getResult());
            return "a:" + objectMapper.writeValueAsString(payload) + "\n";
        } catch (JsonProcessingException e) {
            log.error("Failed to encode tool result event", e);
            return "";
        }
    }

    private String encodeFinishDataStream(StreamEvent.FinishEvent event) {
        try {
            Map<String, Object> payload = new LinkedHashMap<String, Object>();
            payload.put("finishReason", event.getFinishReason() != null ? event.getFinishReason() : "stop");
            Map<String, Object> usage = new LinkedHashMap<String, Object>();
            usage.put("promptTokens", event.getPromptTokens() != null ? event.getPromptTokens() : 0);
            usage.put("completionTokens", event.getCompletionTokens() != null ? event.getCompletionTokens() : 0);
            payload.put("usage", usage);
            return "e:" + objectMapper.writeValueAsString(payload) + "\n";
        } catch (JsonProcessingException e) {
            log.error("Failed to encode finish event", e);
            return "e:{\"finishReason\":\"stop\",\"usage\":{\"promptTokens\":0,\"completionTokens\":0}}\n";
        }
    }

    private String encodeErrorDataStream(StreamEvent.ErrorEvent event) {
        try {
            Map<String, Object> payload = new LinkedHashMap<String, Object>();
            payload.put("error", event.getError() != null ? event.getError() : "Unknown error");
            // Optional structured fields — omitted when null so older clients
            // see the exact same frame as before.
            if (event.getCode() != null) {
                payload.put("code", event.getCode());
            }
            if (event.getRetriable() != null) {
                payload.put("retriable", event.getRetriable());
            }
            return "d:" + objectMapper.writeValueAsString(payload) + "\n";
        } catch (JsonProcessingException e) {
            log.error("Failed to encode error event", e);
            return "d:{\"error\":\"" + escapeForDataStream(event.getError()) + "\"}\n";
        }
    }

    private String encodeDataEventDataStream(StreamEvent.DataEvent event) {
        try {
            return "8:" + objectMapper.writeValueAsString(event.getData()) + "\n";
        } catch (JsonProcessingException e) {
            log.error("Failed to encode data event", e);
            return "";
        }
    }

    /**
     * Encode a SubAgentEvent for Data Stream Protocol v2.
     *
     * <p>All sub-agent inner events are emitted on the {@code 8:} data/annotation
     * channel as a typed {@code subagent_*} annotation (see
     * {@link #buildSubAgentAnnotation}). They never reuse the {@code 0:/9:/a:/g:}
     * main frames, so the root answer text stays clean and the frontend can build
     * the sub-agent tree by {@code agentId} / {@code parentAgentId}.
     */
    private String encodeSubAgentDataStream(SubAgentEvent event) {
        try {
            Map<String, Object> annotation = buildSubAgentAnnotation(event);
            return "8:" + objectMapper.writeValueAsString(
                    java.util.Collections.singletonList(annotation)) + "\n";
        } catch (JsonProcessingException e) {
            log.error("Failed to encode sub-agent data stream event", e);
            return "";
        }
    }

    // -------------------------------------------------------------------------
    // SSE Encoding (OpenAI-compatible) — raw string format
    // -------------------------------------------------------------------------

    /**
     * Encodes a StreamEvent to SSE format (OpenAI chat.completion.chunk
     * compatible). Returns the full SSE frame: {@code data: {...}\n\n}.
     * <p>
     * NOTE: This method should only be used in a WebFlux (reactive) context
     * where the framework writes strings directly to the response. In Spring MVC
     * with {@code SseEmitter}, use {@link #toSseData(StreamEvent)} instead to
     * avoid double-encoding.
     */
    public String encodeSse(StreamEvent event) {
        // SubAgentEvent: unwrap and delegate
        if (event instanceof SubAgentEvent) {
            return encodeSubAgentSse((SubAgentEvent) event);
        }
        if (event instanceof StreamEvent.TextEvent) {
            return encodeTextSse((StreamEvent.TextEvent) event);
        } else if (event instanceof StreamEvent.ReasoningEvent) {
            return encodeReasoningSse((StreamEvent.ReasoningEvent) event);
        } else if (event instanceof StreamEvent.ToolCallEvent) {
            return encodeToolCallSse((StreamEvent.ToolCallEvent) event);
        } else if (event instanceof StreamEvent.ToolResultEvent) {
            return encodeToolResultSse((StreamEvent.ToolResultEvent) event);
        } else if (event instanceof StreamEvent.FinishEvent) {
            return encodeFinishSse((StreamEvent.FinishEvent) event);
        } else if (event instanceof StreamEvent.ErrorEvent) {
            return encodeErrorSse((StreamEvent.ErrorEvent) event);
        } else if (event instanceof StreamEvent.DataEvent) {
            return encodeDataEventSse((StreamEvent.DataEvent) event);
        }
        return "";
    }

    private String encodeTextSse(StreamEvent.TextEvent event) {
        try {
            Map<String, Object> response = textEventToMap(event);
            return "data: " + objectMapper.writeValueAsString(response) + "\n\n";
        } catch (JsonProcessingException e) {
            log.error("Failed to encode text SSE", e);
            return "";
        }
    }

    private String encodeReasoningSse(StreamEvent.ReasoningEvent event) {
        try {
            Map<String, Object> response = reasoningEventToMap(event);
            return "data: " + objectMapper.writeValueAsString(response) + "\n\n";
        } catch (JsonProcessingException e) {
            log.error("Failed to encode reasoning SSE", e);
            return "";
        }
    }

    private String encodeToolCallSse(StreamEvent.ToolCallEvent event) {
        try {
            Map<String, Object> response = toolCallEventToMap(event);
            return "data: " + objectMapper.writeValueAsString(response) + "\n\n";
        } catch (JsonProcessingException e) {
            log.error("Failed to encode tool call SSE", e);
            return "";
        }
    }

    private String encodeToolResultSse(StreamEvent.ToolResultEvent event) {
        try {
            Map<String, Object> payload = toolResultEventToMap(event);
            return "data: " + objectMapper.writeValueAsString(payload) + "\n\n";
        } catch (JsonProcessingException e) {
            log.error("Failed to encode tool result SSE", e);
            return "";
        }
    }

    private String encodeFinishSse(StreamEvent.FinishEvent event) {
        try {
            Map<String, Object> response = finishEventToMap(event);
            return "data: " + objectMapper.writeValueAsString(response) + "\n\n"
                    + "data: [DONE]\n\n";
        } catch (JsonProcessingException e) {
            log.error("Failed to encode finish SSE", e);
            return "data: [DONE]\n\n";
        }
    }

    private String encodeErrorSse(StreamEvent.ErrorEvent event) {
        try {
            Map<String, Object> wrapper = errorEventToMap(event);
            return "data: " + objectMapper.writeValueAsString(wrapper) + "\n\n"
                    + "data: [DONE]\n\n";
        } catch (JsonProcessingException e) {
            log.error("Failed to encode error SSE", e);
            return "data: [DONE]\n\n";
        }
    }

    private String encodeDataEventSse(StreamEvent.DataEvent event) {
        try {
            Map<String, Object> response = dataEventToMap(event);
            return "data: " + objectMapper.writeValueAsString(response) + "\n\n";
        } catch (JsonProcessingException e) {
            log.error("Failed to encode data event SSE", e);
            return "";
        }
    }

    /**
     * Encode a SubAgentEvent for SSE format.
     * Injects agentId into the inner event's Map representation.
     */
    private String encodeSubAgentSse(SubAgentEvent event) {
        Object data = toSseData(event);
        if (data == null) {
            return "";
        }
        try {
            return "data: " + objectMapper.writeValueAsString(data) + "\n\n";
        } catch (JsonProcessingException e) {
            log.error("Failed to encode sub-agent SSE", e);
            return "";
        }
    }

    // -------------------------------------------------------------------------
    // SSE Data (for SseEmitter — no framing, avoids double-encoding)
    // -------------------------------------------------------------------------

    /**
     * Returns the SSE event data as an Object (Map) suitable for
     * {@code SseEmitter.event().data(object, MediaType.APPLICATION_JSON)}.
     * <p>
     * Unlike {@link #encodeSse(StreamEvent)} which returns a fully framed
     * SSE string, this method returns only the JSON-serializable payload
     * so that Spring MVC's {@code SseEmitter} can handle the framing
     * correctly and avoid double-encoding.
     *
     * @param event the stream event
     * @return the event data as a Map, or null if the event should be skipped
     */
    public Object toSseData(StreamEvent event) {
        // SubAgentEvent: unwrap and inject agentId
        if (event instanceof SubAgentEvent) {
            return subAgentEventToMap((SubAgentEvent) event);
        }
        if (event instanceof StreamEvent.TextEvent) {
            return textEventToMap((StreamEvent.TextEvent) event);
        } else if (event instanceof StreamEvent.ReasoningEvent) {
            return reasoningEventToMap((StreamEvent.ReasoningEvent) event);
        } else if (event instanceof StreamEvent.ToolCallEvent) {
            return toolCallEventToMap((StreamEvent.ToolCallEvent) event);
        } else if (event instanceof StreamEvent.ToolResultEvent) {
            return toolResultEventToMap((StreamEvent.ToolResultEvent) event);
        } else if (event instanceof StreamEvent.FinishEvent) {
            return finishEventToMap((StreamEvent.FinishEvent) event);
        } else if (event instanceof StreamEvent.ErrorEvent) {
            return errorEventToMap((StreamEvent.ErrorEvent) event);
        } else if (event instanceof StreamEvent.DataEvent) {
            return dataEventToMap((StreamEvent.DataEvent) event);
        }
        return null;
    }

    public boolean isFinishEvent(StreamEvent event) {
        return event instanceof StreamEvent.FinishEvent;
    }

    public boolean isErrorEvent(StreamEvent event) {
        return event instanceof StreamEvent.ErrorEvent;
    }

    // -------------------------------------------------------------------------
    // Shared Map builders (used by both encodeSse and toSseData)
    // -------------------------------------------------------------------------

    private Map<String, Object> textEventToMap(StreamEvent.TextEvent event) {
        Map<String, Object> delta = new LinkedHashMap<>();
        delta.put("content", event.getContent() != null ? event.getContent() : "");
        Map<String, Object> choice = new LinkedHashMap<>();
        choice.put("delta", delta);
        choice.put("finish_reason", null);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("choices", new Object[] { choice });
        return resp;
    }

    private Map<String, Object> reasoningEventToMap(StreamEvent.ReasoningEvent event) {
        Map<String, Object> delta = new LinkedHashMap<>();
        delta.put("reasoning_content", event.getReasoningContent() != null ? event.getReasoningContent() : "");
        Map<String, Object> choice = new LinkedHashMap<>();
        choice.put("delta", delta);
        choice.put("finish_reason", null);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("choices", new Object[] { choice });
        return resp;
    }

    private Map<String, Object> toolCallEventToMap(StreamEvent.ToolCallEvent event) {
        Map<String, Object> tc = new LinkedHashMap<>();
        tc.put("index", 0);
        tc.put("id", event.getToolCallId());
        tc.put("type", "function");
        Map<String, Object> fn = new LinkedHashMap<>();
        fn.put("name", event.getToolName());
        fn.put("arguments", event.getArgs() != null ? event.getArgs() : "{}");
        tc.put("function", fn);
        Map<String, Object> delta = new LinkedHashMap<>();
        delta.put("tool_calls", new Object[] { tc });
        Map<String, Object> choice = new LinkedHashMap<>();
        choice.put("delta", delta);
        choice.put("finish_reason", null);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("choices", new Object[] { choice });
        return resp;
    }

    private Map<String, Object> toolResultEventToMap(StreamEvent.ToolResultEvent event) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("tool_call_id", event.getToolCallId());
        p.put("result", event.getResult());
        return p;
    }

    private Map<String, Object> finishEventToMap(StreamEvent.FinishEvent event) {
        Map<String, Object> delta = new LinkedHashMap<>();
        Map<String, Object> choice = new LinkedHashMap<>();
        choice.put("delta", delta);
        choice.put("finish_reason", event.getFinishReason() != null ? event.getFinishReason() : "stop");
        Map<String, Object> usage = new LinkedHashMap<>();
        usage.put("prompt_tokens", event.getPromptTokens() != null ? event.getPromptTokens() : 0);
        usage.put("completion_tokens", event.getCompletionTokens() != null ? event.getCompletionTokens() : 0);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("choices", new Object[] { choice });
        resp.put("usage", usage);
        return resp;
    }

    private Map<String, Object> errorEventToMap(StreamEvent.ErrorEvent event) {
        Map<String, Object> wrapper = new LinkedHashMap<>();
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("message", event.getError() != null ? event.getError() : "Unknown error");
        // Optional structured fields — omitted when null so older clients
        // see the exact same payload as before.
        if (event.getCode() != null) {
            detail.put("code", event.getCode());
        }
        if (event.getRetriable() != null) {
            detail.put("retriable", event.getRetriable());
        }
        wrapper.put("error", detail);
        return wrapper;
    }

    private Map<String, Object> dataEventToMap(StreamEvent.DataEvent event) {
        Map<String, Object> delta = new LinkedHashMap<>();
        delta.put("annotations", event.getData());
        Map<String, Object> choice = new LinkedHashMap<>();
        choice.put("delta", delta);
        choice.put("finish_reason", null);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("choices", new Object[] { choice });
        return resp;
    }

    /**
     * Convert a SubAgentEvent to a Map for SSE emission.
     *
     * <p><b>All</b> sub-agent inner events are routed through the annotation
     * channel as a typed {@code subagent_*} annotation — they never reuse the
     * main text/tool frames. This keeps the root agent's answer text clean (a
     * sub-agent's tokens must not be concatenated into the main reply) and lets
     * the frontend attribute every event to a node in the sub-agent tree.
     */
    private Map<String, Object> subAgentEventToMap(SubAgentEvent event) {
        Map<String, Object> annotation = buildSubAgentAnnotation(event);
        Map<String, Object> delta = new LinkedHashMap<>();
        delta.put("annotations", java.util.Collections.singletonList(annotation));
        Map<String, Object> choice = new LinkedHashMap<>();
        choice.put("delta", delta);
        choice.put("finish_reason", null);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("choices", new Object[] { choice });
        return resp;
    }

    /**
     * Build the typed {@code subagent_*} annotation for a sub-agent event,
     * carrying the common identity header (agentId / parentAgentId / depth)
     * plus type-specific fields. Shared by the SSE and Data-Stream encoders.
     */
    private Map<String, Object> buildSubAgentAnnotation(SubAgentEvent event) {
        StreamEvent inner = event.getInner();
        Map<String, Object> ann = new LinkedHashMap<>();
        // Common identity header
        ann.put("agentId", event.getAgentId());
        ann.put("parentAgentId", event.getParentAgentId());
        ann.put("depth", event.getDepth());

        if (inner instanceof StreamEvent.TextEvent) {
            ann.put("type", "subagent_output");
            ann.put("content", nullToEmpty(((StreamEvent.TextEvent) inner).getContent()));
        } else if (inner instanceof StreamEvent.ReasoningEvent) {
            ann.put("type", "subagent_reasoning");
            ann.put("content", nullToEmpty(((StreamEvent.ReasoningEvent) inner).getReasoningContent()));
        } else if (inner instanceof StreamEvent.ToolCallEvent) {
            StreamEvent.ToolCallEvent tc = (StreamEvent.ToolCallEvent) inner;
            ann.put("type", "subagent_tool_call");
            ann.put("toolCallId", tc.getToolCallId());
            ann.put("toolName", tc.getToolName());
            ann.put("args", parseArgsOrRaw(tc.getArgs()));
        } else if (inner instanceof StreamEvent.ToolResultEvent) {
            StreamEvent.ToolResultEvent tr = (StreamEvent.ToolResultEvent) inner;
            ann.put("type", "subagent_tool_result");
            ann.put("toolCallId", tr.getToolCallId());
            ann.put("result", tr.getResult());
        } else if (inner instanceof StreamEvent.ErrorEvent) {
            StreamEvent.ErrorEvent ee = (StreamEvent.ErrorEvent) inner;
            ann.put("type", "subagent_error");
            ann.put("error", ee.getError() != null ? ee.getError() : "Unknown error");
        } else if (inner instanceof StreamEvent.FinishEvent) {
            StreamEvent.FinishEvent fe = (StreamEvent.FinishEvent) inner;
            ann.put("type", "subagent_finish");
            ann.put("finishReason", fe.getFinishReason() != null ? fe.getFinishReason() : "stop");
            if (fe.getPromptTokens() != null || fe.getCompletionTokens() != null) {
                Map<String, Object> usage = new LinkedHashMap<>();
                usage.put("promptTokens", fe.getPromptTokens() != null ? fe.getPromptTokens() : 0);
                usage.put("completionTokens", fe.getCompletionTokens() != null ? fe.getCompletionTokens() : 0);
                ann.put("usage", usage);
            }
        } else if (inner instanceof StreamEvent.DataEvent) {
            ann.put("type", "subagent_progress");
            ann.put("detail", ((StreamEvent.DataEvent) inner).getData());
        } else {
            ann.put("type", "subagent_event");
        }
        return ann;
    }

    private String nullToEmpty(String s) {
        return s != null ? s : "";
    }

    private Object parseArgsOrRaw(String args) {
        if (args == null || args.isEmpty()) {
            return new LinkedHashMap<String, Object>();
        }
        try {
            return objectMapper.readValue(args, Object.class);
        } catch (Exception e) {
            return args;
        }
    }

    // -------------------------------------------------------------------------
    // Utility methods
    // -------------------------------------------------------------------------

    private String escapeForDataStream(String content) {
        if (content == null) {
            return "";
        }
        return content.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    private String escapeForJson(String content) {
        if (content == null) {
            return "";
        }
        return content.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
