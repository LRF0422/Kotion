package com.knowledge.agent.core.web.dto;

import com.knowledge.agent.core.entity.AgentChatSessionGroupEntity;
import lombok.Data;

/**
 * API view of one conversation group. The database identity is never exposed;
 * {@code groupId} is the client-generated id the sidebar already stored.
 */
@Data
public class ChatSessionGroupView {

    private String groupId;

    private String name;

    private int sortIndex;

    private Long createdAt;

    private Long updatedAt;

    public static ChatSessionGroupView of(AgentChatSessionGroupEntity entity) {
        if (entity == null) {
            return null;
        }
        ChatSessionGroupView view = new ChatSessionGroupView();
        view.setGroupId(entity.getGroupId());
        view.setName(entity.getName());
        view.setSortIndex(entity.getSortIndex() != null ? entity.getSortIndex() : 0);
        view.setCreatedAt(entity.getCreateTime());
        view.setUpdatedAt(entity.getUpdateTime());
        return view;
    }
}