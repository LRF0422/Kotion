package com.knowledge.wiki.service.service.impl;

import java.util.List;

import org.springframework.stereotype.Service;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.entity.SpacePermission;
import com.knowledge.wiki.service.entity.enums.SpacePermissionEnum;
import com.knowledge.wiki.service.mapper.SpacePermissionMapper;
import com.knowledge.wiki.service.service.ISpacePermissionService;

@Service
public class SpacePermissionServiceImpl extends MPJBaseServiceImpl<SpacePermissionMapper, SpacePermission>
        implements ISpacePermissionService {

        @Override
        public void addPermission(Long userId, Long spaceId, List<SpacePermissionEnum> permissions) {
                SpacePermission spacePermission = new SpacePermission();
                spacePermission.setPermissions(permissions);
                spacePermission.setUserId(userId);
                spacePermission.setSpaceId(spaceId);
                this.save(spacePermission);
        }

}
