package com.knowledge.wiki.service.service;

import com.github.yulichang.base.MPJBaseService;
import com.knowledge.wiki.service.entity.PluginRating;

public interface IPluginRatingService extends MPJBaseService<PluginRating> {

    long countByPlugin(Long pluginId);

    double averageScore(Long pluginId);
}
