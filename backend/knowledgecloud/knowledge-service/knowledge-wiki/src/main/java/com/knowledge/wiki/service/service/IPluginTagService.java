package com.knowledge.wiki.service.service;

import java.util.List;

import com.github.yulichang.base.MPJBaseService;
import com.knowledge.wiki.service.entity.PluginTag;

public interface IPluginTagService extends MPJBaseService<PluginTag> {

    void replaceTags(Long pluginId, List<String> tags);

    List<String> listTagContents(Long pluginId);
}
