package com.knowledge.wiki.service.service;

import java.util.List;

import com.github.yulichang.base.MPJBaseService;
import com.knowledge.wiki.service.entity.SpacePermission;
import com.knowledge.wiki.service.entity.enums.SpacePermissionEnum;

public interface ISpacePermissionService extends MPJBaseService<SpacePermission> {

    void addPermission(Long userId, Long spaceId, List<SpacePermissionEnum> permissions);

}
