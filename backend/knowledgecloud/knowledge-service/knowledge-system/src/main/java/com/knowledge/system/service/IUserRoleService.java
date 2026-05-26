package com.knowledge.system.service;

import com.github.yulichang.base.MPJBaseService;
import com.knowledge.system.domain.UserRole;

public interface IUserRoleService extends MPJBaseService<UserRole> {


    boolean checkExists(Long userId, Long roleId);
    
}
