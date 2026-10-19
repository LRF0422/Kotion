package com.knowledge.system.service.impl;

import org.springframework.stereotype.Service;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.system.domain.Developer;
import com.knowledge.system.mapper.DeveloperMapper;
import com.knowledge.system.service.IDeveloperService;

@Service
public class DeveloperServiceImpl extends MPJBaseServiceImpl<DeveloperMapper, Developer>
        implements IDeveloperService {

    @Override
    public Developer getByUserId(Long userId) {
        return this.baseMapper.selectByUserId(userId);
    }
}
