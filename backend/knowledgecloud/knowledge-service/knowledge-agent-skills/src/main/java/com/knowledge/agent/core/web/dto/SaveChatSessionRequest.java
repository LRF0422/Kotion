package com.knowledge.agent.core.web.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

/**
 * Upsert payload for one chat session. {@code messages} is optional: when
 * absent (or explicit JSON null) only metadata is written and the stored
 * message blob is preserved.
 */
@Data
public class SaveChatSessionRequest {

    private String title;

    private JsonNode targetPage;

    private JsonNode boundPage;

    /** Conversation group id; null / absent ungroups the session. */
    private String groupId;

    private JsonNode messages;

    private Long createdAt;

    private Long updatedAt;
}
