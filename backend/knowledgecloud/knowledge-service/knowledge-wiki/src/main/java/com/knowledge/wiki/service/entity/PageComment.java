package com.knowledge.wiki.service.entity;

import java.util.List;
import java.util.Map;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * Page Comment Entity
 * Supports nested replies, @mentions, emoji reactions, and resolved status
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "wiki_page_comment", autoResultMap = true)
public class PageComment extends TenantEntity {

    private Long id;

    /**
     * The page this comment belongs to
     */
    private Long pageId;

    /**
     * Comment author user ID
     */
    private Long userId;

    /**
     * Comment content (supports Markdown)
     */
    private String content;

    /**
     * Parent comment ID for nested replies (null for top-level comments)
     */
    private Long parentId;

    /**
     * Mentioned user IDs (JSON array)
     */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Long> mentions;

    /**
     * Emoji reactions (JSON object: { "👍": [userId1, userId2], "❤️": [userId3] })
     */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, List<Long>> reactions;

    /**
     * Whether the comment thread is resolved
     */
    private Boolean resolved;

}
