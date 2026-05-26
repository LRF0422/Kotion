package com.knowledge.core.agent.sdk;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;

import java.util.Collections;
import java.util.Map;

/**
 * Request payload for the skill invoke callback endpoint.
 *
 * <p>
 * When the agent service needs to run a skill tool that lives in a remote
 * microservice, it sends a POST to that service's
 * {@code /api/v1/agent-sdk/invoke} endpoint with this body.
 */
@Data
@Slf4j
public class SkillInvokeRequest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** The skill id (matches {@code SkillDefinition#id}). */
    private String skillId;

    /**
     * The tool name within the skill (matches {@code SkillDefinition#toolName}).
     */
    private String toolName;

    /** Named parameter map produced by the LLM function call. */
    @JsonAlias("arguments")
    @Setter(lombok.AccessLevel.NONE)
    private Map<String, Object> params;

    /**
     * The tenant ID of the user who initiated the request, for multi-tenant data
     * isolation.
     */
    private String tenantId;

    /** The user ID of the user who initiated the request, for auth/audit. */
    private Long userId;

    /**
     * Custom setter for the "params" key that handles both Map and
     * raw JSON string values.
     */
    @JsonSetter("params")
    @SuppressWarnings("unchecked")
    public void setParams(Object value) {
        this.params = parseParamsValue(value);
    }

    /**
     * Setter for the legacy "arguments" key that may arrive from older
     * RemoteToolInvoker versions. Delegates to the same parsing logic.
     */
    @JsonSetter("arguments")
    public void setArguments(Object value) {
        this.params = parseParamsValue(value);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseParamsValue(Object value) {
        if (value == null) {
            return null;
        } else if (value instanceof Map) {
            return (Map<String, Object>) value;
        } else if (value instanceof String) {
            String json = (String) value;
            if (json.isEmpty()) {
                return Collections.emptyMap();
            } else {
                try {
                    return MAPPER.readValue(json,
                            new TypeReference<Map<String, Object>>() {
                            });
                } catch (Exception e) {
                    log.warn("Failed to parse arguments as JSON map: {}", e.getMessage());
                    return Collections.emptyMap();
                }
            }
        } else {
            return Collections.emptyMap();
        }
    }
}
