package com.knowledge.wiki.service.entity.dto;

import java.time.LocalDateTime;
import lombok.Data;

/**
 * Response DTO for accepting invitation
 * POST /knowledge-wiki/collaboration/invitation/:token/accept
 */
@Data
public class InvitationAcceptResponseDTO {
    private Boolean success;
    private Long pageId;
    private Long spaceId;
    private String pageType;
    private String permission;
    /** Tenant that owns the shared space; the client switches into it before opening the page. */
    private String contextId;
    private LocalDateTime acceptedAt;
}
