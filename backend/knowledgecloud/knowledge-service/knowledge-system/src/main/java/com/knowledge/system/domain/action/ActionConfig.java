package com.knowledge.system.domain.action;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName(("knowledge_action_config"))
public class ActionConfig extends TenantEntity {

    private Long id;
    private String dbName;
    private String tableName;
    private String urlConfig;
    private String iconConfig;
    private String titleConfig;
    private String descConfig;
    private String filter;
}
