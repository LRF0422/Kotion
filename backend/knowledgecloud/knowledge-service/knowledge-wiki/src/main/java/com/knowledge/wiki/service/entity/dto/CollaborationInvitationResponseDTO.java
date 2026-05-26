package com.knowledge.wiki.service.entity.dto;

import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;

/**
 * Response DTO for creating collaboration invitation
 * POST /knowledge-wiki/space/collaborationInvitation
 */
@Data
public class CollaborationInvitationResponseDTO {
    private Long invitationId;
    private String invitationToken;
    private String collaborateUrl;
    private Integer successCount;
    private List<String> failedEmails;
    private LocalDateTime createdAt;
}