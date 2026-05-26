package com.knowledge.wiki.service.service.impl;

import org.springframework.stereotype.Service;

import com.knowledge.core.version.VersionStatus;
import com.knowledge.core.version.service.AbstractVersionService;
import com.knowledge.wiki.service.entity.Plugin;
import com.knowledge.wiki.service.entity.PluginVersion;
import com.knowledge.wiki.service.mapper.PluginVersionMapper;
import com.knowledge.wiki.service.service.IPluginVersionService;

import cn.hutool.core.util.StrUtil;

@Service
public class PluginVersionServiceImpl extends AbstractVersionService<Plugin, PluginVersion, PluginVersionMapper>
        implements IPluginVersionService {

    @Override
    public PluginVersion createVersion(Plugin subject, String lastVersion) {
        PluginVersion pluginVersion = new PluginVersion();
        pluginVersion
                .setVersion(StrUtil.isEmpty(lastVersion) ? "1" : String.valueOf((Integer.parseInt(lastVersion) + 1)));
        pluginVersion.setResourcePath(subject.getResourcePath());
        pluginVersion.setSubjectId(subject.getId());
        pluginVersion.setVersionDescription(subject.getVersionDescs());
        pluginVersion.setStatus(VersionStatus.DRAFT);
        this.save(pluginVersion);
        return pluginVersion;
    }

    @Override
    public boolean hasChange(Plugin version) {
        PluginVersion pluginVersion = this.getCurrentActiveVersion(version.getId());
        if (pluginVersion == null) {
            return true;
        }
        return !pluginVersion.getResourcePath().equals(version.getResourcePath());
    }

    @Override
    public void updateDraft(Plugin newValue, PluginVersion oldValue) {
        oldValue.setResourcePath(newValue.getResourcePath());
    }

}
