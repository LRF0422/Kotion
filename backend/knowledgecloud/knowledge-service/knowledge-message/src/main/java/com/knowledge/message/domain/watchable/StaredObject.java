package com.knowledge.message.domain.watchable;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantItemImpl;
import lombok.Data;
import lombok.EqualsAndHashCode;

@EqualsAndHashCode(callSuper = true)
@Data
@TableName("knowledge_stared_object")
public class StaredObject extends TenantItemImpl {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;
    private Long objectId;
    private Long userId;
    private String objectName;
    private String category;
}
