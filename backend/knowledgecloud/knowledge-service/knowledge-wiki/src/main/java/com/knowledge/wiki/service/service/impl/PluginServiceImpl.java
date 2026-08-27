package com.knowledge.wiki.service.service.impl;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.github.yulichang.toolkit.MPJWrappers;
import com.github.yulichang.wrapper.MPJLambdaWrapper;
import com.knowledge.core.version.service.AbstractSubjectService;
import com.knowledge.wiki.service.converter.PluginConverter;
import com.knowledge.wiki.service.entity.InstalledPlugin;
import com.knowledge.wiki.service.entity.Plugin;
import com.knowledge.wiki.service.entity.PluginVersion;
import com.knowledge.wiki.service.entity.dto.QueryAdminPluginDTO;
import com.knowledge.wiki.service.entity.enums.PluginStatus;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.mapper.PluginMapper;
import com.knowledge.wiki.service.service.IInstalledPluginService;
import com.knowledge.wiki.service.service.IPluginService;
import com.knowledge.wiki.service.service.IPluginTagService;
import com.knowledge.wiki.service.service.IPluginVersionService;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.collection.ListUtil;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class PluginServiceImpl extends AbstractSubjectService<PluginMapper, Plugin> implements IPluginService {

    @Autowired
    private IPluginVersionService pluginVersionService;
    @Autowired
    private IInstalledPluginService installedPluginService;
    @Autowired
    private IPluginTagService pluginTagService;

    @Override
    public List<PluginVersion> getInstalledPlugins(String searchValue, Long userId) {
        List<InstalledPlugin> installedPlugins = installedPluginService.getInstalledPlugins(searchValue, userId);
        if (CollUtil.isEmpty(installedPlugins)) {
            return CollUtil.newArrayList();
        }
        MPJLambdaWrapper<PluginVersion> wrapper = MPJWrappers.lambdaJoin(PluginVersion.class);
        wrapper.leftJoin(Plugin.class, Plugin::getId, PluginVersion::getSubjectId)
                .selectAs(Plugin::getName, PluginVersion::getName)
                .selectAs(Plugin::getPluginKey, PluginVersion::getPluginKey)
                .selectAs(Plugin::getIcon, PluginVersion::getIcon)
                .selectAs(Plugin::getDescription, PluginVersion::getDescription)
                .selectAs(PluginVersion::getSubjectId, PluginVersion::getSubjectId)
                .select(PluginVersion::getResourcePath, PluginVersion::getResourcePath)
                .selectAs(PluginVersion::getIntegrity, PluginVersion::getIntegrity)
                .selectAs(PluginVersion::getVersion, PluginVersion::getVersion)
                .selectAs(PluginVersion::getId, PluginVersion::getId)
                .selectAs(PluginVersion::getActiveVersionId, PluginVersion::getActiveVersionId)
                .selectAs(PluginVersion::getVersionDescription, PluginVersion::getVersionDescription)
                .selectAs(PluginVersion::getSubjectId, PluginVersion::getSubjectId)
                .in(PluginVersion::getId,
                        installedPlugins.stream().map(it -> it.getVersionId()).collect(Collectors.toList()));
        List<PluginVersion> pluginVersions = this.pluginVersionService
                .selectJoinList(PluginVersion.class, wrapper);
        pluginVersions.forEach(it -> {
            PluginVersion current = getActiveVersion(it.getSubjectId());
            it.setActiveVersionId(current.getId());
        });
        return pluginVersions;
    }

    @Override
    public Plugin getByKey(String key) {
        return this.lambdaQuery().eq(Plugin::getPluginKey, key)
                .one();
    }

    @Override
    public Plugin getByIdForUpdate(Long id) {
        return this.baseMapper.selectByIdForUpdate(id);
    }

    @Override
    public IPage<Plugin> pageAdminReviewPlugins(QueryAdminPluginDTO dto) {
        return this.baseMapper.selectAdminReviewPage(dto.page(), dto);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void createPlugin(Plugin plugin, boolean publish) {
        if (plugin.getId() == null) {
            if (this.getByKey(plugin.getPluginKey()) != null) {
                throw WikiException.PLUGIN_EXISTS.newException();
            }
            log.debug("Creating new plugin: {}", plugin.getPluginKey());
            plugin.setStatus(PluginStatus.PENDING);
            this.save(plugin);
        } else {
            log.debug("Updating plugin by ID: {}", plugin.getId());
            Plugin db = this.getById(plugin.getId());
            if (db == null) {
                throw WikiException.PLUGIN_NOT_FOUND.newException();
            }
            PluginConverter.INSTANCE.update(plugin, db);
            this.updateById(db);
            plugin = db;
        }
        PluginVersion draft = this.pluginVersionService.getPendingVersion(plugin.getId());
        if (draft == null) {
            draft = this.pluginVersionService.createOrSaveDraft(plugin);
        } else {
            draft.setResourcePath(plugin.getResourcePath());
            draft.setIntegrity(plugin.getIntegrity());
            draft.setVersionDescription(plugin.getVersionDescs());
        }
        draft.setStatus(com.knowledge.core.version.VersionStatus.PENDING);
        this.pluginVersionService.updateById(draft);
        plugin.setStatus(PluginStatus.PENDING);
        this.updateById(plugin);
    }

    @Override
    public void installPlugin(Long versionId) {
        if (versionId == null) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        PluginVersion pluginVersion = pluginVersionService.getById(versionId);
        if (pluginVersion == null) {
            throw WikiException.PLUGIN_VERSION_NOT_FOUND.newException();
        }
        Plugin plugin = this.getById(pluginVersion.getSubjectId());
        if (plugin == null) {
            throw WikiException.PLUGIN_NOT_FOUND.newException();
        }
        updateDownloads(plugin);
        installedPluginService.install(plugin, pluginVersion);
    }

    private void updateDownloads(Plugin plugin) {
        this.lambdaUpdate()
                .eq(Plugin::getId, plugin.getId())
                .set(Plugin::getDownloads, plugin.getDownloads() + 1)
                .update();
    }

    @Override
    public void uninstallPlugin(Long versionId) {
        PluginVersion pluginVersion = pluginVersionService.getById(versionId);
        if (pluginVersion == null) {
            throw WikiException.PLUGIN_VERSION_NOT_FOUND.newException();
        }
        Plugin plugin = resolvePlugin(versionId);
        installedPluginService.uninstall(plugin, pluginVersion);
    }

    /**
     * Resolve the owning {@link Plugin} from a plugin version id, validating each
     * step the same way install/uninstall do.
     */
    private Plugin resolvePlugin(Long versionId) {
        if (versionId == null) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        PluginVersion pluginVersion = pluginVersionService.getById(versionId);
        if (pluginVersion == null) {
            throw WikiException.PLUGIN_VERSION_NOT_FOUND.newException();
        }
        Plugin plugin = this.getById(pluginVersion.getSubjectId());
        if (plugin == null) {
            throw WikiException.PLUGIN_NOT_FOUND.newException();
        }
        return plugin;
    }

    @Override
    public void enablePlugin(Long versionId) {
        installedPluginService.enable(resolvePlugin(versionId).getId());
    }

    @Override
    public void disablePlugin(Long versionId) {
        installedPluginService.disableByPluginId(resolvePlugin(versionId).getId());
    }

    @Override
    public void deleteInstalledPlugin(Long versionId) {
        installedPluginService.remove(resolvePlugin(versionId).getId());
    }

    @Override
    public List<PluginVersion> checkInstall(Long pluginId) {
        List<InstalledPlugin> installedPlugins = installedPluginService.getByPluginId(pluginId, true);
        if (CollUtil.isNotEmpty(installedPlugins)) {
            return this.pluginVersionService
                    .listByIds(installedPlugins.stream().map(it -> it.getVersionId()).collect(Collectors.toList()));
        }
        return ListUtil.empty();
    }

    @Override
    public PluginVersion getActiveVersion(Long pluginId) {
        return this.pluginVersionService.getCurrentActiveVersion(pluginId);
    }

    @Override
    public void updatePluginToLatestVersion(Long pluginVersionId) {
        PluginVersion current = this.pluginVersionService.getById(pluginVersionId);
        PluginVersion pluginVersion = this.pluginVersionService.getCurrentActiveVersion(current.getSubjectId());
        uninstallPlugin(pluginVersionId);
        installPlugin(pluginVersion.getId());
    }

}
