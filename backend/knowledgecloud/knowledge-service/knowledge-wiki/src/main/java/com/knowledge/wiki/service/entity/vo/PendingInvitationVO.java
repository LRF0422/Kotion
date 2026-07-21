package com.knowledge.wiki.service.entity.vo;

import java.time.LocalDateTime;

import lombok.Data;

/**
 * A pending (not yet accepted) collaboration invitation of a space,
 * shown in the member management panel and revocable by admins.
 */
@Data
public class PendingInvitationVO {

    private Long id;
    private Long spaceId;
    private Long pageId;
    private String pageTitle;
    private Long inviteeId;
    private String inviteeName;
    private String inviteeEmail;
    private Long inviterId;
    private String inviterName;
    private String permission;
    private LocalDateTime createdAt;
    private LocalDateTime expiresAt;
}
