package com.knowledge.system.domain;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("knowledge_user_role")
public class UserRole extends TenantEntity {

    private Long id;
    private Long userId;
    private Long roleId;
    
}
