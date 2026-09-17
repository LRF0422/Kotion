package com.knowledge.wiki.service.service;

import com.github.yulichang.base.MPJBaseService;
import com.knowledge.wiki.service.entity.PluginConfig;

import java.util.List;

public interface IPluginConfigService extends MPJBaseService<PluginConfig> {

    PluginConfig getByUserIdAndPluginKey(Long userId, String pluginKey);

    /**
     * Upsert a plugin config record.
     *
     * @param config       non-sensitive configuration (credentials stripped out)
     * @param secretConfig AES-256-GCM encrypted credentials, or {@code null}
     * @return the persisted entity
     */
    PluginConfig saveOrUpdate(Long userId, String pluginKey, java.util.Map<String, Object> config, String secretConfig);

    List<PluginConfig> getAllByUserId(Long userId);
}
