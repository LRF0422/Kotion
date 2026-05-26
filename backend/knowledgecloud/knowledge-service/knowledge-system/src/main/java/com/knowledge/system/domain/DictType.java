package com.knowledge.system.domain;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("knowledge_dict_type")
public class DictType extends TenantEntity {

    private Long id;
    private String dictName;
    private String dictType;
    private String status;

}
