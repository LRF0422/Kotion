package com.knowledge.wiki.service.service.impl;

import org.springframework.stereotype.Service;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.entity.Developer;
import com.knowledge.wiki.service.mapper.DeveloperMapper;
import com.knowledge.wiki.service.service.IDeveloperService;

@Service
public class DeveloperServiceImpl extends MPJBaseServiceImpl<DeveloperMapper, Developer>
        implements IDeveloperService {

    @Override
    public Developer getByUserId(Long userId) {
        return this.baseMapper.selectByUserId(userId);
    }
}
