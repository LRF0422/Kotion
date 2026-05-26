package com.knowledge.system.domain;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("knowledge_watched_item")
public class WatchedItem extends TenantEntity {

    private Long id;
    private Long objectId;
    private String title;
    private String description;
    private String icon;
    private String scope;
    private String type;

}
