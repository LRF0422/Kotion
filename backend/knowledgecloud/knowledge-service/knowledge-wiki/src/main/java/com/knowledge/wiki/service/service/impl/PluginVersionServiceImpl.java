package com.knowledge.wiki.service.service.impl;

import org.springframework.stereotype.Service;

import com.knowledge.core.version.VersionStatus;
import com.knowledge.core.version.service.AbstractVersionService;
import com.knowledge.wiki.service.entity.Plugin;
import com.knowledge.wiki.service.entity.PluginVersion;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.mapper.PluginVersionMapper;
import com.knowledge.wiki.service.service.IPluginVersionService;
import com.knowledge.wiki.service.util.PluginSubmissionValidator;

import cn.hutool.core.util.StrUtil;

@Service
public class PluginVersionServiceImpl extends AbstractVersionService<Plugin, PluginVersion, PluginVersionMapper>
        implements IPluginVersionService {

    @Override
    public void publish(Long versionId) {
        throw WikiException.PLUGIN_INVALID_STATE.newException("插件版本只能通过审核流程发布");
    }

    @Override
    public PluginVersion createVersion(Plugin subject, String lastVersion) {
        PluginVersion pluginVersion = new PluginVersion();
        pluginVersion.setVersion(StrUtil.isEmpty(lastVersion) ? "1.0.0"
                : PluginSubmissionValidator.nextPatchVersion(lastVersion));
        pluginVersion.setResourcePath(subject.getResourcePath());
        pluginVersion.setIntegrity(subject.getIntegrity());
        pluginVersion.setSubjectId(subject.getId());
        pluginVersion.setVersionDescription(subject.getVersionDescs());
        pluginVersion.setStatus(VersionStatus.DRAFT);
        pluginVersion.setReviewStatus(com.knowledge.wiki.service.entity.enums.PluginStatus.PENDING);
        this.save(pluginVersion);
        return pluginVersion;
    }

    @Override
    public boolean hasChange(Plugin version) {
        PluginVersion pluginVersion = this.getCurrentActiveVersion(version.getId());
        if (pluginVersion == null) {
            return true;
        }
        return !java.util.Objects.equals(pluginVersion.getResourcePath(), version.getResourcePath())
                || !java.util.Objects.equals(pluginVersion.getIntegrity(), version.getIntegrity());
    }

    @Override
    public void updateDraft(Plugin newValue, PluginVersion oldValue) {
        oldValue.setResourcePath(newValue.getResourcePath());
        oldValue.setIntegrity(newValue.getIntegrity());
        oldValue.setVersionDescription(newValue.getVersionDescs());
    }

    @Override
    public PluginVersion getPendingVersion(Long pluginId) {
        return this.lambdaQuery().eq(PluginVersion::getSubjectId, pluginId)
                .eq(PluginVersion::getStatus, VersionStatus.PENDING)
                .orderByDesc(PluginVersion::getId)
                .last("LIMIT 1")
                .one();
    }

    @Override
    public PluginVersion getRejectedCandidate(Long pluginId) {
        return this.lambdaQuery().eq(PluginVersion::getSubjectId, pluginId)
                .eq(PluginVersion::getStatus, VersionStatus.DRAFT)
                .orderByDesc(PluginVersion::getId)
                .last("LIMIT 1")
                .one();
    }

    @Override
    public PluginVersion getLatestVersion(Long pluginId) {
        return this.lambdaQuery().eq(PluginVersion::getSubjectId, pluginId)
                .orderByDesc(PluginVersion::getId)
                .last("LIMIT 1")
                .one();
    }

    @Override
    public boolean versionExists(Long pluginId, String version, Long excludeVersionId) {
        return this.lambdaQuery().eq(PluginVersion::getSubjectId, pluginId)
                .eq(PluginVersion::getVersion, version)
                .ne(excludeVersionId != null, PluginVersion::getId, excludeVersionId)
                .exists();
    }

    @Override
    public PluginVersion getByPluginIdAndVersion(Long pluginId, String version) {
        if ("latest".equalsIgnoreCase(version)) {
            return getCurrentActiveVersion(pluginId);
        }
        return this.lambdaQuery().eq(PluginVersion::getSubjectId, pluginId)
                .eq(PluginVersion::getVersion, version)
                .one();
    }

}
