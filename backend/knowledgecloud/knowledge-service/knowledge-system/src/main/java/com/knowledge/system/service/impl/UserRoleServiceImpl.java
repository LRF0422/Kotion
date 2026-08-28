package com.knowledge.system.service.impl;

import java.util.List;
import java.util.stream.Collectors;

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

    @Override
    public List<Long> listRoleIds(Long userId, String scopeType, String scopeId) {
        return this.lambdaQuery()
                .eq(UserRole::getUserId, userId)
                .eq(scopeType != null, UserRole::getScopeType, scopeType)
                .eq(scopeId != null, UserRole::getScopeId, scopeId)
                .list()
                .stream()
                .map(UserRole::getRoleId)
                .distinct()
                .collect(Collectors.toList());
    }

}
