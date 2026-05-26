package com.knowledge.system.service.impl;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.system.domain.permission.Permission;
import com.knowledge.system.mapper.PermissionMapper;
import com.knowledge.system.service.IPermissionService;
import org.springframework.stereotype.Service;

@Service
public class PermissionServiceImpl extends MPJBaseServiceImpl<PermissionMapper, Permission>
        implements IPermissionService {

    @Override
    public void savePermission(Permission permission) {
        if (!checkExists(permission)) {
            this.save(permission);
        }
    }

    private boolean checkExists(Permission permission) {
        return this.lambdaQuery()
                .eq(Permission::getRoleId, permission.getRoleId())
                .eq(Permission::getObjectId, permission.getObjectId())
                .exists();
    }
}
