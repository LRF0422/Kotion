package com.knowledge.system.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.github.yulichang.base.MPJBaseService;
import com.knowledge.system.domain.permission.Permission;

public interface IPermissionService extends MPJBaseService<Permission> {

    void savePermission(Permission permission);
}
