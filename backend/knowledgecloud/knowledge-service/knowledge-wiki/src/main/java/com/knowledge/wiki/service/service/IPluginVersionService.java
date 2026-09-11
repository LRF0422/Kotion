package com.knowledge.wiki.service.service;

import java.util.List;

import com.knowledge.core.version.service.IVersionService;
import com.knowledge.wiki.service.entity.Plugin;
import com.knowledge.wiki.service.entity.PluginVersion;

public interface IPluginVersionService extends IVersionService<Plugin, PluginVersion> {

    PluginVersion getPendingVersion(Long pluginId);

    PluginVersion getRejectedCandidate(Long pluginId);

    PluginVersion getLatestVersion(Long pluginId);

    boolean versionExists(Long pluginId, String version, Long excludeVersionId);

    /** Full version history of a plugin, newest first, for the review timeline. */
    List<PluginVersion> listVersions(Long pluginId);
}
