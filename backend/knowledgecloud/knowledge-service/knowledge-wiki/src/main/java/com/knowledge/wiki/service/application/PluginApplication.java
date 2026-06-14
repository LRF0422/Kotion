package com.knowledge.wiki.service.application;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.github.yulichang.toolkit.MPJWrappers;
import com.github.yulichang.wrapper.MPJLambdaWrapper;
import com.knowledge.core.version.VersionStatus;
import com.knowledge.wiki.service.converter.PluginConverter;
import com.knowledge.wiki.service.converter.PluginVersionConverter;
import com.knowledge.wiki.service.entity.InstalledPlugin;
import com.knowledge.wiki.service.entity.Plugin;
import com.knowledge.wiki.service.entity.PluginLogo;
import com.knowledge.wiki.service.entity.PluginVersion;
import com.knowledge.wiki.service.entity.dto.PluginDTO;
import com.knowledge.wiki.service.entity.dto.QueryPluginDTO;
import com.knowledge.wiki.service.entity.vo.PluginVO;
import com.knowledge.wiki.service.entity.vo.PluginVersionVO;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.service.IInstalledPluginService;
import com.knowledge.wiki.service.service.IPluginService;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class PluginApplication {

    @Autowired
    private IPluginService pluginService;
    @Autowired
    private IInstalledPluginService installedPluginService;

    public void createPlugin(PluginDTO dto) {
        log.info("Creating plugin: {}", dto.getName());
        Plugin plugin = PluginConverter.INSTANCE.convertDO(dto);
        List<PluginLogo> logos = dto.getLogos();
        if (CollUtil.isNotEmpty(logos)) {
            plugin.setIcon(logos.get(0).getPath());
            plugin.setIconMd(logos.get(1).getPath());
        }
        pluginService.createPlugin(plugin, dto.isPublish());
        log.info("Plugin created successfully: {}", dto.getName());
    }

    public PluginVO detail(Long id) {
        Plugin plugin = this.pluginService.getById(id);
        if (plugin == null) {
            throw WikiException.PLUGIN_NOT_FOUND.newException();
        }
        PluginVersion activeVersion = this.pluginService.getActiveVersion(id);
        if (activeVersion == null) {
            throw WikiException.PLUGIN_VERSION_NOT_FOUND.newException();
        }
        PluginVO vo = PluginConverter.INSTANCE.convertVO(plugin);
        vo.setCurrentVersion(PluginVersionConverter.INSTANCE.convertVO(activeVersion));
        return vo;
    }

    public List<PluginVersionVO> getInstalledPlugins() {
        List<PluginVersion> installedPlugins = pluginService.getInstalledPlugins(null, null);
        return PluginVersionConverter.INSTANCE.convertVO(installedPlugins);
    }

    public void installPlugin(Long pluginVersionId) {
        this.pluginService.installPlugin(pluginVersionId);
    }

    public void uninstall(Long pluginVersionId) {
        this.pluginService.uninstallPlugin(pluginVersionId);
    }

    public IPage<PluginVO> searchPlugin(QueryPluginDTO dto) {
        MPJLambdaWrapper<Plugin> wrapper = MPJWrappers.lambdaJoin(Plugin.class);
        wrapper.leftJoin(PluginVersion.class, PluginVersion::getSubjectId, Plugin::getId)
                .like(StrUtil.isNotBlank(dto.getSearchValue()), Plugin::getName, dto.getSearchValue())
                .selectAll(Plugin.class)
                .selectAs(PluginVersion::getId, PluginVO::getCurrentVersionId)
                .selectAs(PluginVersion::getResourcePath, PluginVO::getResourcePath)
                .eq(dto.getCategory() != null, Plugin::getCategory, dto.getCategory())
                .eq(PluginVersion::getStatus, VersionStatus.ACTIVE);
        IPage<PluginVO> page = this.pluginService.selectJoinListPage(dto.page(), PluginVO.class, wrapper);
        page.getRecords().forEach(it -> {
            it.setInstalleddVersions(PluginVersionConverter.INSTANCE.convertVO(pluginService.checkInstall(it.getId())));
            InstalledPlugin record = installedPluginService.getInstallRecord(it.getId());
            it.setInstallStatus(record == null ? null : record.getStatus());
        });
        return page;
    }

    public void updatePluginToLatestVersion(Long pluginVersionId) {
        this.pluginService.updatePluginToLatestVersion(pluginVersionId);
    }

    public void enable(Long versionId) {
        this.pluginService.enablePlugin(versionId);
    }

    public void disable(Long versionId) {
        this.pluginService.disablePlugin(versionId);
    }

    public void deleteInstalled(Long versionId) {
        this.pluginService.deleteInstalledPlugin(versionId);
    }

}
