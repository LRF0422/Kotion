package com.knowledge.system.service.impl;

import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.knowledge.system.domain.RolePermission;
import com.knowledge.system.mapper.RolePermissionMapper;
import com.knowledge.system.service.IRolePermissionService;

import cn.hutool.core.collection.CollUtil;

@Service
public class RolePermissionServiceImpl
        extends ServiceImpl<RolePermissionMapper, RolePermission>
        implements IRolePermissionService {

    @Override
    public List<String> listPermissionCodes(List<Long> roleIds) {
        if (CollUtil.isEmpty(roleIds)) {
            return Collections.emptyList();
        }
        return this.lambdaQuery()
                .in(RolePermission::getRoleId, roleIds)
                .list()
                .stream()
                .map(RolePermission::getPermissionCode)
                .filter(code -> code != null && !code.trim().isEmpty())
                .distinct()
                .collect(Collectors.toList());
    }
}
