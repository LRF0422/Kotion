package com.knowledge.agent.core.web.dto;

import lombok.Data;

/**
 * Upsert payload for one conversation group. {@code name} is required (an
 * unnamed folder cannot be rendered); an absent {@code sortIndex} keeps the
 * stored position, or 0 for a group that does not exist yet.
 */
@Data
public class SaveChatSessionGroupRequest {

    private String name;

    private Integer sortIndex;
}