package com.knowledge.agent.core.web.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.entity.AgentChatSessionEntity;
import lombok.Data;

/**
 * API view of one chat session. {@code messages} is only populated by the
 * detail endpoint; the list endpoint omits it to keep the index small.
 */
@Data
public class ChatSessionView {

    private String sessionId;

    private String title;

    private JsonNode targetPage;

    private JsonNode boundPage;

    private JsonNode messages;

    private int messageCount;

    private Long createdAt;

    private Long updatedAt;

    public static ChatSessionView of(AgentChatSessionEntity entity, ObjectMapper mapper,
                                     boolean includeMessages) {
        if (entity == null) {
            return null;
        }
        ChatSessionView view = new ChatSessionView();
        view.setSessionId(entity.getSessionId());
        view.setTitle(entity.getTitle());
        view.setTargetPage(read(mapper, entity.getTargetPageJson()));
        view.setBoundPage(read(mapper, entity.getBoundPageJson()));
        view.setMessageCount(entity.getMessageCount() != null ? entity.getMessageCount() : 0);
        view.setCreatedAt(entity.getCreateTime());
        view.setUpdatedAt(entity.getUpdateTime());
        if (includeMessages) {
            view.setMessages(read(mapper, entity.getMessagesJson()));
        }
        return view;
    }

    private static JsonNode read(ObjectMapper mapper, String json) {
        if (json == null || json.trim().isEmpty()) {
            return null;
        }
        try {
            return mapper.readTree(json);
        } catch (Exception e) {
            return null;
        }
    }
}
