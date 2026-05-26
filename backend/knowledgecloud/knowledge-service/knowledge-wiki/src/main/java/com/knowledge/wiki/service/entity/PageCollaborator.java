package com.knowledge.wiki.service.entity;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("wiki_page_collaborator")
public class PageCollaborator extends TenantEntity {

    private Long id;
    private Long pageId;
    private Long userId;
    private String permission;
    private Long invitedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}