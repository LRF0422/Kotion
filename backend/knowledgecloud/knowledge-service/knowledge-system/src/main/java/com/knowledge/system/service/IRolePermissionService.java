package com.knowledge.system.service;

import java.util.List;

import com.baomidou.mybatisplus.extension.service.IService;
import com.knowledge.system.domain.RolePermission;

public interface IRolePermissionService extends IService<RolePermission> {

    List<String> listPermissionCodes(List<Long> roleIds);
}
