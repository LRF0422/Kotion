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
    private LocalDateTime acceptedAt;
}
