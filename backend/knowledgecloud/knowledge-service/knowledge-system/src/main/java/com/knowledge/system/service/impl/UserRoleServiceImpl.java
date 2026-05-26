package com.knowledge.system.service.impl;

import org.springframework.stereotype.Service;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.system.domain.UserRole;
import com.knowledge.system.mapper.UserRoleMapper;
import com.knowledge.system.service.IUserRoleService;

@Service
public class UserRoleServiceImpl extends MPJBaseServiceImpl<UserRoleMapper, UserRole> implements IUserRoleService {

    @Override
    public boolean checkExists(Long userId, Long roleId) {
        return this.lambdaQuery()
                .eq(UserRole::getUserId, userId)
                .eq(UserRole::getRoleId, roleId)
                .exists();
    }

}
