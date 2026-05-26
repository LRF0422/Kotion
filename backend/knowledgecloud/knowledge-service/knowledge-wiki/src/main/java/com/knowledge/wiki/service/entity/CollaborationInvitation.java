package com.knowledge.wiki.service.entity;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantEntity;
import com.knowledge.wiki.service.entity.enums.InvitationStatus;

import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * Collaboration Invitation Entity
 * Represents an invitation to collaborate on a page/space
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "wiki_collaboration_invitation", autoResultMap = true)
public class CollaborationInvitation extends TenantEntity {

    private Long id;

    /**
     * Target page ID
     */
    private Long pageId;

    /**
     * Target space ID (can be null if page-level invitation)
     */
    private Long spaceId;

    /**
     * User being invited (invitee)
     */
    private Long inviteeId;

    /**
     * User who sent the invitation (inviter)
     */
    private Long inviterId;

    /**
     * Permission level: READ, WRITE, ADMIN
     */
    private String permission;

    /**
     * Invitation status: PENDING, ACCEPTED, REJECTED, EXPIRED
     */
    private InvitationStatus status = InvitationStatus.PENDING;

    /**
     * Optional message/note for the invitation
     */
    private String message;

    /**
     * Unique token for invitation link
     */
    private String token;

    /**
     * Expiration time (null means no expiration)
     */
    private LocalDateTime expiresAt;

    /**
     * When the invitation was created
     */
    private LocalDateTime createdAt;

    /**
     * When the invitation was last updated
     */
    private LocalDateTime updatedAt;

}
