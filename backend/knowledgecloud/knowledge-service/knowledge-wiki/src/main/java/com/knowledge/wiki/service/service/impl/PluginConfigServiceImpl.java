package com.knowledge.wiki.service.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.entity.PluginConfig;
import com.knowledge.wiki.service.mapper.PluginConfigMapper;
import com.knowledge.wiki.service.service.IPluginConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class PluginConfigServiceImpl extends MPJBaseServiceImpl<PluginConfigMapper, PluginConfig>
        implements IPluginConfigService {

    @Override
    public PluginConfig getByUserIdAndPluginKey(Long userId, String pluginKey) {
        LambdaQueryWrapper<PluginConfig> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PluginConfig::getUserId, userId)
                .eq(PluginConfig::getPluginKey, pluginKey);
        return this.getOne(wrapper);
    }

    /**
     * Upsert a plugin config record.
     *
     * <p>
     * The unique index {@code uk_user_plugin(user_id, plugin_key)} guarantees
     * that a second concurrent INSERT will fail with {@link DuplicateKeyException}.
     * When this happens we re-read the existing row and fall back to an UPDATE,
     * which makes the whole operation idempotent and race-safe.
     * </p>
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public PluginConfig saveOrUpdate(Long userId, String pluginKey, Map<String, Object> config) {
        PluginConfig existing = getByUserIdAndPluginKey(userId, pluginKey);
        if (existing != null) {
            existing.setConfig(config);
            this.updateById(existing);
            return existing;
        }

        PluginConfig entity = new PluginConfig();
        entity.setUserId(userId);
        entity.setPluginKey(pluginKey);
        entity.setConfig(config);
        try {
            this.save(entity);
            return entity;
        } catch (DuplicateKeyException dup) {
            // Concurrent insert detected, another request won the race.
            log.warn("Concurrent save detected for user={}, pluginKey={}, falling back to update", userId, pluginKey);
            PluginConfig winner = getByUserIdAndPluginKey(userId, pluginKey);
            if (winner == null) {
                throw dup;
            }
            winner.setConfig(config);
            this.updateById(winner);
            return winner;
        }
    }

    @Override
    public List<PluginConfig> getAllByUserId(Long userId) {
        LambdaQueryWrapper<PluginConfig> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PluginConfig::getUserId, userId);
        return this.list(wrapper);
    }
}
