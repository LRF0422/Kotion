package com.knowledge.wiki.service.entity.dto;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import lombok.Data;

/**
 * Page Comment DTO - returned to frontend with user details
 */
@Data
public class PageCommentDTO {
    private Long id;
    private Long pageId;
    /** Page title (only populated in admin list) */
    private String pageTitle;
    private Long userId;
    private String userName;
    private String userAvatar;
    private String content;
    private Long parentId;
    private List<Long> mentions;
    private Map<String, List<Long>> reactions;
    private Boolean resolved;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    /** Nested replies (only for top-level comments) */
    private List<PageCommentDTO> replies;
}
