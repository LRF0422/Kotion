package com.knowledge.wiki.service.service.impl;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.entity.PluginTag;
import com.knowledge.wiki.service.mapper.PluginTagMapper;
import com.knowledge.wiki.service.service.IPluginTagService;

import cn.hutool.core.collection.CollUtil;

@Service
public class PluginTagServiceImpl extends MPJBaseServiceImpl<PluginTagMapper, PluginTag> implements IPluginTagService {

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void replaceTags(Long pluginId, List<String> tags) {
        this.baseMapper.deletePhysicallyByPluginId(pluginId);
        if (CollUtil.isEmpty(tags)) {
            return;
        }
        List<PluginTag> entities = tags.stream().map(content -> {
            PluginTag tag = new PluginTag();
            tag.setPluginId(pluginId);
            tag.setContent(content);
            return tag;
        }).collect(Collectors.toList());
        this.saveBatch(entities);
    }

    @Override
    public List<String> listTagContents(Long pluginId) {
        return this.lambdaQuery().eq(PluginTag::getPluginId, pluginId)
                .orderByAsc(PluginTag::getId)
                .list()
                .stream()
                .map(PluginTag::getContent)
                .collect(Collectors.toList());
    }
}
