package com.knowledge.message.domain.watchable;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantItemImpl;
import lombok.Data;
import lombok.EqualsAndHashCode;

@EqualsAndHashCode(callSuper = true)
@Data
@TableName("knowledge_watched_object")
public class WatchedObject extends TenantItemImpl {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;
    private Long objectId;
    private Long watcherId;
    private String objectName;
    private String category;
}
