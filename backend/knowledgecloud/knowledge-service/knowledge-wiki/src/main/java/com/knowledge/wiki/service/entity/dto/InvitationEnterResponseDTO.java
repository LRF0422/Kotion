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
    /**
     * True when the invitee was admitted to (or already belonged to) the context
     * that owns the space, so the client may switch into it. False means the client
     * must fall back to invitation-token-scoped editing instead.
     */
    private Boolean contextSwitchAllowed;
    /** Server reason when the context grant was rejected (shown to the invitee). */
    private String contextMessage;
    private String permission;
}
