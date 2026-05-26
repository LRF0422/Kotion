package com.knowledge.core.version;

import com.baomidou.mybatisplus.annotation.TableId;
import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public abstract class BaseSubject extends TenantEntity {

    @TableId
    private Long id;
    private Long currentVersionId;
}
