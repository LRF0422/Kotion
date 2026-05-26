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
     * Unwraps the inner event and delegates to the type-specific encoder,
     * but injects {@code agentId} into the payload so the frontend can
     * attribute the event to the originating sub-agent.
     *
     * <p>For DataEvent and FinishEvent inner types, we fall back to
     * wrapping them as a generic data annotation with agentId so no
     * information is lost.
     */
    private String encodeSubAgentDataStream(SubAgentEvent event) {
        StreamEvent inner = event.getInner();
        String agentId = event.getAgentId();

        if (inner instanceof StreamEvent.TextEvent) {
            // Encode as text delta but inject agentId
            StreamEvent.TextEvent te = (StreamEvent.TextEvent) inner;
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("agentId", agentId);
                payload.put("content", te.getContent() != null ? te.getContent() : "");
                return "0:" + objectMapper.writeValueAsString(payload) + "\n";
            } catch (JsonProcessingException e) {
                return "";
            }
        } else if (inner instanceof StreamEvent.ReasoningEvent) {
            StreamEvent.ReasoningEvent re = (StreamEvent.ReasoningEvent) inner;
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("agentId", agentId);
                payload.put("reasoningContent", re.getReasoningContent() != null ? re.getReasoningContent() : "");
                return "g:" + objectMapper.writeValueAsString(payload) + "\n";
            } catch (JsonProcessingException e) {
                return "";
            }
        } else if (inner instanceof StreamEvent.ToolCallEvent) {
            StreamEvent.ToolCallEvent tc = (StreamEvent.ToolCallEvent) inner;
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("agentId", agentId);
                payload.put("toolCallId", tc.getToolCallId());
                payload.put("toolName", tc.getToolName());
                if (tc.getArgs() != null && !tc.getArgs().isEmpty()) {
                    try {
                        payload.put("args", objectMapper.readValue(tc.getArgs(), Object.class));
                    } catch (Exception ex) {
                        payload.put("args", tc.getArgs());
                    }
                } else {
                    payload.put("args", new LinkedHashMap<String, Object>());
                }
                return "9:" + objectMapper.writeValueAsString(payload) + "\n";
            } catch (JsonProcessingException e) {
                return "";
            }
        } else if (inner instanceof StreamEvent.ToolResultEvent) {
            StreamEvent.ToolResultEvent tr = (StreamEvent.ToolResultEvent) inner;
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("agentId", agentId);
                payload.put("toolCallId", tr.getToolCallId());
                payload.put("result", tr.getResult());
                return "a:" + objectMapper.writeValueAsString(payload) + "\n";
            } catch (JsonProcessingException e) {
                return "";
            }
        } else if (inner instanceof StreamEvent.ErrorEvent) {
            StreamEvent.ErrorEvent ee = (StreamEvent.ErrorEvent) inner;
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("agentId", agentId);
                payload.put("error", ee.getError() != null ? ee.getError() : "Unknown error");
                return "d:" + objectMapper.writeValueAsString(payload) + "\n";
            } catch (JsonProcessingException e) {
                return "";
            }
        } else if (inner instanceof StreamEvent.FinishEvent) {
            // Sub-agent finish: encode as data annotation so it doesn't
            // terminate the parent stream
            StreamEvent.FinishEvent fe = (StreamEvent.FinishEvent) inner;
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("type", "subagent_finish");
                payload.put("agentId", agentId);
                payload.put("finishReason", fe.getFinishReason() != null ? fe.getFinishReason() : "stop");
                if (fe.getPromptTokens() != null || fe.getCompletionTokens() != null) {
                    Map<String, Object> usage = new LinkedHashMap<>();
                    usage.put("promptTokens", fe.getPromptTokens() != null ? fe.getPromptTokens() : 0);
                    usage.put("completionTokens", fe.getCompletionTokens() != null ? fe.getCompletionTokens() : 0);
                    payload.put("usage", usage);
                }
                return "8:" + objectMapper.writeValueAsString(java.util.Collections.singletonList(payload)) + "\n";
            } catch (JsonProcessingException e) {
                return "";
            }
        } else if (inner instanceof StreamEvent.DataEvent) {
            // Wrap with agentId and emit as data annotation
            StreamEvent.DataEvent de = (StreamEvent.DataEvent) inner;
            try {
                Map<String, Object> wrapper = new LinkedHashMap<>();
                wrapper.put("agentId", agentId);
                wrapper.put("detail", de.getData());
                return "8:" + objectMapper.writeValueAsString(java.util.Collections.singletonList(wrapper)) + "\n";
            } catch (JsonProcessingException e) {
                return "";
            }
        }
        return "";
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
     * Unwraps the inner event, delegates to the appropriate toMap method,
     * and injects {@code agentId} into the resulting payload.
     *
     * <p>For FinishEvent inner types, wraps as a data annotation to avoid
     * prematurely terminating the parent SSE stream.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> subAgentEventToMap(SubAgentEvent event) {
        StreamEvent inner = event.getInner();
        String agentId = event.getAgentId();

        // FinishEvent from a sub-agent must NOT be encoded as a finish event
        // on the parent stream — it would close the SSE connection.
        // Instead, wrap it as a data annotation.
        if (inner instanceof StreamEvent.FinishEvent) {
            Map<String, Object> wrapper = new LinkedHashMap<>();
            wrapper.put("type", "subagent_finish");
            wrapper.put("agentId", agentId);
            wrapper.put("finishReason", ((StreamEvent.FinishEvent) inner).getFinishReason());
            Map<String, Object> delta = new LinkedHashMap<>();
            delta.put("annotations", java.util.Collections.singletonList(wrapper));
            Map<String, Object> choice = new LinkedHashMap<>();
            choice.put("delta", delta);
            choice.put("finish_reason", null);
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("choices", new Object[] { choice });
            return resp;
        }

        // For all other inner types, delegate to the existing toMap method
        // and inject agentId into the delta.
        Object innerMap = toSseData(inner);
        if (innerMap instanceof Map) {
            Map<String, Object> map = (Map<String, Object>) innerMap;
            Object choicesObj = map.get("choices");
            if (choicesObj instanceof Object[]) {
                Object[] choices = (Object[]) choicesObj;
                if (choices.length > 0 && choices[0] instanceof Map) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> choice = (Map<String, Object>) choices[0];
                    Object deltaObj = choice.get("delta");
                    if (deltaObj instanceof Map) {
                        ((Map<String, Object>) deltaObj).put("agentId", agentId);
                    }
                }
            }
            return map;
        }

        // Fallback: wrap as data annotation
        Map<String, Object> delta = new LinkedHashMap<>();
        delta.put("agentId", agentId);
        delta.put("annotations", innerMap);
        Map<String, Object> choice = new LinkedHashMap<>();
        choice.put("delta", delta);
        choice.put("finish_reason", null);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("choices", new Object[] { choice });
        return resp;
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
