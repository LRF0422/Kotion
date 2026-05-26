package com.knowledge.wiki.service.entity;

import java.time.LocalDateTime;

import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class Share extends TenantEntity {

    private Long id;
    private Long pageId;
    private LocalDateTime expireTime;

}
