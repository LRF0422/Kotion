package com.knowledge.wiki.service.entity;

import java.util.List;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantEntity;
import com.knowledge.wiki.service.entity.enums.SpacePermissionEnum;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("wiki_space_permission")
public class SpacePermission extends TenantEntity {

    private Long id;
    private Long userId;
    private Long spaceId;
    private List<SpacePermissionEnum> permissions;

}
