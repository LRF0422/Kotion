package com.knowledge.wiki.service.entity;

import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class ShareDetail extends TenantEntity {
    private Long id;
    private Long shareId;
    private Long userId;
    private String nickName;
}
