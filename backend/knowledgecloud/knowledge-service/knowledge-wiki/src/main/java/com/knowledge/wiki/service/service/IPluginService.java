package com.knowledge.wiki.service.service;

import java.util.List;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.version.service.ISubjectService;
import com.knowledge.wiki.service.entity.Plugin;
import com.knowledge.wiki.service.entity.PluginVersion;
import com.knowledge.wiki.service.entity.dto.QueryAdminPluginDTO;

public interface IPluginService extends ISubjectService<Plugin> {

    Plugin getByKey(String key);

    Plugin getByIdForUpdate(Long id);

    IPage<Plugin> pageAdminReviewPlugins(QueryAdminPluginDTO dto);

    void createPlugin(Plugin plugin, boolean publish);

    void installPlugin(Long versionId);

    void uninstallPlugin(Long versionId);

    void updatePluginToLatestVersion(Long pluginId);

    List<PluginVersion> getInstalledPlugins(String searchValue, Long userId);

    List<PluginVersion> checkInstall(Long pluginId);

    PluginVersion getActiveVersion(Long pluginId);

    void enablePlugin(Long versionId);

    void disablePlugin(Long versionId);

    void deleteInstalledPlugin(Long versionId);

}
