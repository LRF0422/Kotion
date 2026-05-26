package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;
import java.time.LocalDateTime;

import com.knowledge.core.common.base.Icon;
import com.knowledge.wiki.service.entity.enums.PageStatus;

import lombok.Data;

/**
 * VO for pages that the user has been invited to collaborate on
 */
@Data
public class InvitedPageVO implements Serializable {

    // Page info
    private Long id;
    private Icon icon;
    private String title;
    private String description;
    private Long spaceId;
    private String spaceName;
    private PageStatus status;
    private String cover;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    // Collaboration info
    private String permission;
    private LocalDateTime invitedAt;
    private InvitedBy invitedBy;

    @Data
    public static class InvitedBy implements Serializable {
        private Long id;
        private String name;
    }
}
