package com.knowledge.wiki.service.entity;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantEntity;
import com.knowledge.wiki.service.entity.enums.CollaboratorRole;

import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * Space Member Entity
 * Represents membership of a user in a team collaboration space
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("wiki_space_member")
public class SpaceMember extends TenantEntity {

    private Long id;

    /**
     * The space this membership belongs to
     */
    private Long spaceId;

    /**
     * The member user ID
     */
    private Long userId;

    /**
     * Role: OWNER, ADMIN, MEMBER, GUEST
     */
    private CollaboratorRole role;

    /**
     * When the user joined the space
     */
    private LocalDateTime joinedAt;

    /**
     * Who invited this member (user ID)
     */
    private Long invitedBy;

}
