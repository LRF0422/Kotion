package com.knowledge.agent.core.checkpoint;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

/**
 * Jackson codec for {@link Checkpoint} — one place owning the (de)serialization
 * so snapshots stay forward-compatible (unknown fields ignored on read).
 */
@Component
public class CheckpointCodec {

    private final ObjectMapper objectMapper;

    public CheckpointCodec(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public String toJson(Checkpoint checkpoint) {
        try {
            return objectMapper.writeValueAsString(checkpoint);
        } catch (Exception e) {
            throw new IllegalStateException("Checkpoint serialization failed", e);
        }
    }

    public Checkpoint fromJson(String json) {
        if (json == null || json.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.readValue(json, Checkpoint.class);
        } catch (Exception e) {
            throw new IllegalStateException("Checkpoint deserialization failed", e);
        }
    }
}
