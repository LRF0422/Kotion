package com.knowledge.wiki.service.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.Map;

/**
 * Space Activity Entity
 * Records activity events within a team space for the activity feed
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "wiki_space_activity", autoResultMap = true)
public class SpaceActivity extends TenantEntity {

    private Long id;

    /**
     * The space this activity belongs to
     */
    private Long spaceId;

    /**
     * The user who performed the action
     */
    private Long userId;

    /**
     * Action type: PAGE_CREATED, PAGE_EDITED, PAGE_DELETED, PAGE_RESTORED,
     * MEMBER_JOINED, MEMBER_LEFT, MEMBER_ROLE_CHANGED,
     * COMMENT_ADDED, PAGE_PINNED, PAGE_UNPINNED
     */
    private String actionType;

    /**
     * Target entity type: PAGE, MEMBER, COMMENT
     */
    private String targetType;

    /**
     * Target entity ID
     */
    private String targetId;

    /**
     * Extra metadata in JSON format
     * e.g., { "pageTitle": "...", "memberName": "...", "oldRole": "...", "newRole":
     * "..." }
     */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, Object> metadata;

}
