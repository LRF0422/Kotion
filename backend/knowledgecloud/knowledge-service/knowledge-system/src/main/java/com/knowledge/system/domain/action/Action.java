package com.knowledge.system.domain.action;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("knowledge_action")
public class Action extends TenantEntity {

    private Long id;
    private String icon;
    private Long userId;
    private String nickName;
    private String title;
    private String description;
    private String actionUrl;
}
