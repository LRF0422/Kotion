package com.knowledge.wiki.service.entity.dto;

import java.time.LocalDateTime;
import java.util.Map;

import lombok.Data;

/**
 * Space Activity DTO - returned to frontend
 */
@Data
public class SpaceActivityDTO {
    private Long id;
    private Long spaceId;
    private Long userId;
    private String userName;
    private String userAvatar;
    private String actionType;
    private String targetType;
    private String targetId;
    private Map<String, Object> metadata;
    private LocalDateTime createdAt;
}
