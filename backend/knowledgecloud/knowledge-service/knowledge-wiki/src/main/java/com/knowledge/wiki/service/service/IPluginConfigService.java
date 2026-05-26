package com.knowledge.wiki.service.service;

import com.github.yulichang.base.MPJBaseService;
import com.knowledge.wiki.service.entity.PluginConfig;

import java.util.List;

public interface IPluginConfigService extends MPJBaseService<PluginConfig> {

    PluginConfig getByUserIdAndPluginKey(Long userId, String pluginKey);

    PluginConfig saveOrUpdate(Long userId, String pluginKey, java.util.Map<String, Object> config);

    List<PluginConfig> getAllByUserId(Long userId);
}
