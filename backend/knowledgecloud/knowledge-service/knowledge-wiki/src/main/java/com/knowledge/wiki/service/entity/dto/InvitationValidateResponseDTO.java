package com.knowledge.wiki.service.entity.dto;

import java.time.LocalDateTime;
import lombok.Data;

/**
 * Response DTO for invitation validation
 * GET /knowledge-wiki/collaboration/invitation/:token/validate
 */
@Data
public class InvitationValidateResponseDTO {
    private Long id;
    private Long pageId;
    private Long spaceId;
    private String pageTitle;
    private String spaceName;
    private String inviterName;
    private Long inviterId;
    private String permission;
    private LocalDateTime expiresAt;
    private String status; // PENDING, ACCEPTED, EXPIRED, REVOKED
}
