package com.knowledge.system.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.knowledge.system.domain.permission.GlobalRole;
import com.knowledge.system.mapper.GlobalRoleMapper;
import com.knowledge.system.service.IGlobalRoleService;
import org.springframework.stereotype.Service;

@Service
public class GlobalRoleServiceImpl extends ServiceImpl<GlobalRoleMapper, GlobalRole> implements IGlobalRoleService {
}
