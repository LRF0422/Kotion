package com.knowledge.wiki.service.service;

import java.util.List;

import com.github.yulichang.base.MPJBaseService;
import com.knowledge.wiki.service.entity.InstalledPlugin;
import com.knowledge.wiki.service.entity.Plugin;
import com.knowledge.wiki.service.entity.PluginVersion;

public interface IInstalledPluginService extends MPJBaseService<InstalledPlugin> {

    void install(Plugin plugin, PluginVersion pluginVersion);

    void uninstall(Plugin plugin, PluginVersion pluginVersion);

    List<InstalledPlugin> getInstalledPlugins(String searchValue, Long userId);

    void disable(Long installedPluginId);

    List<InstalledPlugin> getByPluginId(Long pluginId, boolean active);

    /** Re-activate an installed plugin (any non-uninstalled row) by pluginId. */
    void enable(Long pluginId);

    /** Disable the active installed plugin by pluginId. */
    void disableByPluginId(Long pluginId);

    /** Remove the install record(s) of a plugin by pluginId. */
    void remove(Long pluginId);

    /** Latest non-uninstalled install record of a plugin, or null. */
    InstalledPlugin getInstallRecord(Long pluginId);

}
