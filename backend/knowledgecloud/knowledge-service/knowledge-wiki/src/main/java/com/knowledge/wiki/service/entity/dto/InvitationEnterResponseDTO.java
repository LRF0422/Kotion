package com.knowledge.wiki.service.entity.dto;

import lombok.Data;

/**
 * Response DTO for entering an accepted collaboration invitation.
 * POST /knowledge-wiki/collaboration/invitation/:token/enter
 *
 * <p>{@code contextId} is the tenant that owns the shared space. The client must
 * switch its session into that context before opening the normal page route,
 * otherwise every space/page read resolves against the wrong context and fails
 * with "空间不存在".
 */
@Data
public class InvitationEnterResponseDTO {
    private Long spaceId;
    private Long pageId;
    private String pageType;
    private String contextId;
    private String permission;
}
