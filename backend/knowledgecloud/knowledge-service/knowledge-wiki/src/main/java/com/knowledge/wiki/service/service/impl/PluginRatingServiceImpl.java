package com.knowledge.wiki.service.service.impl;

import org.springframework.stereotype.Service;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.entity.PluginRating;
import com.knowledge.wiki.service.mapper.PluginRatingMapper;
import com.knowledge.wiki.service.service.IPluginRatingService;

@Service
public class PluginRatingServiceImpl extends MPJBaseServiceImpl<PluginRatingMapper, PluginRating>
        implements IPluginRatingService {

    @Override
    public long countByPlugin(Long pluginId) {
        return this.baseMapper.countByPlugin(pluginId);
    }

    @Override
    public double averageScore(Long pluginId) {
        return this.baseMapper.averageScore(pluginId);
    }
}
