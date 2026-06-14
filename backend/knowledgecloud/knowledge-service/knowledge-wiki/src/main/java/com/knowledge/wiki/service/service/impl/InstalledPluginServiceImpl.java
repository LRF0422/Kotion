package com.knowledge.wiki.service.service.impl;

import java.util.List;

import org.springframework.stereotype.Service;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.entity.InstalledPlugin;
import com.knowledge.wiki.service.entity.Plugin;
import com.knowledge.wiki.service.entity.PluginVersion;
import com.knowledge.wiki.service.entity.enums.InstalledPluginStatus;
import com.knowledge.wiki.service.mapper.InstalledPluginMapper;
import com.knowledge.wiki.service.service.IInstalledPluginService;

import cn.hutool.core.util.StrUtil;

@Service
public class InstalledPluginServiceImpl extends MPJBaseServiceImpl<InstalledPluginMapper, InstalledPlugin>
        implements IInstalledPluginService {

    @Override
    public void install(Plugin plugin, PluginVersion pluginVersion) {
        if (!checkInstalled(pluginVersion)) {
            InstalledPlugin installedPlugin = new InstalledPlugin();
            installedPlugin.setPluginId(pluginVersion.getSubjectId());
            installedPlugin.setPluginName(plugin.getName());
            installedPlugin.setVersionId(pluginVersion.getId());
            installedPlugin.setPluginVersion(pluginVersion.getVersion());
            installedPlugin.setStatus(InstalledPluginStatus.ACTIVE);
            this.save(installedPlugin);
        } else {
            this.lambdaUpdate()
                    .eq(InstalledPlugin::getPluginVersion, pluginVersion.getVersion())
                    .eq(InstalledPlugin::getPluginId, pluginVersion.getSubjectId())
                    .set(InstalledPlugin::getStatus, InstalledPluginStatus.ACTIVE)
                    .update();
        }
    }

    private boolean checkInstalled(PluginVersion pluginVersion) {
        return this.lambdaQuery()
                .eq(InstalledPlugin::getPluginVersion, pluginVersion.getVersion())
                .eq(InstalledPlugin::getPluginId, pluginVersion.getSubjectId())
                .exists();
    }

    @Override
    public void uninstall(Plugin plugin, PluginVersion pluginVersion) {
        this.lambdaUpdate()
                .eq(InstalledPlugin::getVersionId, pluginVersion.getId())
                .set(InstalledPlugin::getStatus, InstalledPluginStatus.UNINSTALLED)
                .update();
    }

    @Override
    public List<InstalledPlugin> getInstalledPlugins(String searchValue, Long userId) {
        return this.lambdaQuery()
                .like(StrUtil.isNotBlank(searchValue), InstalledPlugin::getPluginName, searchValue)
                .eq(InstalledPlugin::getStatus, InstalledPluginStatus.ACTIVE)
                .eq(userId != null, InstalledPlugin::getCreateUser, userId)
                .list();
    }

    @Override
    public void disable(Long installedPluginId) {
        this.lambdaUpdate()
                .eq(InstalledPlugin::getId, installedPluginId)
                .set(InstalledPlugin::getStatus, InstalledPluginStatus.DISABLED)
                .update();
    }

    @Override
    public List<InstalledPlugin> getByPluginId(Long pluginId, boolean active) {
        return this.lambdaQuery()
                .eq(InstalledPlugin::getPluginId, pluginId)
                .eq(active, InstalledPlugin::getStatus, InstalledPluginStatus.ACTIVE)
                .list();
    }

    @Override
    public void enable(Long pluginId) {
        this.lambdaUpdate()
                .eq(InstalledPlugin::getPluginId, pluginId)
                .ne(InstalledPlugin::getStatus, InstalledPluginStatus.UNINSTALLED)
                .set(InstalledPlugin::getStatus, InstalledPluginStatus.ACTIVE)
                .update();
    }

    @Override
    public void disableByPluginId(Long pluginId) {
        this.lambdaUpdate()
                .eq(InstalledPlugin::getPluginId, pluginId)
                .eq(InstalledPlugin::getStatus, InstalledPluginStatus.ACTIVE)
                .set(InstalledPlugin::getStatus, InstalledPluginStatus.DISABLED)
                .update();
    }

    @Override
    public void remove(Long pluginId) {
        this.lambdaUpdate()
                .eq(InstalledPlugin::getPluginId, pluginId)
                .remove();
    }

    @Override
    public InstalledPlugin getInstallRecord(Long pluginId) {
        return this.lambdaQuery()
                .eq(InstalledPlugin::getPluginId, pluginId)
                .ne(InstalledPlugin::getStatus, InstalledPluginStatus.UNINSTALLED)
                .orderByDesc(InstalledPlugin::getId)
                .last("limit 1")
                .one();
    }

}
