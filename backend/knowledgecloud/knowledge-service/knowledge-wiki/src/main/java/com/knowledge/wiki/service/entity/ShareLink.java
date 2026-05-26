package com.knowledge.wiki.service.entity;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("wiki_share_link")
public class ShareLink extends TenantEntity {

    private Long id;
    private Long pageId;
    private String shortCode;
    private Long createdBy;
    private Boolean isPublic;
    private String permission;
    private LocalDateTime expiresAt;
    private LocalDateTime createdAt;
}